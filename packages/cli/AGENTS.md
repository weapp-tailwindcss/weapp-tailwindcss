# @weapp-tailwindcss/cli Guidelines

## 适用范围

- 本文件适用于 `packages/cli` 的源码、测试、构建配置与发布文档。

## 核心职责

- 本包独立发布 `weapp-tw` 与 `weapp-tailwindcss` 命令。
- 命令层负责参数解析、输入输出、watch、source map、`canonicalize` 和兼容辅助命令。
- Tailwind CSS 生成、design system 与小程序 CSS 转换必须复用 `weapp-tailwindcss` 的公开 API。

## 变更原则

- 不把 CLI 实现或 bin 入口放回 `weapp-tailwindcss` 核心包。
- 不依赖或调用 `@tailwindcss/cli`。保留已有原生 watch 与跨平台轮询回退；候选扫描和生成调用统一核心会话。
- 文件系统路径必须使用 `node:path`，并同时考虑 Windows、macOS 和 Linux。
- `--target weapp` 保持 CSS-only 边界，不扫描或改写 WXML、JS、TS、JSX、TSX 或 WXSS 项目资源。
- 包根导入不得自动执行 CLI；可执行入口只放在 `src/bin.ts`。

## 测试要求

- CLI 公开行为变化必须补 Vitest 回归。
- Tailwind CSS 官方 CLI 适配用例维护在 `test`，排除项同步记录到 `test/UPSTREAM-PARITY.md`。
- watch、stdin/stdout、source map 与路径行为至少覆盖对应的成功和失败场景。

## 推荐验证命令

- `pnpm --filter weapp-tailwindcss build`
- `pnpm --filter @weapp-tailwindcss/cli build`
- `pnpm --filter @weapp-tailwindcss/cli test`
- `pnpm --filter @weapp-tailwindcss/cli lint`
- `pnpm --filter @weapp-tailwindcss/cli pack --dry-run`

## 提交前检查

- 确认 bin 指向可执行的 `dist/bin.cjs`，程序化入口具备 ESM/CJS 和类型声明。
- 确认 `package.json`、lockfile、中文 change intent、README 与 website 用法一致。
