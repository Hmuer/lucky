# 双色球守号监控

> 数据源：中国福利彩票（中彩网 [cwl.gov.cn](https://www.cwl.gov.cn/)）
> 数据存储：腾讯云 TDSQL-C（MySQL 8.0），连接串只放本地 `.env.local`
> 仅供个人记账核对，非投注平台。彩票有风险，量力而行。

自动监控每一期双色球开奖号码，按你设置的守号（单式 / 复式 / 胆拖）自动核对，
累计盈亏、回本率走势。本仓库仅含 Web 端 + 自动同步逻辑，不代替你去购买。

---

## 目录

- [功能特性](#功能特性)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [启动脚本](#启动脚本)
- [systemd 服务（Linux）](#systemd-服务linux)
- [升级与重新部署](#升级与重新部署)
- [页面与操作指南](#页面与操作指南)
- [支持的玩法](#支持的玩法)
- [奖级与金额规则](#奖级与金额规则)
- [数据存储（TDSQL-C MySQL）](#数据存储tdsql-c-mysql)
- [微信小程序多用户](#微信小程序多用户)
- [同步与成本控制](#同步与成本控制)
- [引擎单测](#引擎单测)
- [常见问题](#常见问题)
- [目录结构](#目录结构)
- [风险与免责](#风险与免责)

---

## 功能特性

- **官方源爬取**：从 `cwl.gov.cn` 的公开 JSON 接口拉取开奖与奖级（含一/二等浮动金额）
- **三种玩法**：单式（6红+1蓝）/ 复式（6~20红 × 1~16蓝）/ 胆拖（1~5红胆 + 红拖 × 1~16蓝）
- **按单注展开核对**：复式/胆拖自动展开成所有单注，与开奖逐一比对，按官方奖级表累计奖金
- **Web 管理**：守号增删改、每期购买开关、单注金额
- **开奖记录**：每期开奖号 + 各守号命中明细 + 当期盈亏
- **盈亏统计**：累计花费、累计中奖、回本率、走势曲线（Recharts）
- **守号历史中奖统计**：按守号聚合 1~6 等各中几注、单期最高奖金、累计花费/中奖/盈亏
- **微信小程序多用户**：微信登录、JWT 鉴权、按用户隔离守号/核对/统计、订阅消息推送；契约见 [docs/wx-api.md](docs/wx-api.md)
- **自动同步**：
  - 首次启动自动回填中彩网当前可提供的全部历史期（2013 年至今，约 2,000 期）
  - 开奖日（周二/四/日）21:30 起每 10 分钟检查，拿到新期即停止并推送
  - 首页"立即同步开奖"按钮可手动触发增量同步

---

## 环境要求

| 项目 | 版本 |
|---|---|
| Node.js | 22.x（项目内 `.runtime`，由 `.node-version` 锁定） |
| npm | ≥ 9（随项目内 Node 提供） |
| 数据库 | MySQL 8.0（腾讯云 TDSQL-C），需可访问实例端口 |
| 微信 | 小程序 AppID/Secret、订阅消息模板 ID，需在微信公众平台配置 |
| 系统 | Linux / macOS / Windows (WSL) |
| 网络 | 可访问 `cwl.gov.cn`、`nodejs.org`，以及 TDSQL-C 实例端口 |

> 项目不依赖宿主机 Node。`./scripts/bootstrap-node.sh` 会按 `.node-version`
> 下载官方 Node 到 `.runtime/`（约 200MB，已 gitignore），安装/构建/运行都用它。
> 直接执行 `npm install` 时，`preinstall` 会拦截主版本不匹配的 Node。

检查环境（首次需先引导）：

```bash
./scripts/bootstrap-node.sh
.runtime/node/bin/node -v
./scripts/npm.sh -v
```

---

## 快速开始

### 1. 拉取仓库

```bash
# HTTPS（推荐）
git clone https://github.com/Hmuer/lucky.git
cd lucky

# 或者 SSH
git clone git@github.com:Hmuer/lucky.git
cd lucky

# 如果你 fork 到了自己仓库，把 Hmuer 替换成你的用户名
```

### 2. 安装项目内 Node 与依赖

```bash
./scripts/bootstrap-node.sh
./scripts/npm.sh ci
```

`bootstrap-node.sh` 会按 `.node-version` 下载对应平台的官方 Node，
校验 SHA256 后解压到 `.runtime/`（约 200MB，已 gitignore）。
国内网络可指定镜像：

```bash
NODE_MIRROR=https://npmmirror.com/mirrors/node ./scripts/bootstrap-node.sh
```

首次安装 Node + 依赖约 1~3 分钟。不要用宿主机 Node 直接 `npm install`，
`preinstall` 会检查主版本并拦截。

### 3. 配置 TDSQL-C MySQL

```bash
cp .env.example .env.local
# 编辑 .env.local，填入 DATABASE_URL
```

`.env.local` 已被 gitignore，不会提交。连接串格式：

```text
DATABASE_URL=mysql://用户名:密码@主机:3306/lucky
```

同时填写小程序相关变量（见 `.env.example`）：

```text
WX_APPID=...
WX_APPSECRET=...
JWT_SECRET=...            # openssl rand -hex 32
CRON_SECRET=...           # openssl rand -hex 32
WX_SUBSCRIBE_TEMPLATE_ID=...
DEFAULT_USER_OPENID=__default__
```

如果 `lucky` 库还不存在，先在 TDSQL-C 执行：

```sql
CREATE DATABASE lucky CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

首次访问时应用会自动建表。已有数据库升级到多用户模型：

```bash
./scripts/npm.sh run migrate:multiuser
```

该脚本会创建 `users` / `subscriptions`，给 `bets` / `hit_records` 加 `user_id`，
并把存量数据归属到 `DEFAULT_USER_OPENID`（缺省 `__default__`），不影响网页端数据。

如果还有旧版 SQLite 数据，执行：

```bash
./scripts/npm.sh run migrate:mysql
```

迁移会校验行数与金额合计；本部署已将 `data/ssq.db` 归档到 `/opt/lucky/backups/`，并删除项目内文件。

### 4. 启动 Web 服务

任选一种方式：

```bash
# 方式 A：一键脚本（开发/临时运行，自动后台启动 + 就绪检测）
./start.sh

# 方式 B：直接用项目内 npm（开发模式）
./scripts/npm.sh run dev
```

启动成功后访问：**http://localhost:3000**

生产环境建议使用下面的 systemd 服务。systemd 直接托管前台进程，服务异常退出会自动重启，并可配置为开机自启。

### 5. 首次同步开奖数据

首次启动时会**自动**从中彩网拉取当前可提供的全部历史期（2013 年至今，约 2,000 期）写入 MySQL，
通常几十秒内完成（取决于网络和数据库延迟）。

完成后会立刻对所有启用守号做一次全量核对。

如果想补齐最新开奖：在首页手动点 **"立即同步开奖"**；没有新期时不会写库。

> 中彩网接口目前只返回 2013 年及之后的开奖数据（更早期数据需接入其它数据源），
> 因此库内最早期号约为 `2013001`。回填完成后会写入 `app_meta.history_backfilled=1`，
> 之后启动只做增量同步；如需重新回填，清空 MySQL 的 `draws`/`hit_records` 并删除
> `app_meta` 中的 `history_backfilled` 后重启。

### 6. 添加守号

进入 **守号管理** → 选玩法（单式/复式/胆拖）→ 点号码球选号 → 填写名称 → 保存。
勾选 **"每期购买"** 的守号才会参与自动核对。

---

## 启动脚本

`./start.sh` 是项目根目录的一键启动脚本，支持以下子命令：

| 命令 | 说明 |
|---|---|
| `./start.sh` 或 `./start.sh start` | 后台启动 Web，访问 :3000 |
| `./start.sh fg` | 前台启动 Web（Ctrl+C 退出） |
| `./start.sh status` | 查看进程 / 日志 / 数据库状态 |
| `./start.sh logs` | 跟踪 Web 日志（Ctrl+C 退出） |
| `./start.sh stop` | 停止 Web 进程 |
| `./start.sh test` | 跑引擎单测 |
| `./start.sh reset` | 查看 MySQL 清理说明（不再删除数据库） |

PID 文件：`logs/web.pid`（仅 `start.sh` 开发模式）
日志文件：`logs/web.log`（仅 `start.sh` 开发模式，每次启动会重写）

> `logs/web.log` 只对应 `next dev`。生产环境由 systemd 托管，日志统一进 journald，
> 请用 `journalctl -u lucky.service -f` 查看，不要用开发日志排查线上问题。

> 定时同步已内置在 Web 进程内（仅开奖日检查），无需额外启动 cron 进程。
> 老版本里的 `./start.sh all` / `all-fg` 已被移除。

Windows 建议使用 WSL；原生 Windows 没有 bash 时，请手动安装 Node 22 后再执行 `npm run dev`（主版本必须为 22）。

## systemd 服务（Linux）

仓库内的 [`lucky.service`](lucky.service) 已按当前部署目录 `/opt/lucky/lucky` 配置，通过 `./scripts/npm.sh` 使用项目内 Node 22 运行生产构建。首次安装或代码更新后，在项目目录执行：

```bash
# 1. 安装/更新项目内 Node（.node-version 变化时才会重新下载）
./scripts/bootstrap-node.sh

# 2. 配置数据库（首次；之后保留 .env.local 即可）
cp .env.example .env.local
# 编辑 .env.local 填入 DATABASE_URL

# 3. 安装依赖并生成生产构建
./scripts/npm.sh ci
./scripts/npm.sh run build

# 4. 安装服务单元
sudo cp lucky.service /etc/systemd/system/lucky.service
sudo systemctl daemon-reload

# 立即启动，并设置为开机自动启动
sudo systemctl enable --now lucky.service
```

检查运行状态和日志：

```bash
sudo systemctl status lucky.service
sudo journalctl -u lucky.service -f
```

常用运维命令：

```bash
# 标准升级（拉取/装依赖/构建/重启/健康检查）
./deploy.sh

# 只重启
sudo systemctl restart lucky.service
sudo systemctl stop lucky.service
sudo systemctl disable lucky.service  # 取消开机自启
```

如果项目目录或运行用户不同，请在复制服务文件前修改 `WorkingDirectory`、`User`、`Group`、`PATH` 和 `ExecStart`。`ExecStart` 指向项目内 `./scripts/npm.sh`，`PATH` 也把 `.runtime/node/bin` 放在最前，因此服务完全不依赖宿主机的 `node`/`npm`。`EnvironmentFile` 会读取项目内 `.env.local` 的 `DATABASE_URL`；业务数据保存在 TDSQL-C，日志由 systemd journal 统一收集。

---

## 升级与重新部署

服务器入口：

```bash
bash /opt/lucky/reinstall.sh
```

它只是本地入口，实际执行仓库内的 `./deploy.sh`。其他部署环境可直接：

```bash
cd /path/to/lucky
./deploy.sh
```

`deploy.sh` 的流程：

1. 检查 `git status`，有未提交修改则停止
2. 检查 `.env.local` 是否存在
3. `git pull --ff-only origin main`
4. `./scripts/bootstrap-node.sh`（版本未变会跳过下载）
5. `./scripts/npm.sh ci`
6. `./scripts/npm.sh run build`
7. 同步 `lucky.service` 到 `/etc/systemd/system/` 并重启
8. 轮询 `/api/health`，失败时打印 `systemctl status` 与 `journalctl`

> 不会删除 `data/`、`.runtime/`、`logs/`、`.env.local`，脚本里没有 `rm -rf`；`git pull` 也不会覆盖这些 gitignore 文件。业务数据在 TDSQL-C，部署不会清库。部署脚本要求以 root 运行。

手动等价命令：

```bash
git pull --ff-only origin main
./scripts/bootstrap-node.sh
./scripts/npm.sh ci
./scripts/npm.sh run build
sudo cp lucky.service /etc/systemd/system/lucky.service
sudo systemctl daemon-reload
sudo systemctl restart lucky.service
curl --fail http://127.0.0.1:3000/api/health
```

---

## 页面与操作指南

### 首页（`/`）
- 最近一期开奖号码（含销售额、奖池、一/二等金额）
- 当期各守号命中明细（花费 / 命中注数 / 奖金 / 盈亏）
- "立即同步开奖" + "补录指定期" 按钮

### 守号管理（`/bets`）
- 切换 单式 / 复式 / 胆拖 三种模式
- 点号码球选号（红球 1~33，蓝球 1~16；点亮的为已选）
- **每期购买** 开关：开启后该守号会参与每期自动核对
- **启用** 开关：停用后不参与核对，但保留记录
- **单注金额**：默认 2 元，单位"元"
- **历史中奖徽章**：每个守号行下方展示 1~6 等命中次数 + 参与期数 / 中奖期数 / 盈亏

### 开奖记录（`/history`）
- 按期倒序展示所有期
- 每期展开：开奖号 + 各守号命中注数（如"3等×2 / 5等×1"）+ 当期盈亏

### 统计（`/stats`）
- 汇总：累计期数 / 花费 / 中奖 / 盈亏 / 回本率
- 走势：累计花费、累计中奖、累计盈亏三条曲线
- **各守号历史中奖统计**：按守号列出 1~6 等命中次数（着色徽章）、参与期数、累计花费/中奖、盈亏、单期最高奖金；按奖级优先级排序

---

## 支持的玩法

| 玩法 | 红球 | 蓝球 | 投注数 |
|---|---|---|---|
| 单式 | 6 个 | 1 个 | 1 注 |
| 复式 | 6~20 个 | 1~16 个 | C(红,6) × 蓝 |
| 胆拖 | 1~5 个胆 + (6-胆数)~29 个拖 | 1~16 个 | C(拖,6-胆数) × 蓝 |

**典型场景举例**：
- `6 红 + 16 蓝`（本工具默认用户场景） → `1 × 16 = 16 注`（红单 + 蓝复）
- `7 红 + 2 蓝` → `C(7,6) × 2 = 14 注`
- `1 红胆 + 6 红拖 + 1 蓝` → `C(6,5) × 1 = 6 注`

---

## 奖级与金额规则

按中国福利彩票双色球游戏规则：

| 奖级 | 中奖条件 | 金额 |
|---|---|---|
| 一等 | 6 红 + 1 蓝 | **浮动**（按当期销售额/奖池计算，≥500 万） |
| 二等 | 6 红 + 0 蓝 | **浮动**（约当期二等奖奖池） |
| 三等 | 5 红 + 1 蓝 | 固定 3,000 元 |
| 四等 | 5 红 + 0 蓝 / 4 红 + 1 蓝 | 固定 200 元 |
| 五等 | 4 红 + 0 蓝 / 3 红 + 1 蓝 | 固定 10 元 |
| 六等 | 2 红 + 1 蓝 / 1 红 + 1 蓝 / 0 红 + 1 蓝 | 固定 5 元 |

> 一/二等的浮动金额取自中彩网开奖公告中的 `typemoney` 字段
> （字段可能含中文说明如"7500000（含加奖2500000）"，本工具已自动剥离，提取首个整数）

**复式/胆拖结算方式**：投注被展开成所有单注，**每注独立判定奖级并累加**。
例如 `6 红 + 16 蓝` 若红球全中、蓝开 12 → 1 注一等奖（6+1）+ 15 注二等奖（6+0）。

---

## 数据存储（TDSQL-C MySQL）

- **引擎**：MySQL 8.0（腾讯云 TDSQL-C），库名 `lucky`
- **连接**：`.env.local` 的 `DATABASE_URL`（已 gitignore，不会提交）
- **Git 安全**：`.env` / `.env.*` 均被忽略，仓库只保留 `.env.example` 占位
- **建表**：首次访问时自动 `CREATE TABLE IF NOT EXISTS`
- **表结构**：
  - `users`：小程序用户（`openid` 唯一）
  - `subscriptions`：用户订阅授权状态（`accepted`）
  - `draws`：开奖期（期号 / 日期 / 红蓝号 / 销售额 / 奖池 / 各级金额与注数）
  - `bets`：守号（`user_id` / 名称 / 类型 / payload JSON / 单注金额 / 购买开关）
  - `hit_records`：每期每组守号汇总（`user_id` / 花费 / 奖金 / 各级明细）
  - `app_meta`：最后同步时间等元信息（`meta_key` / `value`）
- **多用户迁移**：`./scripts/npm.sh run migrate:multiuser`（建 users/subscriptions、加 user_id、回填默认用户）
- **SQLite 迁移**：`./scripts/npm.sh run migrate:mysql`（从 `data/ssq.db` 一次性导入，可重复执行并校验）
- **备份**：用 TDSQL-C 控制台备份，或 `mysqldump --single-transaction`
- **本地 SQLite**：本部署已归档到 `/opt/lucky/backups/`，项目内 `data/` 已清空，应用不再写入
- **重置**：`./start.sh reset` 只打印说明，不再删库；清空需手动执行 SQL

---

## 微信小程序多用户

- **登录**：`POST /api/wx/login`，用 `code` 调微信 `jscode2session`，首次登录自动创建 `users`，签发 30 天 JWT。
- **鉴权**：`Authorization: Bearer <token>`；无效/过期返回 HTTP 401 `{ code: 40100, message: "未登录" }`。
- **数据隔离**：`bets` / `hit_records` 均带 `user_id`，小程序接口按 JWT 的 `uid` 过滤；修改/删除守号会校验归属。
- **网页端**：继续走原有 `/api/*`，使用 `DEFAULT_USER_OPENID` 对应的默认用户，保持单人模式，不显示其他小程序用户的数据。
- **API 契约**：完整请求/响应见 [docs/wx-api.md](docs/wx-api.md)，包括金额单位、错误码和字段示例。

新增环境变量：

| 变量 | 说明 |
|---|---|
| `WX_APPID` | 小程序 AppID |
| `WX_APPSECRET` | 小程序 AppSecret |
| `JWT_SECRET` | JWT 签名密钥，至少 16 位随机串 |
| `CRON_SECRET` | 外部定时器调用 `/api/wx/sync` 的校验密钥 |
| `WX_SUBSCRIBE_TEMPLATE_ID` | 订阅消息模板 ID |
| `DEFAULT_USER_OPENID` | 存量数据/网页端默认用户，缺省 `__default__` |
| `WX_TEMPLATE_FIELD_*` | 可选，模板字段名，默认 `thing1` / `character_string2` / `amount3` |
| `WX_SUBSCRIBE_PAGE` | 可选，点击订阅消息跳转的小程序页面 |
| `WX_MINIPROGRAM_STATE` | 可选，`formal` / `trial` / `developer`，默认 `formal` |

**订阅推送**：

- `lib/wx/accessToken.ts` 全局缓存 access_token，提前 300 秒刷新，并发 single-flight，失败重试 1 次。
- 同步到新期后，只给 `subscriptions.accepted = 1` 且本期有启用守号/命中记录的用户推送。
- 推送字段至少包含期号、开奖号码、该用户盈亏；`43101` 静默跳过，`40001` 强制刷新 token 后重试一次。
- 推送失败不会中断同步或其他用户。

---

## 同步与成本控制

目标：只在开奖后有新数据时写 MySQL，避免无意义轮询和重复 upsert。

- **启动**：服务启动 5 秒后做一次 catch-up；页面首次 SSR 也会触发，内部去重
  - 库为空且未回填 → 回填约 2,000 期，一次性批量写入并结算
  - 库里有数据 → 只比较最新期号；无新期直接返回，**不写 draws / hit_records / app_meta**
- **运行中**：不再 30 分钟轮询
  - 开奖日（周二/四/日）北京时间 **21:30** 开始，每 **10 分钟**检查一次
  - 拿到当期新数据即停止本轮轮询，并触发订阅消息推送
  - 最多轮询 3 小时；超过后等下一次开奖或手动同步
  - 时区由 systemd 的 `TZ=Asia/Shanghai` 固定
- **新期写入**：单事务 upsert 这一期 `draws` + 批量 upsert 该期 `hit_records`
- **手动同步**：首页按钮 / `POST /api/sync` / `POST /api/wx/sync`；无新期不写库，有新期会触发推送（补录指定期不推送）
- **奖级修正**：官方事后修正金额时，用首页“补录指定期”触发 `syncOne`，只重写该期
- **连接池**：最多 3 个连接，90 秒无查询自动关闭，便于 TDSQL-C 空闲时降成本
- **停止服务**：主动关闭连接，避免数据库侧残留长时间 Sleep 连接
- **外部请求**：中彩网接口忽略 `pageSize`，每次检查仍会返回全量数据；但数据库只写新期

> 早期版本用 `src/instrumentation.ts` + `experimental.instrumentationHook` 做启动入口，
> 但 Next 14 会把数据库原生模块一并打进 edge bundle 导致 SSR 500，
> 因此已改为首页/健康检查懒启动，`src/instrumentation.ts` 已删除，不要重复添加。

### 定时任务部署

自托管（当前 systemd 部署）已经内置进程内定时器，无需额外 cron；如果希望把定时任务独立出来：

```bash
# 项目内调用脚本（读取 .env.local 的 CRON_SECRET）
*/10 21-23 * * 2,4,0 /opt/lucky/lucky/scripts/wx-cron.sh >> /var/log/lucky-wx-cron.log 2>&1
```

脚本实际调用：

```bash
curl -X POST http://127.0.0.1:3000/api/wx/sync \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "content-type: application/json" -d '{}'
```

Serverless / Vercel 等平台无法稳定保留进程内定时器时，用平台 Cron 或 GitHub Actions 每 10 分钟调用一次
`POST /api/wx/sync`，并带上 `x-cron-secret` 请求头（对应环境变量 `CRON_SECRET`）。北京时间 21:30–23:30
对应 UTC 13:30–15:30，GitHub Actions 示例：

```yaml
on:
  schedule:
    - cron: "*/10 13-15 * * 2,4,0"
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X POST "${{ secrets.LUCKY_BASE_URL }}/api/wx/sync" \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}" \
            -H "content-type: application/json" -d '{}'
```

`/api/wx/sync` 会复用同步逻辑，没有新期时不会写库；有新期时结算并推送。

手动同步：

- 首页右上角 **"立即同步开奖"** 按钮触发一次 `syncAndNotify()`（无新期不写库）
- 网页 API：`POST /api/sync`（无 body，会推送）；补录指定期：`POST /api/sync` + `{"code":"2026120"}`（不推送）
- 小程序/定时任务：`POST /api/wx/sync`（会推送）

---

## 引擎单测

```bash
./scripts/npm.sh run test:engine
```

覆盖 7 类场景：单式命中、复式展开、胆拖展开、边界抛错、各奖级判定。
任何对 `src/lib/engine/` 的修改都应先跑这个测试。

---

## 常见问题

**Q: 启动后访问 :3000 报 500？**
A: 先看 `journalctl -u lucky.service -n 50`。多数是 `node_modules` 没装好（用 `./scripts/npm.sh ci` 重装）或 `.env.local` 的 `DATABASE_URL` 不可用。

**Q: 启动报缺少 DATABASE_URL / 连接数据库失败？**
A: 检查 `.env.local` 是否存在、连接串格式是否正确、TDSQL-C 白名单是否放行本机 IP、端口是否可达。可用 `mysql -h 主机 -P 端口 -u 用户 -p` 先验证；不要把连接串提交到 Git。

**Q: 同步失败 / fetch error？**
A: 中彩网偶尔抽风，脚本会保留错误日志。也可手动在首页"补录指定期"输入期号回填。

**Q: 奖级金额显示 0？**
A: 浮动奖级（1/2 等）的金额来自官方 `typemoney` 字段；个别期官方未给出该字段时会显示 0。

**Q: 为什么最早只有 2013 年的数据？**
A: 中彩网当前接口只提供 2013 年至今的开奖记录（约 2,000 期）。更早的数据需要接入其它数据源，本工具未内置。

**Q: 小程序登录失败怎么办？**
A: 检查 `WX_APPID` / `WX_APPSECRET` 是否与小程序一致、服务器能否访问 `api.weixin.qq.com`、小程序是否配置了合法域名；服务端日志会记录微信 errcode/errmsg（不会记录 secret）。

**Q: 为什么收不到订阅消息？**
A: 需要用户完成 `wx.requestSubscribeMessage` 并调用 `/api/wx/report-subscription` 上报 `accepted=true`；同时配置正确的 `WX_SUBSCRIBE_TEMPLATE_ID` 与模板字段名。43101 表示用户未订阅或额度用尽，会被静默跳过。

**Q: 网页端会看到小程序用户的数据吗？**
A: 不会。网页端固定使用 `DEFAULT_USER_OPENID` 对应的默认用户；小程序接口按 JWT 的 uid 过滤。

**Q: 怎么从旧 SQLite 迁移？**
A: 如果还有 `data/ssq.db`，配置好 `.env.local` 后执行 `./scripts/npm.sh run migrate:mysql`。脚本会建库建表、批量导入并校验行数与金额，可重复执行。本部署的旧库已归档到 `/opt/lucky/backups/`，需要时可先解压恢复。

**Q: 为什么项目里要单独放一个 Node？**
A: 固定 Node 22 可以保证构建和运行使用同一 ABI/版本；迁移脚本仍用 `better-sqlite3` 读取旧库，原生模块对 Node 主版本敏感。`.runtime` 不提交 Git，删掉后重新执行 `./scripts/bootstrap-node.sh` 即可。

**Q: 怎么升级项目内 Node？**
A: 修改 `.node-version` → `./scripts/bootstrap-node.sh` → `./scripts/npm.sh rebuild better-sqlite3` → `./scripts/npm.sh run build` → 重启服务。

**Q: 怎么重新部署？**
A: `bash /opt/lucky/reinstall.sh`（或项目内 `./deploy.sh`）。会快进拉 `main`、准备 Node、装依赖、构建、重启并检查 `/api/health`；不会删除 `data/`、`.runtime/`、`.env.local`。

**Q: 修改守号后要不要重新同步？**
A: 不需要。修改 `start_code` 会触发该守号重算；平时的开奖只会在新期写入时结算该期。

**Q: 数据会被上传吗？**
A: 不会上传到第三方。数据保存在你自己的 TDSQL-C 实例，应用只连接 `.env.local` 中的 `DATABASE_URL`。

**Q: 想清空重新开始？**
A: 数据在 MySQL，`./start.sh reset` 只打印说明。请用 MySQL 客户端手动清理 `hit_records`、`bets`、`draws`、`app_meta`（谨慎操作，先备份）。

**Q: 按量付费，怎么控制成本？**
A: 开奖日 21:30 起每 10 分钟检查一次，拿到新期即停止；没有新期时完全不写库；新期只写该期并批量写命中；连接池 90 秒无查询自动关闭。需要彻底暂停数据库时，可在腾讯云控制台暂停实例，注意先停服务。

---

## 目录结构

```
lucky/
├── .env.example            # 环境变量模板（DATABASE_URL / 微信 / JWT / CRON）
├── .env.local              # 实际连接串与密钥（gitignore）
├── .node-version           # 固定的 Node 版本（22.23.2）
├── .runtime/               # 项目内 Node（bootstrap 生成，gitignore，约 200MB）
├── data/                   # 迁移临时目录（旧 SQLite 已归档到项目外）
├── docs/
│   └── wx-api.md           # 微信小程序 API 契约
├── logs/                   # 启动脚本的 PID/日志
├── scripts/
│   ├── bootstrap-node.sh   # 下载/校验/解压 Node 到 .runtime
│   ├── check-runtime.mjs   # npm install 前的 Node 主版本守卫
│   ├── migrate-sqlite-to-mysql.ts  # 一次性迁移旧 SQLite 数据
│   ├── migrate-multiuser.ts        # 多用户表结构 + 默认用户回填
│   ├── test-wx.ts          # 微信登录/access_token/推送 mock 自测
│   ├── wx-cron.sh          # 外部定时器调用 /api/wx/sync
│   ├── npm.sh              # 用项目内 Node 运行项目内 npm
│   └── run-next.mjs        # 优先用 .runtime/node 启动 Next
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── api/            # 网页端 REST API（保持原路径）
│   │   │   ├── wx/         # 小程序 API（login/bets/current/history/stats/sync…）
│   │   │   ├── health/     # 健康检查（部署用）
│   │   │   ├── sync/       # 网页端触发同步
│   │   │   ├── draws/      # 查询开奖
│   │   │   ├── bets/       # 守号增删改
│   │   │   ├── hits/       # 命中记录
│   │   │   └── stats/      # 统计汇总
│   │   ├── bets/           # 守号管理页面
│   │   ├── history/        # 历史记录页面
│   │   ├── stats/          # 统计页面
│   │   ├── layout.tsx      # 全局布局
│   │   └── page.tsx        # 首页
│   ├── components/         # 客户端组件
│   │   ├── Balls.tsx       # 红/蓝号码球
│   │   └── SyncButton.tsx  # 同步按钮
│   └── lib/
│       ├── engine/         # 投注展开 + 命中结算 + 奖级表（纯函数，可单测）
│       ├── crawler/        # 中彩网爬取
│       ├── db/             # MySQL 数据访问（mysql2，连接池，user_id 隔离）
│       ├── sync/           # 同步执行 + 21:30 定时器
│       └── wx/             # 微信登录、JWT、access_token、订阅推送
├── start.sh                # 一键启动脚本（开发模式）
├── deploy.sh               # 一键重新部署（拉取/构建/重启/健康检查）
├── next.config.mjs         # Next.js 配置（mysql2 / better-sqlite3 走 Node 外部包）
├── package.json
└── README.md
```

---

## 风险与免责

- 本工具仅用于**开奖数据采集与命中计算**，不代替任何投注行为
- 彩票存在概率性，请**理性投注、量力而行**
- 浮动奖级金额以中彩网当期公告为准，本工具计算结果仅供参考
- 数据准确性依赖中彩网接口稳定性，若官方接口调整，本工具可能需要更新
