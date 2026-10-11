# Package Guidelines (`packages/babel`)

## 适用范围

- 本文件适用于 `packages/babel`。
- 该包当前主要提供 Babel 基础能力导出与实验性 AST 评估测试，不应视为稳定公共 API。

## 核心职责

- `src/index.ts`：导出 `parse`、`parseExpression`、`traverse` 等基础能力。
- `src/babel.ts` 与 `test/evaluate.test.ts`：用于常量折叠/表达式评估实验验证。

## 变更原则

- 保持导出面最小化，不在该包引入与 Babel 基础能力无关的封装。
- 若调整 `traverse` 兼容导出方式（`_interopDefaultCompat`），需验证 CJS/ESM 双端行为。
- 实验性变换逻辑应优先留在测试或明确实验入口，避免误扩散到生产链路。

## 测试要求

- 修改导出逻辑时，至少补充一条导出可用性断言。
- 修改 `evaluate` 类逻辑时，必须更新对应 snapshot，并在说明中标注变换预期。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/babel test`
- `pnpm --filter @weapp-tailwindcss/babel build`
- 定向回归：
  - `pnpm --filter @weapp-tailwindcss/babel exec vitest run test/evaluate.test.ts`
