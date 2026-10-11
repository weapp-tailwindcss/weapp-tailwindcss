# Package Guidelines (`packages/test-helper`)

## 适用范围

- 本文件适用于 `packages/test-helper`。
- 该包是测试辅助工具集，职责是提供稳定、可复用的测试输入处理与 CSS 产物辅助生成。

## 核心职责

- `src/tailwindcss4.ts`：提供 Tailwind v4 场景的 CSS 生成辅助。
- `src/removeComment.ts`：PostCSS 注释移除辅助。
- `src/index.ts`：仅做导出聚合。

## 变更原则

- 保持 helper 语义稳定，避免把业务逻辑塞入测试辅助层。
- helper 行为应显式稳定，不要为了统一接口而隐式改变输出语义。
- 输出变化需优先通过 fixture + snapshot 体现，避免“无对照”的隐式变更。

## 测试要求

- 修改生成逻辑时，至少覆盖：
  - v4 生成路径；
  - 注释移除场景（如涉及）。
- 若更新 fixture，需说明是预期升级还是回归修复。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/test-helper test`
- `pnpm --filter @weapp-tailwindcss/test-helper build`
- 定向回归：
  - `pnpm --filter @weapp-tailwindcss/test-helper exec vitest run test/index.test.ts`
