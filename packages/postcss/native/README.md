# Rust 选择器转换内核

此内核负责常见类名选择器的 tokenize、CSS escape 解码、类名转义和紧凑序列化。PostCSS AST、复杂伪类展开、平台兼容处理、单位和颜色处理、用户插件仍由现有管线执行，不能将其称为完整 CSS 管线迁移。

`transformSelector` 接收 UTF-16 原始选择器，支持类名、简单 ASCII ID、嵌套符、组合器与列表。遇到未接管的语法返回 `null`，由原有 AST 路径处理；自定义映射也继续走 AST。`transformSelectors` 是同一语义的批量接口。不会在 NAPI 传递 PostCSS AST，也不会修改声明或调用用户插件。

`escapeClasses` 保留为原始边界实验与 ABI 对拍入口，接收一批 UTF-16 已解码类名与可选 ASCII 映射。它在小输入上的 NAPI 成本超过转换收益，已从生产转换路径移除。

运行 `pnpm --filter @weapp-tailwindcss/postcss build:native` 构建当前平台的本地二进制。加载器先查找本包 `native/weapp-tailwindcss-postcss.node`，再加载 `@weapp-tailwindcss/native-<suffix>/postcss`。支持的 suffix 为 macOS arm64/x64、Linux GNU/musl arm64/x64、Windows MSVC arm64/x64；预编译平台包与主编译器共用发布单元，CSS 仍由本包独立加载和消费。消费者安装时不编译或下载二进制。

`WEAPP_TW_NATIVE` 支持：

- `auto`：默认尝试加载；模块缺失或 ABI 不兼容时回退 TypeScript。
- `off`：完全使用 TypeScript。
- `required`：缺失二进制或 ABI 不兼容时抛出明确错误。

原生转换异常不会被加载器吞掉。新增的 `native-selectors.test.ts` 强制实际加载原生内核，执行该测试前必须构建二进制。

验证入口：

```sh
pnpm --filter @weapp-tailwindcss/postcss build:native
pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/native-selector-transform.test.ts test/native-selectors.test.ts test/native-selectors-loader.test.ts test/native-selector-platform.test.ts --update=none --coverage.enabled=false
pnpm --filter @weapp-tailwindcss/postcss exec tsx native/benchmark.mts
```

benchmark 在同一进程内交替测量 1、8、64 个类名的批处理、无缓存选择器 root 以及 v4/NutUI 真实 CSS fixtures，先断言输出一致，再记录输入与二进制 SHA-256、依赖、环境、35 次样本及 median/p95。它包括 PostCSS parse、规则转换和 stringify，但不包含完整插件管线、框架构建或 HMR。

2026-10-04 首轮已解码类名实验比 TypeScript 慢，包含解析和映射的选择器 root 慢约 11–15%。扩大到直接选择器转换后，1/8/64 类名的 root 样本分别快约 1.87/4.02/5.25 倍；261 KB NutUI fixture 的规则处理两轮约快 11–20%，v4 fixture 的差异较小。这是内核边界收益，不代表整个项目构建收益。完整范围与限制见[验证记录](../../../docs/engineering/lessons/rust-css-selector-boundary.md)。
