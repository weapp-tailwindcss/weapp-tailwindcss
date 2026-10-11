# Package Guidelines (`packages-runtime/variants`)

## 适用范围

- 本文件适用于 `packages-runtime/variants`。
- 该包是 `tailwind-variants` 的小程序封装，提供 `tv/cn/createTV` 的 escape/merge 运行时增强。

## 核心约束

- 对外 API 形态应尽量贴近 `tailwind-variants`，避免无必要的二次抽象。
- `cn` 返回“延迟执行函数”的设计是兼容关键点，不可改为立即求值。
- `cnBase` 应只做聚合与 escape，不做 `twMerge`。
- `tv` 包装器需要保留组件元信息（如 `variantKeys`），避免破坏生态用法。

## 变更原则

- 修改 `mergeConfigs` 或 `disableTailwindMerge` 时，需验证默认配置与调用时配置的覆盖顺序。
- 涉及 `twMergeConfig` 扩展行为变更时，必须覆盖 numeric text 等已存在回归场景。
- 变更 slot 包装逻辑时，需覆盖对象 slot 与函数 slot 两类输出。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/variants test`
- `pnpm --filter @weapp-tailwindcss/variants tsd`
- 定向回归：
  - `pnpm --filter @weapp-tailwindcss/variants exec vitest run test/variants.test.ts`
  - `pnpm --filter @weapp-tailwindcss/variants exec vitest run test/snapshot.test.ts`

## 提交前检查

- 若调整 `tv/cn` 语义，提交说明需注明是否保持与上游 API 行为兼容。
- 确认 `defaultConfig` 再导出未被破坏。
