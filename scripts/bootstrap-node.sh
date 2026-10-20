#!/usr/bin/env bash
# 下载并安装项目固定版本的 Node 到 .runtime/（不提交到 Git）
#
# 用法：
#   ./scripts/bootstrap-node.sh
#   NODE_MIRROR=https://npmmirror.com/mirrors/node ./scripts/bootstrap-node.sh
#
# 版本来源：项目根目录的 .node-version
# 安装结果：.runtime/node-v<version>-<os>-<arch>/，并创建 .runtime/node 软链
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION_FILE="$ROOT/.node-version"
if [ ! -f "$VERSION_FILE" ]; then
  echo "[bootstrap] 缺少 $VERSION_FILE" >&2
  exit 1
fi
VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
if [ -z "$VERSION" ]; then
  echo "[bootstrap] .node-version 为空" >&2
  exit 1
fi

case "$(uname -s)" in
  Linux) OS=linux ;;
  Darwin) OS=darwin ;;
  *)
    echo "[bootstrap] 不支持的系统: $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  armv7l) ARCH=armv7l ;;
  *)
    echo "[bootstrap] 不支持的架构: $(uname -m)" >&2
    exit 1
    ;;
esac

NAME="node-v${VERSION}-${OS}-${ARCH}"
TARBALL="${NAME}.tar.gz"
RUNTIME="$ROOT/.runtime"
TARGET="$RUNTIME/$NAME"
LINK="$RUNTIME/node"

mkdir -p "$RUNTIME"

if [ -x "$TARGET/bin/node" ] && [ "$("$TARGET/bin/node" -v 2>/dev/null)" = "v${VERSION}" ]; then
  echo "[bootstrap] 已安装 Node v${VERSION}: $TARGET"
else
  MIRROR="${NODE_MIRROR:-https://nodejs.org/dist}"
  MIRROR="${MIRROR%/}"
  URL="${MIRROR}/v${VERSION}/${TARBALL}"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT

  echo "[bootstrap] 下载 $URL"
  curl -fL --retry 3 --connect-timeout 15 -o "$TMP/$TARBALL" "$URL"

  echo "[bootstrap] 校验 SHA256"
  curl -fsSL --retry 3 -o "$TMP/SHASUMS256.txt" "${MIRROR}/v${VERSION}/SHASUMS256.txt"
  if ! grep -E "  ${TARBALL}$" "$TMP/SHASUMS256.txt" > "$TMP/checksum.txt"; then
    echo "[bootstrap] SHASUMS256.txt 中找不到 $TARBALL" >&2
    exit 1
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$TMP" && sha256sum -c checksum.txt)
  else
    (cd "$TMP" && shasum -a 256 -c checksum.txt)
  fi

  rm -rf "$TARGET"
  mkdir -p "$TARGET"
  tar -xzf "$TMP/$TARBALL" -C "$TARGET" --strip-components=1
fi

ln -sfn "$NAME" "$LINK"

echo "[bootstrap] Node: $("$LINK/bin/node" -v)"
echo "[bootstrap] npm:  $("$LINK/bin/npm" -v)"
echo "[bootstrap] 下一步：./scripts/npm.sh ci"
