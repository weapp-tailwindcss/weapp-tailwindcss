#!/bin/sh
set -eu

# 仅由 Linux CI 容器调用；GNU 产物在 glibc 2.28 镜像内构建，musl 在 Alpine 内构建。
if [ "$NATIVE_LIBC" = musl ]; then
  apk add --no-cache build-base curl bash git python3 linux-headers
  export RUSTFLAGS="-C target-feature=-crt-static"
else
  NATIVE_NODE_VERSION="v${NATIVE_NODE_VERSION#v}"
  task_node_dir="$(mktemp -d)"
  task_node_archive="$task_node_dir/node.tar.xz"
  task_node_file="node-$NATIVE_NODE_VERSION-linux-$NATIVE_ARCH.tar.xz"
  curl --fail --location --retry 3 "https://nodejs.org/dist/$NATIVE_NODE_VERSION/$task_node_file" -o "$task_node_archive"
  curl --fail --location --retry 3 "https://nodejs.org/dist/$NATIVE_NODE_VERSION/SHASUMS256.txt" -o "$task_node_dir/SHASUMS256.txt"
  task_node_expected="$(awk -v name="$task_node_file" '$2 == name { print $1 }' "$task_node_dir/SHASUMS256.txt")"
  test -n "$task_node_expected"
  printf '%s  %s\n' "$task_node_expected" "$task_node_archive" | sha256sum --check --status
  tar -xJf "$task_node_archive" -C "$task_node_dir" --strip-components=1
  export PATH="$task_node_dir/bin:$PATH"
fi

task_pnpm_version="$(node -p 'require("./package.json").packageManager.replace(/^pnpm@/, "")')"
task_pnpm_dir="$(mktemp -d)"
task_pnpm_archive="$task_pnpm_dir/pnpm.tgz"
curl --fail --location --retry 3 \
  "https://registry.npmjs.org/pnpm/-/pnpm-$task_pnpm_version.tgz" \
  -o "$task_pnpm_archive"
tar -xzf "$task_pnpm_archive" -C "$task_pnpm_dir"
export PATH="$task_pnpm_dir/package:$PATH"
pnpm install --frozen-lockfile

if [ "${NATIVE_CSS_ONLY:-0}" = 1 ]; then
  node --import tsx packages/weapp-tailwindcss/native/test/package.mjs --css-only
elif [ "${NATIVE_VERIFY_ONLY:-0}" = 1 ]; then
  node packages/weapp-tailwindcss/native/ci.mjs "--target=$NATIVE_TARGET" --verify-only
else
  task_rust_installer="$(mktemp)"
  curl --fail --location --retry 3 https://sh.rustup.rs -o "$task_rust_installer"
  sh "$task_rust_installer" -y --profile minimal --default-toolchain 1.96.0 --component clippy
  export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"
  node packages/weapp-tailwindcss/native/ci.mjs "--target=$NATIVE_TARGET"
fi
