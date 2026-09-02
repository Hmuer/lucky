# 双色球守号监控

官方数据源 + 复式/单式/胆拖自动核对 + Web 管理。

## 功能

- **守号管理**：单式（6红+1蓝）/ 复式（7~20红 × 1~16蓝）/ 胆拖（1~5红胆 + 红拖 × 1~16蓝）
- **官方爬取**：从 `cwl.gov.cn` 自动拉取开奖与奖级数据（含一/二等浮动金额）
- **自动核对**：每期按"展开单注 → 与开奖比对 → 累计各级奖金"的方式结算
- **历史 & 统计**：盈亏明细、累计花费/中奖、回本率走势（Recharts）

## 运行

```bash
npm install
npm run dev           # http://localhost:3000
# 另一窗口（可选）：node scripts/cron.mjs   # 独立轮询进程
```

## 引擎自测

```bash
npm run test:engine
```

覆盖：单式 / 复式 / 胆拖 / 边界 / 各奖级。

## 数据

SQLite 落盘到 `data/ssq.db`。重启保留。

## 目录

```
src/
  app/              # Next.js App Router 页面 + API
  components/       # 客户端组件
  lib/
    engine/         # 投注展开 + 命中结算 + 奖级表
    crawler/        # 中彩网爬取
    db/             # SQLite 仓库
    sync/           # 守号↔引擎适配 + 同步执行
scripts/
  cron.mjs          # 独立轮询脚本
```
