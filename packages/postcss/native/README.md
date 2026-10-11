# Rust CSS 转换内核

此内核负责选择器 tokenize、CSS escape 解码、类名转义、复杂伪类展开与序列化，以及 Tailwind v4 变量 fallback、圆角 clamp、渐变方向、infinity/calc 和 uvue translate 的值解析与转换。PostCSS AST、其余平台兼容处理、单位和颜色处理、用户插件仍由现有管线执行，不能将其称为完整 CSS 管线迁移。逐模块状态见[迁移覆盖清单](MIGRATION.md)。

`transformSelector` 接收 UTF-16 原始选择器，支持类名、简单 ASCII ID、嵌套符、组合器与列表。遇到未接管的语法返回 `null`，由原有 AST 路径处理；自定义映射也继续走 AST。`transformSelectors` 是同一语义的批量接口。不会在 NAPI 传递 PostCSS AST 或调用用户插件。显式 escape map 按内容生成快照，同一对象原地修改后会刷新映射与选择器缓存。

生产规则转换改用 `SelectorRuleTransformer`，公共入口按有效内容生成配置快照，root/universal/child 数组、平台开关或 escapeMap 变化时统一重建 JS/原生实例与结果缓存；每个原生实例构造时只传一次替换和平台开关，之后 `transform(selector)` 返回 `{ selector, remove, spacing }`。Rust 内部先使用简单选择器路径，否则一次解析 arena AST，完成 where/is 嵌套展开、RTL、不支持伪类与伪元素移除、空分支清理和 spacing 选择器替换。PostCSS 根据动作更新原规则和声明。注释、命名空间、部分特殊 escape、小数 keyframes、自定义映射和超过 128 层的嵌套仍回退；展开达到 100,000 个 arena 节点时也回退。未将这些边界标记为迁移完成。

`normalizeV4VariableFallbacks` 一次解析完成空 `--tw-` fallback、gradient via-stops 拆分和位置变量 fallback 三个阶段。`normalizeUvueTransformValue` 只改写 translate 的直接逗号分隔符，保留嵌套 var、字符串、URL 和注释。生产 uvue 管线使用 `normalizeUvueTransformValues` 批量接口，按声明顺序回写；未闭合值和达到 256 层的嵌套返回 `null`，逐项使用原有 value-parser。Rust AST 借用输入 UTF-16 切片，避免每个 token 复制文本，AST 不跨 NAPI。

生产声明使用 `normalizeV4Declaration(value, options)` 合并变量 fallback、渐变方向、infinity/calc 与圆角数值处理，减少逐阶段调用。上层显式传入父规则决定的渐变回退方向，仍负责声明删除、访问顺序与 AST 写回。公开渐变工具分别消费 `normalizeV4GradientPosition` 和 `normalizeV4InfinityCalc`；数值舍入、JS 空白与正则边界通过真实 ABI 差分验证，不使用 Rust 默认 Unicode 分类替代原有语义。

`escapeClasses` 保留为原始边界实验与 ABI 对拍入口，接收一批 UTF-16 已解码类名与可选 ASCII 映射。它在小输入上的 NAPI 成本超过转换收益，已从生产转换路径移除。

运行 `pnpm --filter @weapp-tailwindcss/postcss build:native` 构建当前平台的本地二进制。加载器先解析 `@weapp-tailwindcss/native-<suffix>/postcss`，只有解析报告 `MODULE_NOT_FOUND` 时才查找本包 `native/weapp-tailwindcss-postcss.node`。已存在的平台包加载或 ABI 错误不能再由本地二进制掩盖。支持的 suffix 为 macOS arm64/x64、Linux GNU/musl arm64/x64、Windows MSVC arm64/x64；Linux 无法确认 libc 时不猜测 musl。预编译平台包与主编译器共用发布单元，CSS 仍由本包独立加载和消费。消费者安装时不编译或下载二进制。

`WEAPP_TW_NATIVE` 支持：

- `auto`：显式尝试加载；模块缺失或 ABI 不兼容时回退 TypeScript。
- `off`：默认使用现有 PostCSS/TypeScript 实现。
- `required`：缺失二进制或 ABI 不兼容时抛出原始加载错误；均缺失时包含两次解析错误。

CSS 内核默认关闭。需要验证或显式采用原生 CSS 边界时，在进程启动前设置 `WEAPP_TW_NATIVE=auto` 或 `required`；该开关与 JS/WXML 原生内核共用，三者未设置时均保持 `off`。

原生转换异常不会被加载器吞掉；不完整批次会报错。原生差分测试位于 `test/native/`，独立配置强制 required 并在 setup 实际加载内核，执行前必须构建二进制；缺失或损坏时失败，不能探测后跳过。普通测试配置始终排除此目录，mock loader/平台路由仍运行，不要求消费者编译二进制。值和选择器兼容实现的第三方许可保留在 [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt)。

验证入口：

```sh
pnpm --filter @weapp-tailwindcss/postcss build:native
pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/native-selectors-loader.test.ts test/native-selector-platform.test.ts --update=none --coverage.enabled=false
pnpm --filter @weapp-tailwindcss/postcss exec vitest run --config vitest.native.config.ts --update=none --coverage.enabled=false
pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/uni-app-x.test.ts --update=none --coverage.enabled=false
pnpm --filter @weapp-tailwindcss/postcss exec tsx native/benchmark.mts
pnpm --filter @weapp-tailwindcss/postcss exec tsx native/benchmark.mts --check
pnpm --filter @weapp-tailwindcss/postcss exec tsx native/value-benchmark.mts
```

benchmark 在同一进程内交替测量 1、8、64 个类名的批处理、无缓存选择器 root 以及 v4/NutUI 真实 CSS fixtures，先断言输出一致，再记录输入与二进制 SHA-256、依赖、环境、35 次样本及 median/p95。它包括 PostCSS parse、规则转换和 stringify，但不包含完整插件管线、框架构建或 HMR。

2026-10-04 首轮已解码类名实验比 TypeScript 慢，包含解析和映射的选择器 root 慢约 11–15%。扩大到直接选择器转换后，1/8/64 类名的 root 样本分别快约 1.87/4.02/5.25 倍；261 KB NutUI fixture 的规则处理两轮约快 11–20%，v4 fixture 的差异较小。这是内核边界收益，不代表整个项目构建收益。完整范围与限制见[验证记录](../../../docs/engineering/lessons/rust-css-selector-boundary.md)。

值转换基准保留了 token 复制版本中 uvue 比 TypeScript 慢的样本。借用优化后单轮 gradient 1000 次为 6.681→2.553 ms，uvue 1000 次为 0.996→0.771 ms，uvue 256 条批次为 0.209→0.169 ms；NutUI 声明管线为 16.037→16.382 ms，没有稳定收益。完整数字、输入哈希和失败修正见[值迁移验证记录](../../../docs/engineering/lessons/rust-css-value-boundary.md)。

上述性能结果属于之前的简单选择器和值转换阶段。复杂选择器阶段暂未正式采样；`--check` 只做输出对比与覆盖统计，不计时。新的语义矩阵、覆盖数量和限制见[复杂选择器验证记录](../../../docs/engineering/lessons/rust-css-selector-ast.md)。
