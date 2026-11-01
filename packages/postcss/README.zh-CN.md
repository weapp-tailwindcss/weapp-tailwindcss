# @weapp-tailwindcss/postcss

`/syntax`、`/transform`、`/plugin` 子路径分别提供语法能力、CSS 转换和 PostCSS 生成编排。原根导出入口继续提供；下述管线迁移会改变返回契约。

独立入口 `@weapp-tailwindcss/postcss/native` 提供 `compileNativeCss(css, options)`，将 CSS 转成原生样式规则、变量和告警。React Native manifest ID、Tailwind 生成与运行时集成仍由 `@weapp-tailwindcss/react-native` 负责；导入其 `/runtime` 不会加载 CSS 编译器。

`@weapp-tailwindcss/postcss/native-runtime` 提供纯 JavaScript 的 `resolveNativeBoxShadow()` 值解释入口，按各条声明所属来源的默认值解析 class 变量，不加载 PostCSS 编译器、Node API 或 Tailwind 生成器。

LightningCSS 实验转换放在 `@weapp-tailwindcss/postcss/experimental/lightningcss`，不由稳定根入口导出。实验包的原入口负责加载引擎，PostCSS 子入口只引用 LightningCSS 类型；可选 peer 仅供实验类型的消费方使用。

> [English](./README.md) | 简体中文

这个包是 weapp-tailwindcss 的 CSS 处理核心，负责小程序端的 PostCSS AST 转换、选择器兼容、平台差异处理和 Tailwind 输出后处理。

## 批量 CSS 比较

对同一份 CSS 连续比较时，`createCssRuleMatcher(baseCss)` 提供 `contains(css)` 和 `filter(css)`，按需构建并复用比较索引，语义与 `containsCssAfterMinify`、`filterExistingCssRules` 相同。主样式变化后应创建新的 matcher，批量比较结束后释放引用。

## 管线 API 迁移（major）

`createStylePipeline(options)` 与 `handler.getPipeline()` 仍同步组装，返回以 `kind` 区分的 `StyleProcessingPipeline`。执行两种管线都可以直接使用共同的 Promise 入口：

```ts
import { createStyleHandler, postcss } from '@weapp-tailwindcss/postcss/transform'

const handler = createStyleHandler({ cssPreflight: false })
const pipeline = handler.getPipeline()
const result = await pipeline.process('.card { width: calc(1px + 2px) }', { from: undefined })

if (pipeline.kind === 'flat') {
  const native = postcss(pipeline.plugins).process('.card { color: red }', { from: undefined })
  console.log(native.css)
}
console.log(result.css)
```

`flat` 保留真实 `plugins`、`nodes[].plugin` 和原生 PostCSS 组合及同步行为。`phased` 只提供语义 `nodes`、明确的首 `prepare` 控制钩子 `controls` 与阶段执行器，不提供插件数组或 Processor 接口。作者选项捕获先于作者 prepare，平台消息交接先于平台 prepare。直接 `await pipeline.process(input, processOptions, afterPlugins)`；返回 Promise 不提供 `.sync()`、`.async()` 或 `.use()`。`afterPlugins` 是平台原生尾列表，仍遵守原生 prepare 时序，不是第三个完整处理屏障。

只有原作者包装器路径进入 phased：先排除原生 UVUE 作者样式提前返回，再检查实际 calc 插件存在且配置作者列表非空。原生归一化后成员为空的作者列表跳过作者执行。首个原生 process 接收原 input 与 options，包括 Result、LazyResult、Document 和带 toString 的对象；其构造错误保留原生同步时点，后续异步与平台错误沿 Promise 拒绝。不会隐式等待 pending LazyResult，也不在同步失败后重试。

作者完整遍历并序列化后，平台才准备和遍历；交接作者最终 Root／Document 与保持对象身份及顺序的独立消息数组。作者只建立一次 `map: false` 浅选项外壳，平台使用捕获的原选项活引用，保留首输入和 parser 的原生选项写入；不把作者 Result 生成的 map 新注入 prev。同一 phased 计划保留归一化作者与 preset 实例，每次 phased 实际执行新建 ctx 和库内 pre/post；第三方闭包仍共享。原缓存准入保持，CSS 结果命中不意味着再次执行插件。

**Document 的破坏性差异：** 作者现在一次处理整个 Document。prepare、旧函数 transformer、Result 和作者序列化从每个子 Root 各一次变为整个 Document 一次；原生对象 Once／OnceExit 仍按子 Root 执行。作者替换的根会真实进入平台；annotation 清理由整个 Document 的原生规则决定，因此子 Root 中可能保留旧逐 Root 包装器会移除的注释。需要旧逐子 Root 契约的调用方须自行明确编排。同步组装不解析模块字符串或工厂 tuple，handler 原有外部配置路径继续负责该归一化。

handler 的保护、外部作者递归、框架／compiler finalizer 和既有终态 map 策略保留；本迁移不证明所有后续 CSS 改写都具有准确终态映射。

## 官网

更多接入方式、配置说明和框架示例见 [weapp-tailwindcss 官方文档](https://tw.weapp.dev)。
