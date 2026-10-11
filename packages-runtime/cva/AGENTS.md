# Package Guidelines (`packages-runtime/cva`)

## 适用范围

- 本文件适用于 `packages-runtime/cva`。
- 该包是 `class-variance-authority` 的小程序运行时封装。

## 核心约束

- 目标是保持 `cva` 调用签名与类型推导体验兼容上游。
- 默认行为为“运行时 escape 输出”，并支持通过 `create(options)` 覆写 escape/unescape。
- 内部缓存需保持有界与可预测，避免引入全局共享状态。

## 变更原则

- 变更 `create` 或 `cva` 包装逻辑时，必须覆盖默认行为与关闭 escape 的分支。
- 处理 escaped 输入（如 `text-_b_hececec_B`）时，要保证与原始输入行为一致，不产生双重污染。
- 新增配置项时，优先复用 `@weapp-tailwindcss/runtime` 既有 `CreateOptions` 语义。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/cva test`
- `pnpm --filter @weapp-tailwindcss/cva tsd`
- 定向回归：
  - `pnpm --filter @weapp-tailwindcss/cva exec vitest run test/cva.test.ts`

## 提交前检查

- 确认类型导出与 `package.json` `exports` 产物一致。
- 若输出字符串变化，需在提交说明中给出行为预期变化说明。
