# Package Guidelines (`packages/postcss`)

## 适用范围

- 本文件适用于 `packages/postcss`。
- 本包拥有通用 CSS 语法解析、tokenize、AST 变换和平台兼容 PostCSS 管线；Tailwind CSS 4 生成专用的 CSS 处理由 `packages/engine` 拥有。
- 本包聚焦 CSS AST 级处理，不承担 JS/模板层的启发式纠错职责，也不承担 bundler 生命周期或 Tailwind class 生成。

## 包内结构约定

- `syntax`、`transform`、`plugin` 为独立公开子路径；根入口保持兼容。核心消费者不得经根聚合入口触达插件编排。
- 来源指令由本包解析为共享扫描描述；路径、glob、匹配与分组由 `@weapp-tailwindcss/source-scan` 负责。

- `src/syntax/`：CSS/SCSS 解析、`@import` specifier tokenize/quote，以及对外暴露的 syntax API。
- `src/plugins/`：插件实现与 pipeline 组装。
- `src/compat/`：版本兼容与降级逻辑，包括 uni-app x 边框 preflight、style value、legacy selector/unit 与 Tailwind v4 theme source 变换。
- `src/selectorParser/`：选择器解析相关能力。
- `src/utils/`：纯工具函数，保持无副作用、可单测。

## 所有权

- 新增 CSS parser/tokenizer/selector/value/compat 变换时写在本包并导出；禁止在 `packages/weapp-tailwindcss` 再实现一份。
- `postcss-scss`、`@csstools/*`、`postcss-selector-parser`、`postcss-value-parser` 只作为本包依赖。
- 主包可以通过本包 re-export 的 `postcss` 做编排级 parse/walk，但不能拥有这些 CSS 工具依赖。

## 变更原则

- 优先基于 PostCSS AST 做变换，避免对原始字符串做全局替换。
- 调整插件顺序时，必须在测试中覆盖“顺序相关回归”（例如 pre/post 阶段行为）。
- 与平台相关（`uni-app`、`uni-app-x`、`mp`）的行为修改，必须补对应平台用例。
- 若修改默认配置或兼容策略，需同步更新快照与说明，避免隐式行为漂移。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/postcss test`
- `pnpm --filter @weapp-tailwindcss/postcss exec vitest run -u`（仅在确认预期变更时）
- 针对单模块：`pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/<case>.test.ts`
- 语法层回归：`pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/syntax-css-import.test.ts`

## 测试补充要求

- 新增 bug fix 时，优先添加最小输入/输出断言，不仅依赖 snapshot。
- 涉及性能路径（如 calc、selector parser）时，至少补一个边界 case，防止复杂选择器退化。

## 原生测试边界

- 普通 `vitest.config.ts` 始终排除 `test/native/**`，不要求本机编译或安装原生二进制；mock loader 与平台路由测试仍在普通入口执行。
- 真正加载 ABI 的测试集中在 `test/native/`，使用 `pnpm --filter @weapp-tailwindcss/postcss exec vitest run --config vitest.native.config.ts --update=none --coverage.enabled=false`。该入口强制 `WEAPP_TW_NATIVE=required`，先加载真实 binding；缺失、损坏或 ABI 不兼容必须失败，禁止探测后 skip。
- 原生门禁先构建或安装当前提交的二进制，再运行上述专用配置。其他包新增原生行为时，同时验证普通无二进制入口与真实原生入口；修改 selector/value fixture 路径需同步 `test/native/` 的相对引用。
