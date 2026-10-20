#!/usr/bin/env bash
# 外部定时器调用小程序同步接口（自托管 crontab / systemd timer 用）
# crontab 示例：
#   */10 21-23 * * 2,4,0 /opt/lucky/lucky/scripts/wx-cron.sh >> /var/log/lucky-wx-cron.log 2>&1
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

: "${CRON_SECRET:?缺少 CRON_SECRET}"
URL="${WX_SYNC_URL:-http://127.0.0.1:3000/api/wx/sync}"

exec curl -fsS -X POST "$URL" \
  -H "content-type: application/json" \
  -H "x-cron-secret: ${CRON_SECRET}" \
  -d '{}'
