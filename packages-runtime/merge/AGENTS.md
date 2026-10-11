# Package Guidelines (`packages-runtime/merge`)

## 适用范围

- 本文件适用于 `packages-runtime/merge`。
- 该包是 `tailwind-merge` 的小程序运行时封装，核心依赖 `@weapp-tailwindcss/runtime`。

## 设计要点

- 默认导出能力需保持与上游 `tailwind-merge` 语义一致：`twMerge`、`twJoin`、`extendTailwindMerge`、`createTailwindMerge`。
- 包内 `create` 默认集成 `createRpxLengthTransform`，用于 rpx arbitrary value 的 merge 前后转换。
- `tailwindMergeVersion` 是对外兼容信息，不应随意改动或移除。

## 变更原则

- 任何与冲突分组、rpx 处理相关的改动，都必须有对应行为测试，避免 class 合并回归。
- 不要在该包引入框架特定逻辑（Vue/React/uni-app 等），保持纯运行时合并层定位。
- 变更 `create` 默认行为时需评估 `@weapp-tailwindcss/variants` 等上游依赖影响。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/merge test`
- `pnpm --filter @weapp-tailwindcss/merge tsd`
- 定向回归：
  - `pnpm --filter @weapp-tailwindcss/merge exec vitest run test/twMerge.test.ts`
  - `pnpm --filter @weapp-tailwindcss/merge exec vitest run test/v4.unit.test.ts`

## 提交前检查

- 若修改了默认 merge 配置或 transform 策略，提交说明中应列出兼容性判断依据。
- 若输出快照变化，需确认是语义升级而非误回归。
