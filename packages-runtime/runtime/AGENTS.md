# Package Guidelines (`packages-runtime/runtime`)

## 适用范围

- 本文件适用于 `packages-runtime/runtime`。
- 该包是 runtime 族基础依赖，变更会影响 `merge`、`variants`、`cva` 等多个上游包。

## 核心职责

- `createRuntimeFactory`：为第三方 class 聚合库提供统一包装层（prepare/restore、escape/unescape、缓存）。
- `resolveTransformers`：统一解析 escape/unescape 配置与映射表共享策略。
- `createRpxLengthTransform`：把 `text-[12rpx]` 等语法转换为 merge 友好占位形式后再恢复。

## 变更硬约束

- 不可破坏 `createRuntimeFactory` 的包装顺序：`unescape -> prepare -> merge -> restore -> escape`。
- `resolveTransformers` 需保持 escape/unescape map 的共享语义，避免单边 map 导致不可逆转换。
- 缓存需保持有界（现有 256 上限）；禁止引入无上限缓存或跨 runtime 实例共享可变状态。
- `createRpxLengthTransform` 的 `metadata` 必须可恢复且幂等，避免重复 restore 产生污染。

## 测试要求

- 修改 `src/create-runtime.ts` 时，至少覆盖：
  - `prepare/restore` 分支；
  - escape/unescape 开关组合；
  - 缓存命中与非命中路径。
- 修改 `src/transformers.ts` 时，必须覆盖自定义 map 与默认 map 的互操作。
- 修改 `src/rpx-length.ts` 时，必须覆盖 placeholder 恢复计数与无替换分支。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/runtime test`
- `pnpm --filter @weapp-tailwindcss/runtime tsd`
- 定向回归：
  - `pnpm --filter @weapp-tailwindcss/runtime exec vitest run test/create-runtime.test.ts`
  - `pnpm --filter @weapp-tailwindcss/runtime exec vitest run test/transformers.test.ts`
  - `pnpm --filter @weapp-tailwindcss/runtime exec vitest run test/rpx-length.test.ts`
