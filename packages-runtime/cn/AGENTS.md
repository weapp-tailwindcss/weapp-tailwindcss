# `@weapp-tailwindcss/cn`

该包提供 shadcn 风格的 `cn` 类名组合函数，必须保持 `clsx` 输入语义与小程序兼容的 Tailwind 合并行为。

默认经 `wrapRuntimeAggregator` 接入与 `@weapp-tailwindcss/merge` 相同的 `createRpxLengthTransform`（`text` / `border` / `bg` / `outline` / `ring`），使 `text-red` 与 `text-[80rpx]` 这类颜色 + rpx 长度可以共存。

变更类名组合或 rpx 处理时补充 Vitest 回归测试，并运行 `pnpm --filter @weapp-tailwindcss/cn test`、`tsd` 和 `build`。
