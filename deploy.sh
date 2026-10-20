#!/usr/bin/env bash
# 重新部署：检查工作区 → 快进拉取 main → 准备项目内 Node → 装依赖/构建
#           → 同步 systemd 单元并重启 → 健康检查
#
# 不删除 data/、.runtime/、logs/ 等运行时目录；数据不会被 git pull 覆盖。
# 服务器上的本地入口：/opt/lucky/reinstall.sh（调用本脚本）
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

SERVICE_NAME="${SERVICE_NAME:-lucky.service}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"

if [ "$(id -u)" -ne 0 ]; then
  echo "请以 root 运行（需要同步并重启 systemd 服务）。" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "工作区有未提交的修改，部署已停止：" >&2
  git status --short >&2
  exit 1
fi

if [ ! -f "$PROJECT_DIR/.env.local" ]; then
  echo "缺少 $PROJECT_DIR/.env.local（DATABASE_URL），部署已停止。" >&2
  echo "请先从 .env.example 复制并填入 MySQL 连接串。" >&2
  exit 1
fi

if ! systemctl cat "$SERVICE_NAME" >/dev/null 2>&1; then
  echo "未找到 systemd 服务：$SERVICE_NAME" >&2
  echo "请先安装 lucky.service，或通过 SERVICE_NAME 指定服务名。" >&2
  exit 1
fi

echo "[1/6] 拉取 origin/main（仅快进）..."
git pull --ff-only origin main

echo "[2/6] 准备项目内 Node ..."
./scripts/bootstrap-node.sh

echo "[3/6] 安装依赖 ..."
./scripts/npm.sh ci --no-audit --no-fund --loglevel=error

echo "[4/6] 生成生产构建 ..."
./scripts/npm.sh run build

echo "[5/6] 同步 systemd 单元并重启 ..."
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}"
if ! cmp -s "$PROJECT_DIR/lucky.service" "$UNIT_PATH"; then
  install -m 0644 "$PROJECT_DIR/lucky.service" "$UNIT_PATH"
  systemctl daemon-reload
fi
systemctl restart "$SERVICE_NAME"

echo "[6/6] 健康检查 ..."
for _ in $(seq 1 20); do
  if body="$(curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" 2>/dev/null)"; then
    echo "$body"
    echo "部署完成。"
    exit 0
  fi
  sleep 1
done

echo "健康检查失败：$HEALTH_URL" >&2
systemctl status "$SERVICE_NAME" --no-pager -n 20 >&2 || true
journalctl -u "$SERVICE_NAME" -n 40 --no-pager >&2 || true
exit 1
