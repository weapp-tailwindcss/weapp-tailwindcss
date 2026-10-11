# Package Guidelines (`packages-runtime/typography`)

## 适用范围

- 本文件适用于 `packages-runtime/typography`。
- 该包包含 Tailwind Typography 插件与 HTML class 注入转换器，面向小程序与 Web 双场景。

## 核心职责

- `src/index.cjs`：typography 插件主体（variant 注册、selector 变换、`legacy/modern` 目标处理）。
- `src/transform.ts`：HTML 结构注入 class 的转换函数（基于 `htmlparser2` + `magic-string`）。

## 变更原则

- 修改 selector 处理逻辑时，需保持 `legacy` 与 `modern` 目标行为兼容。
- `transform` 逻辑必须保持“已存在 class 前置追加、无 class 自动注入”的语义稳定。
- 避免在该包引入框架运行时依赖，保持“样式与标记转换工具”定位。
- 由于存在 JS/CJS 历史文件（`index.js` 等），修改导出形态时需同步关注 ESM/CJS 消费兼容。

## 测试要求

- 修改插件逻辑时，至少覆盖：
  - specificity 与 `:where` 行为；
  - variant 生成路径；
  - class mode 与 selector mode 差异。
- 修改 `transform.ts` 时，至少覆盖：
  - 嵌套标签；
  - 已有 class 与无 class；
  - prefix 注入。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/typography test`
- `pnpm --filter @weapp-tailwindcss/typography tsd`
- 定向回归：
  - `pnpm --filter @weapp-tailwindcss/typography exec vitest run test/index.test.ts`
  - `pnpm --filter @weapp-tailwindcss/typography exec vitest run test/transform.test.ts`
