# Nightly 发布规则

## 适用范围

适用于本目录的 nightly 路由、原生产物输入与 npm 消费验证。

## 核心职责

通过 repoctl 编排准确 main 提交的 snapshot-nightly，复用受信任原生矩阵产物。

## 变更原则

- 不手写 npm publish，不修改 GitHub 签名的 SHA/ref，不消费稳定版本 intent。
- 原生产物必须来自同轮准确 SHA；全部输入通过后才复制到隔离源码，仅重标 metadata 版本。
- 不获取子模块，不修改原 checkout，不允许符号链接或路径逃逸。

## 测试要求

覆盖事件路由、错误产物、源码身份、版本重标、平台消费与失败恢复。

## 推荐验证命令

- `pnpm --filter weapp-tailwindcss exec vitest run test/ci/release-nightly --update=none --coverage.enabled=false`

## 提交前检查

运行定向测试、ESLint、`pnpm agents:check` 和 `git diff --check`，记录尚未执行的平台。
