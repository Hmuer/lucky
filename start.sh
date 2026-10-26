#!/usr/bin/env bash
# 生产环境统一由 systemd 管理，本脚本只是 systemctl 的简写。
# 服务单元：lucky.service
# 生产日志：journalctl -u lucky.service -f
#
# 用法：
#   ./start.sh                 启动并查看状态（systemctl start）
#   ./start.sh stop            停止
#   ./start.sh restart         重启
#   ./start.sh status          查看状态
#   ./start.sh logs            跟踪 journald 日志
#   ./start.sh enable          设置开机自启并立即启动
#   ./start.sh disable         取消开机自启并停止
#   ./start.sh dev             本地开发模式（前台 next dev，需先停 systemd）
#   ./start.sh test            跑引擎单测
#   ./start.sh reset           查看 MySQL 清理说明
#
# 生产启动/停止请不要再用 nohup 或后台 npm，统一走 systemd。
set -euo pipefail

cd "$(dirname "$0")"
SERVICE="${SERVICE_NAME:-lucky.service}"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "未找到 systemctl；本脚本用于 Linux systemd 环境，开发请用：./scripts/npm.sh run dev" >&2
  exit 1
fi

run_systemctl() {
  if [ "$(id -u)" -eq 0 ]; then
    systemctl "$@"
  else
    sudo systemctl "$@"
  fi
}

run_journalctl() {
  if [ "$(id -u)" -eq 0 ]; then
    journalctl "$@"
  else
    sudo journalctl "$@"
  fi
}

usage() {
  cat <<'EOF'
用法: ./start.sh [start|stop|restart|status|logs|enable|disable|dev|test|reset]

  start      启动 systemd 服务并查看状态（默认）
  stop       停止服务
  restart    重启服务
  status     查看服务状态
  logs       跟踪 journald 日志
  enable     设置开机自启并立即启动
  disable    取消开机自启并停止
  dev        本地开发模式（前台 next dev）
  test       跑引擎单测
  reset      查看 MySQL 清理说明
EOF
}

case "${1:-start}" in
  start)
    run_systemctl start "$SERVICE"
    run_systemctl status --no-pager "$SERVICE"
    ;;
  stop)
    run_systemctl stop "$SERVICE"
    ;;
  restart)
    run_systemctl restart "$SERVICE"
    ;;
  status)
    run_systemctl status --no-pager "$SERVICE"
    ;;
  logs)
    run_journalctl -u "$SERVICE" -f
    ;;
  enable)
    run_systemctl enable --now "$SERVICE"
    ;;
  disable)
    run_systemctl disable --now "$SERVICE"
    ;;
  dev|fg)
    if run_systemctl is-active --quiet "$SERVICE"; then
      echo "systemd 服务 $SERVICE 正在占用 :3000，请先执行：./start.sh stop" >&2
      exit 1
    fi
    exec ./scripts/npm.sh run dev
    ;;
  test)
    exec ./scripts/npm.sh run test:engine
    ;;
  reset)
    echo "数据在 TDSQL-C MySQL，start.sh reset 不再删除数据库。"
    echo "旧 SQLite 已归档到项目外（本部署为 /opt/lucky/backups/），项目内 data/ 为空。"
    echo "如需清空线上数据，请用 MySQL 客户端连接 DATABASE_URL 后手动操作（谨慎）。"
    ;;
  all|all-fg|allfg)
    echo "all 模式已移除：生产用 ./start.sh（systemd），开发用 ./start.sh dev。" >&2
    exit 1
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
