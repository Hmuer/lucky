#!/usr/bin/env bash
# 双色球守号监控 - 一键启动
# 用法：
#   ./start.sh           # 仅启动 Web（默认后台）
#   ./start.sh fg        # 前台运行 Web
#   ./start.sh all       # 同时启动 Web + 独立轮询（默认后台）
#   ./start.sh all fg    # 同时启动 Web + 轮询，前台
#   ./start.sh stop      # 停止所有
#   ./start.sh status    # 查看状态
#   ./start.sh test      # 跑引擎单测
#   ./start.sh logs      # 跟踪日志
#   ./start.sh reset     # 删除本地 SQLite 重新开始
#
# 日志：./logs/web.log 与 ./logs/cron.log
# PID：./logs/*.pid

set -e

cd "$(dirname "$0")"
ROOT="$(pwd)"
LOGS="$ROOT/logs"
mkdir -p "$LOGS"

WEB_PID="$LOGS/web.pid"
CRON_PID="$LOGS/cron.pid"
WEB_LOG="$LOGS/web.log"
CRON_LOG="$LOGS/cron.log"

color() { printf "\033[1;%sm%s\033[0m\n" "$1" "$2"; }
info()  { color 36 "[i] $*"; }
ok()    { color 32 "[✔] $*"; }
warn()  { color 33 "[!] $*"; }
err()   { color 31 "[✘] $*"; }

need_deps() {
  if [ ! -d node_modules ]; then
    info "安装依赖（首次运行，可能需要 1~3 分钟）..."
    npm install --no-audit --no-fund --loglevel=error
    ok "依赖安装完成"
  fi
}

is_running() {
  local pidfile="$1"
  [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

start_web() {
  if is_running "$WEB_PID"; then
    warn "Web 已在运行 (pid $(cat "$WEB_PID"))，端口 :3000"
    return 0
  fi
  need_deps
  info "启动 Web 服务 → :3000 (后台)"
  nohup npx next dev -H 0.0.0.0 -p 3000 > "$WEB_LOG" 2>&1 &
  echo $! > "$WEB_PID"
  # 等就绪
  for i in $(seq 1 30); do
    if curl -sS -o /dev/null -m 1 http://localhost:3000 2>/dev/null; then
      ok "Web 已就绪 (pid $(cat "$WEB_PID"))"
      info "打开 http://localhost:3000"
      return 0
    fi
    sleep 0.5
  done
  warn "Web 启动超时，查看日志: tail -n 100 $WEB_LOG"
}

start_cron() {
  if is_running "$CRON_PID"; then
    warn "轮询进程已在运行 (pid $(cat "$CRON_PID"))"
    return 0
  fi
  need_deps
  info "启动独立轮询（开奖日 21:30 后每 5 分钟）"
  nohup node scripts/cron.mjs > "$CRON_LOG" 2>&1 &
  echo $! > "$CRON_PID"
  ok "轮询进程已启动 (pid $(cat "$CRON_PID"))"
}

stop_one() {
  local name="$1" pidfile="$2"
  if is_running "$pidfile"; then
    local pid; pid="$(cat "$pidfile")"
    kill "$pid" 2>/dev/null || true
    sleep 0.5
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    rm -f "$pidfile"
    ok "已停止 $name (pid $pid)"
  else
    warn "$name 未运行"
    rm -f "$pidfile"
  fi
}

status() {
  echo "--- 进程状态 ---"
  if is_running "$WEB_PID"; then
    ok "Web   运行中 (pid $(cat "$WEB_PID")) : http://localhost:3000"
  else
    warn "Web   未运行"
  fi
  if is_running "$CRON_PID"; then
    ok "Cron  运行中 (pid $(cat "$CRON_PID"))"
  else
    warn "Cron  未运行"
  fi
  echo
  echo "--- 文件 ---"
  [ -f data/ssq.db ] && echo "DB: data/ssq.db ($(du -h data/ssq.db | awk '{print $1}'))" || echo "DB: 尚未生成"
  [ -f "$WEB_LOG" ] && echo "Web log:  $WEB_LOG ($(wc -l < "$WEB_LOG") 行)" || true
  [ -f "$CRON_LOG" ] && echo "Cron log: $CRON_LOG ($(wc -l < "$CRON_LOG") 行)" || true
}

case "${1:-}" in
  fg)
    need_deps
    info "前台启动 Web（Ctrl+C 退出）"
    exec npx next dev -H 0.0.0.0 -p 3000
    ;;
  all)
    start_web
    start_cron
    echo
    status
    ;;
  all-fg|allfg)
    need_deps
    info "前台同时启动 Web + 轮询（Ctrl+C 退出，轮询会自动停）"
    trap 'kill $(cat "$CRON_PID" 2>/dev/null) 2>/dev/null; rm -f "$CRON_PID"' EXIT INT TERM
    node scripts/cron.mjs &
    echo $! > "$CRON_PID"
    exec npx next dev -H 0.0.0.0 -p 3000
    ;;
  stop)
    stop_one "Cron" "$CRON_PID"
    stop_one "Web"  "$WEB_PID"
    ;;
  status)
    status
    ;;
  test)
    need_deps
    info "运行引擎单测"
    npm run test:engine
    ;;
  logs)
    info "跟踪 Web + Cron 日志（Ctrl+C 退出）"
    tail -n 100 -f "$WEB_LOG" "$CRON_LOG" 2>/dev/null
    ;;
  reset)
    warn "将删除 ./data/ssq.db（开奖/守号/命中记录全部清空）"
    read -rp "确认删除？[yes/N] " ans
    if [ "$ans" = "yes" ]; then
      stop_one "Cron" "$CRON_PID" || true
      stop_one "Web"  "$WEB_PID" || true
      rm -rf data/ssq.db data/ssq.db-* 2>/dev/null || true
      ok "已清空"
    else
      info "已取消"
    fi
    ;;
  ""|start)
    start_web
    echo
    status
    echo
    info "其它命令：./start.sh all / stop / status / logs / test / reset"
    ;;
  *)
    err "未知命令: $1"
    echo "用法: $0 [start|fg|all|all-fg|stop|status|logs|test|reset]"
    exit 1
    ;;
esac
