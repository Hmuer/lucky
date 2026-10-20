#!/usr/bin/env bash
# 用项目内 Node 运行项目内 npm。
#
# 直接执行 .runtime/node/bin/npm 时，它的 shebang 是 `#!/usr/bin/env node`，
# 会按 PATH 找到宿主机 Node（可能是 24），导致 preinstall 守卫失败或原生模块
# 按错误 ABI 编译。这里显式指定项目内 Node，并把 .runtime/node/bin 放到
# PATH 最前，保证 npm 及其生命周期脚本都用同一个运行时。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="$ROOT/.runtime/node/bin/node"
NPM_CLI="$ROOT/.runtime/node/lib/node_modules/npm/bin/npm-cli.js"

if [ ! -x "$NODE" ] || [ ! -f "$NPM_CLI" ]; then
  echo "[npm] 未安装项目内 Node，请先执行：./scripts/bootstrap-node.sh" >&2
  exit 1
fi

export PATH="$ROOT/.runtime/node/bin:$PATH"
exec "$NODE" "$NPM_CLI" "$@"
