# @weapp-tailwindcss/postcss

`/syntax`、`/transform`、`/plugin` 子路径分别提供语法能力、CSS 转换和 PostCSS 生成编排。原根导出保持兼容。

独立入口 `@weapp-tailwindcss/postcss/native` 提供 `compileNativeCss(css, options)`，将 CSS 转成原生样式规则、变量和告警。React Native manifest ID、Tailwind 生成与运行时集成仍由 `@weapp-tailwindcss/react-native` 负责；导入其 `/runtime` 不会加载 CSS 编译器。

LightningCSS 实验转换放在 `@weapp-tailwindcss/postcss/experimental/lightningcss`，不由稳定根入口导出。实验包的原入口负责加载引擎，PostCSS 子入口只引用 LightningCSS 类型；可选 peer 仅供实验类型的消费方使用。

> [English](./README.md) | 简体中文

这个包是 weapp-tailwindcss 的 CSS 处理核心，负责小程序端的 PostCSS AST 转换、选择器兼容、平台差异处理和 Tailwind 输出后处理。

## 批量 CSS 比较

对同一份 CSS 连续比较时，`createCssRuleMatcher(baseCss)` 提供 `contains(css)` 和 `filter(css)`，按需构建并复用比较索引，语义与 `containsCssAfterMinify`、`filterExistingCssRules` 相同。主样式变化后应创建新的 matcher，批量比较结束后释放引用。

## 官网

更多接入方式、配置说明和框架示例见 [weapp-tailwindcss 官方文档](https://tw.weapp.dev)。
