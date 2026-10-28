#!/bin/sh
set -eu

# 仅用于明确的 Alpine 容器边界；最低 Node 验证直接运行同一安装产物。
case "${1:-}" in
  install)
    corepack enable
    pnpm install --frozen-lockfile
    node scripts/release-nightly/consumer.mjs --install
    ;;
  *)
    echo "Usage: consumer-linux.sh install" >&2
    exit 1
    ;;
esac
