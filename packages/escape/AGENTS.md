# `@weapp-tailwindcss/escape`

## 适用范围

本目录维护独立发布的类名转义基础包。源码来自 weapp-core 的 8.0.0，来源及发布切换见 [迁移记录](./MIGRATION.md)。

## 核心职责

- `src/constants.ts`、`src/mapping.ts` 定义映射及其缓存；`src/escape.ts`、`src/unescape.ts` 实现双向转换。
- CSS 消费方为 `../postcss/src/selectorParser/`；模板和 JS 消费方经 `../weapp-tailwindcss/src/wxml/shared.ts` 使用相同映射。
- 运行时经 `../../packages-runtime/runtime/src/transformers.ts` 共享 escape/unescape；merge、cn 在其上封装。
- JS 字符串语法转义仍在 `../weapp-tailwindcss/src/js/js-string-escape.ts`，不属于本包。

## 变更原则

使用 `@weapp-tailwindcss/escape` 包名、独立版本和 ESM/CJS 双入口。基础包不反向依赖编译器、PostCSS 或 runtime。迁移不改变映射、首字符规则、Unicode 或自定义 map 语义。

## 测试要求

修改源码后先执行 `pnpm --filter @weapp-tailwindcss/escape build`，下游包通过 dist 导出消费，不能把旧产物的结果当作当前源码证据。

行为改动同时覆盖源单测、消费者定向回归和打包入口。`escape-published` 固定为 npm 8.0.0，仅用于迁移行为对照；未来有意改变行为时必须明确更新兼容性断言，不静默替换基准版本。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/escape test`
- `pnpm --filter @weapp-tailwindcss/escape typecheck`
- `pnpm --filter @weapp-tailwindcss/escape test:types`
- `pnpm --filter @weapp-tailwindcss/escape test:package`

## 提交前检查

确认声明及产物不引用 workspace 源码；change intent 使用中文，由仓库 repoctl 发布。旧 npm 包仅作为历史兼容基准，不能接管其版本号或 trusted publisher；regex 不迁移。
