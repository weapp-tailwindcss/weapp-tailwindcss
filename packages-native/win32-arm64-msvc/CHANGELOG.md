# @weapp-tailwindcss/native-win32-arm64-msvc

## 5.6.4

### Patch Changes

- 更新主包与 PostCSS Rust 内核的 Node-API 配套依赖：`napi` 由 `3.14.0` 升至 `3.15.0`，`napi-derive` 由 `3.6.10` 升至 `3.6.13`，继续使用精确版本并提交两份 Cargo.lock。

  两个内核随相同八个平台包交付，主包、CLI 和平台包按现有固定版本组共同发布，避免只发布上层 PostCSS 包而继续消费旧二进制。原生二进制仍由同一提交的发布矩阵构建，保留 JavaScript 回退和现有 Node-API 级别。

## 5.6.3

## 5.6.2

## 5.6.1

## 5.6.0
