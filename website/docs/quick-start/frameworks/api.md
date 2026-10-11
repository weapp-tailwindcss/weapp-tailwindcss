---
title: Node.js API
description: '使用 weapp-tailwindcss/core 在自研构建器或脚本中处理 Tailwind CSS、小程序模板与 JavaScript，并正确维护运行时类名集合。'
keywords:
  - Node.js API
  - createCompiler
  - snapshot
  - createContext
  - transformJs
  - transformWxml
  - transformWxss
  - runtimeSet
  - classNameSet
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 自研构建器
---
# Node.js API

`weapp-tailwindcss/core` 提供不依赖 Vite、Webpack 或 Gulp 生命周期的框架 compiler 与文本转换 API。新集成使用 `createCompiler()` 管理 Tailwind 生成 root、revision 和不可变 snapshot；`createContext()` 保留原有自动 runtime 模式。

:::caution 高阶入口

普通 `uni-app`、Taro、Mpx、weapp-vite 或原生小程序项目，应优先使用对应的 Vite、Webpack 或 Gulp 插件。构建器插件已经负责 CSS 入口、模块图、watch/HMR、缓存和产物写回；Core API 会把这些职责交给调用方。

当前包要求 Node.js `^22.18.0 || >=24.11.0`。

:::

## 先理解职责边界

Core API 只处理传入的内存文本，不会扫描输出目录、替你写文件，也不会因为配置了 `cssEntries` 就把 CSS 入口自动加入构建图。

| 能力 | Core API 负责 | 调用方负责 |
| --- | --- | --- |
| Tailwind 类名集合 | 从明确配置的 Tailwind CSS 入口和 source 中收集、缓存与刷新 | 保证入口和 source 正确，并在合适的构建阶段触发刷新 |
| CSS | 把已经生成的 CSS 转成目标端兼容样式 | 让 Tailwind CSS 入口实际参与生成，并把结果交给 `transformWxss()` |
| WXML / AXML 等模板 | 转义静态 class 与表达式中的已确认类名 | 读取、写回产物并选择正确的平台模板文件 |
| JavaScript | 只转译运行时集合确认的 class，保留普通业务字符串 | 处理解析错误、source map、关联模块与文件写回 |
| watch / HMR | 复用同一个上下文中的运行时缓存 | 监听源码和配置变化，并在变化后重新收集运行时集合 |

Tailwind CSS v4 的样式生成必须继续由 `weapp-tailwindcss` 链路接管。不要为 Core API 额外注册 `@tailwindcss/postcss` 或 `@tailwindcss/vite` 作为生成兜底。

## `createCompiler()` 框架 API

`createCompiler()` 适合 vite-plugin-taro、weapp-vite 一类已经拥有模块图和产物生命周期的框架。它复用 Tailwind engine、Scanner、candidate index 和 source graph，但不会猜测源码目录、规范化 module ID 或直接写构建输出。

```ts
import path from 'node:path'
import { createCompiler } from 'weapp-tailwindcss/core'

const projectRoot = process.cwd()
const compiler = createCompiler({ appType: 'taro' })
const generated = await compiler.generate({
  id: 'virtual:tailwind/main',
  sourceOptions: {
    projectRoot,
    cssEntries: [path.resolve(projectRoot, 'src/tailwind.css')],
  },
  candidates: ['p-4', 'w-[10px]'],
  scanSources: false,
  target: 'web',
})

// 框架可先运行自己的 PostCSS，再把 Root 与同一 snapshot 交回 compiler。
const cssResult = await compiler.transformCss(generated.css, generated.snapshot)
const template = await compiler.transformTemplate(rawTemplate, generated.snapshot)
const jsResult = await compiler.transformJavaScript(rawJs, generated.snapshot)
```

| 方法 | 关键契约 |
| --- | --- |
| `generate(request)` | 按 opaque root `id` 生成 `web`、`weapp` 或 Tailwind 原始 CSS；返回 revision、增量 CSS、依赖、source patterns、缓存复用状态和 snapshot |
| `createSnapshot(request)` | 接入其他 Tailwind 生成链已经验证过的 classSet；输入集合会被隔离 |
| `mergeSnapshots(snapshots)` | 确定性合并模块图实际可达的 root；拒绝同 root 冲突 revision、冲突内容和混合 target |
| `finalizeCss()` / `finalizeCssRoot()` | 将 CSS 或 PostCSS Root 最终化为可交给小程序工具的样式；Root 输入会先 clone |
| `transformCss()` | 转换字符串 CSS；`snapshot.target === 'weapp'` 时默认清理 Tailwind 构建期 at-rule，可用 `finalize: false` 关闭 |
| `transformCssRoot()` | 转换 PostCSS Root；同样遵循 `finalize` 选项，且不修改输入 |
| `transformTemplate()` | 只转换 snapshot 精确命中的静态 class 和表达式候选 |
| `transformJavaScript()` | 返回现有 `JsHandlerResult`，保留 `error`、`map` 和 `linked` |
| `invalidate(ids)` | 精确匹配 root/dependency ID，并按 `snapshot.sources` 做 glob-aware 文件匹配；只在 glob 匹配边界剥离 query |
| `remove(id)` / `dispose()` | 幂等等待进行中工作，并释放 root/generator/Scanner 状态；自动淘汰可通过 `onRootEvicted` 观察 |

同一 root 的 `generate()` 串行提交，不同 root 可以并行。candidate-only 更新复用 engine；CSS 或配置依赖失效后替换会话。生成失败不会替换上一次成功 snapshot。开始 `dispose()` 后所有新任务都会被拒绝。

普通分包通常合并主包与当前分包 snapshot；独立分包只使用自己的 snapshot：

```ts
const normalSnapshot = compiler.mergeSnapshots([main.snapshot, subpackage.snapshot])
const independentSnapshot = independent.snapshot

const affectedRoots = compiler.invalidate(changedModuleIds)
// 框架根据 affectedRoots 调度下一轮 generate，并通过 bundler API 写回产物。
```

snapshot 的公开 classSet 是不可变视图，转换热路径会 O(1) 取得隔离的内部 Set。不要把 snapshot 展开后自行拼接集合，也不要用启发式候选补齐未命中的业务字符串。

官方 Vite、Webpack、Rspack 和 Gulp 适配器的默认 `graph` 路径共享同一个 compiler session：适配器仍负责模块图、watch/HMR、分包可达性和 asset 写回，Core 只接收明确的 source、依赖和 candidates。第三方框架可以复用此边界，不需要把 bundler 类型或文件系统路径引入 Core。

## 配置 Tailwind CSS 入口

Tailwind CSS v4 项目应给 `cssEntries` 传入绝对路径。入口用于识别 `@import "tailwindcss"`、`@source` 与 `@config`，但它仍然必须由你的构建流程实际加载。

```css title="src/tailwind.css"
@import "tailwindcss" source(none);

@source "./**/*.{html,wxml,js,ts,jsx,tsx,vue}";
@source not "../dist";
@source not "../unpackage";
```

```js
import path from 'node:path'
import { createContext } from 'weapp-tailwindcss/core'

const root = process.cwd()
const cssEntry = path.resolve(root, 'src/tailwind.css')

const ctx = createContext({
  tailwindcssBasedir: root,
  cssEntries: [cssEntry],
})
```

多入口、分包或独立分包项目应列出全部真实入口。`cssEntries` 等价于 `tailwindcss.v4.cssEntries` 的快捷配置。完整配置类型见 [`UserDefinedOptions`](/docs/api/interfaces/UserDefinedOptions) 和 [`cssEntries`](/docs/api/options/important#cssentries)。

## `createContext()` 兼容 API

`createContext(options)` 返回的四个方法共享同一份 Tailwind 运行时状态与类名集合。

| 方法 | 输入 | 返回值 | 关键行为 |
| --- | --- | --- | --- |
| `getRuntimeSet(options?)` | 刷新选项 | `Promise<Set<string>>` | 收集或刷新 Tailwind 已确认的运行时类名 |
| `transformWxss(rawCss, options?)` | 已生成的 CSS | `Promise<PostCSS Result>` | 通过 `result.css` 读取目标端 CSS，并更新内部运行时集合 |
| `transformWxml(rawTemplate, options?)` | 模板字符串 | `Promise<string>` | 转义 class 属性及模板表达式中的已确认类名 |
| `transformJs(rawJs, options?)` | JS 字符串 | `Promise<JsHandlerResult>` | 返回 `code`，并按配置返回 `map`、`error` 或 `linked` |

:::warning 返回值不是同一种类型

不要把三个 transform 的返回值都当成字符串：

- `transformWxss()` 返回 PostCSS Result，最终 CSS 在 `result.css`。
- `transformWxml()` 直接返回字符串。
- `transformJs()` 返回对象，最终 JavaScript 在 `result.code`。

:::

## 推荐调用时序

一个生产构建周期建议遵循下面的顺序：

1. 创建并复用一个 `createContext()`，不要为每个文件重新创建上下文。
2. 让 Tailwind CSS 入口先进入实际生成链路，得到待适配的 CSS。
3. 调用 `transformWxss()` 处理主样式；该步骤结束后会同步内部运行时集合。
4. 调用 `getRuntimeSet()` 读取同一集合，或在自定义生命周期中显式强制收集。
5. 使用同一个上下文调用 `transformWxml()` 和 `transformJs()`。
6. 检查 JS 解析错误，再由你的构建器通过自身产物 API 或文件流程写回结果。

如果你的构建流程先处理模板或 JavaScript，也可以先调用：

```js
const runtimeSet = await ctx.getRuntimeSet({
  forceCollect: true,
})
```

未显式传入 `runtimeSet` 时，`transformWxml()` 和 `transformJs()` 会在内部集合为空时自动收集一次。显式调用的价值是让构建阶段、错误定位和 watch 刷新更加清楚。

## 完整文件处理示例

下面假设上游生成步骤已把 Tailwind CSS 写入 `.build/tailwind.generated.css`。示例只展示 Core API 的内存转换和文件写回边界。

```js title="scripts/transform.mjs"
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createContext } from 'weapp-tailwindcss/core'

const root = process.cwd()
const sourceRoot = path.resolve(root, 'src')
const outputRoot = path.resolve(root, 'dist')

const ctx = createContext({
  tailwindcssBasedir: root,
  cssEntries: [path.resolve(sourceRoot, 'tailwind.css')],
  rem2rpx: true,
})

async function main() {
  const [generatedCss, rawWxml, rawJs] = await Promise.all([
    readFile(path.resolve(root, '.build/tailwind.generated.css'), 'utf8'),
    readFile(path.resolve(sourceRoot, 'pages/index/index.wxml'), 'utf8'),
    readFile(path.resolve(sourceRoot, 'pages/index/index.js'), 'utf8'),
  ])

  const cssResult = await ctx.transformWxss(generatedCss)
  const runtimeSet = await ctx.getRuntimeSet()
  const wxmlCode = await ctx.transformWxml(rawWxml)
  const jsResult = await ctx.transformJs(rawJs)

  if (jsResult.error) {
    throw jsResult.error
  }

  console.log(`collected ${runtimeSet.size} Tailwind classes`)

  await mkdir(path.resolve(outputRoot, 'pages/index'), { recursive: true })
  await Promise.all([
    writeFile(path.resolve(outputRoot, 'app.wxss'), cssResult.css),
    writeFile(path.resolve(outputRoot, 'pages/index/index.wxml'), wxmlCode),
    writeFile(path.resolve(outputRoot, 'pages/index/index.js'), jsResult.code),
  ])
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

CommonJS 项目可以使用 `const { createContext } = require('weapp-tailwindcss/core')`，其余 API 契约一致。

## `getRuntimeSet()` 刷新选项

默认调用会优先复用签名未变化的缓存；如果首次结果为空，还会刷新运行时并重新收集一次。

| 选项 | 行为 | 适用场景 |
| --- | --- | --- |
| `forceCollect` | 跳过当前集合缓存，从现有 Tailwind 运行时重新提取 | watch 中源码内容变化、新增运行时 class |
| `forceRefresh` | 先重建 Tailwind 运行时，再强制提取 | CSS 入口、`@source`、`@config` 或 Tailwind 配置发生结构变化 |
| `clearCache` | 在强制收集或刷新时同步清理 Tailwind 运行时缓存 | 配置或依赖变化后需要排除旧缓存；通常与 `forceRefresh` 一起使用 |
| `allowEmpty` | 接受空集合，不执行默认的第二次刷新 | 确认当前项目允许没有 Tailwind class，或只做状态探测 |

`clearCache: true` 单独使用不保证触发刷新，应该与 `forceCollect` 或 `forceRefresh` 组合。

```js
// 初次构建或普通源码变化
await ctx.getRuntimeSet({ forceCollect: true })

// Tailwind 配置、入口或 source 图发生变化
await ctx.getRuntimeSet({
  forceRefresh: true,
  clearCache: true,
})
```

watch/HMR 中必须先刷新集合，再处理受影响的 JS 和模板。不要用启发式转义弥补过期的集合；新 class 尚未进入集合时，保持原值比误改业务字符串更安全。

`jsArbitraryValueFallback` 已废弃，仅用于兼容旧配置。`true` 和 `'auto'` 都不会绕过 `classNameSet`；集合为空或候选未命中时，`transformJs()` 会保持源码不变。

## `runtimeSet` 的安全边界

`transformJs()` 的核心原则是 `classNameSet` 精确命中：只有 Tailwind 生成或验证过的 class 才能进入普通 JS 字符串的转译路径。

```js
const rawJs = [
  'const className = "text-[12px] w-1/2"',
  'callApi("order/get_order_amount", {}, "POST")',
].join('\n')

const { code, error } = await ctx.transformJs(rawJs)

if (error) {
  throw error
}

// text-[12px] w-1/2 -> text-_b12px_B w-1_f2
// order/get_order_amount 保持原样
console.log(code)
```

`transformJs(rawJs, { runtimeSet })` 是测试和自研构建器深度集成用的覆盖入口。传入它时应遵守以下约束：

- 集合应来自 `getRuntimeSet()` 或 Tailwind v4 的生成/验证结果。
- 不要把扫描器发现的所有字符串直接塞入集合。
- 不要把 API、路由、资源路径、MIME 或日志文本当成 class。
- 不要修改一个正在被其他并发转换复用的 `Set`；刷新后使用新的集合快照。

从 `weapp-tailwindcss@5.1.8` 起，非 class 上下文中的普通斜杠路径还有额外保护，但这只是纵深防御，不能替代正确的候选验证。相关回归见 [issue #903](https://github.com/sonofmagic/weapp-tailwindcss/issues/903)。

## 精确忽略冲突字符串

正常项目不需要为 API 路径配置忽略规则。如果业务字符串确实与有效 Tailwind class 完全相同，可以选择局部或全局保护。

### 局部保护

默认会识别名为 `weappTwIgnore` 的标签模板：

```js
import { weappTwIgnore } from 'weapp-tailwindcss/escape'

const value = weappTwIgnore`w-1/2`
```

### 全局规则

```js
const ctx = createContext({
  jsPreserveClass: keyword => keyword.startsWith('internal-route:'),
})
```

`jsPreserveClass` 返回 `true` 时保留当前字符串。详细配置见 [`jsPreserveClass`](/docs/api/options/important#jspreserveclass) 和 [`ignoreTaggedTemplateExpressionIdentifiers`](/docs/api/options/important#ignoretaggedtemplateexpressionidentifiers)。

:::danger 谨慎使用 `alwaysEscape`

`transformJs(rawJs, { alwaysEscape: true })` 会绕过 `classNameSet` 安全边界。它只适合输入内容已经确定全部是 class 的专用转换步骤，不应对普通业务 JavaScript 启用。

:::

## 返回值与错误处理

### `transformWxss()`

返回 PostCSS Result。常用字段包括：

- `css`：最终目标端 CSS。
- `map`：启用 source map 后的 PostCSS source map。
- `messages`：PostCSS 插件产生的元数据和提示。
- `warnings()`：收集 PostCSS warning。

不传 `isMainChunk` 时默认按主样式处理。处理分包或次级样式时，应根据你的构建图显式传入正确的 `IStyleHandlerOptions`。

### `transformWxml()`

直接返回模板字符串。可以通过 `{ runtimeSet }` 覆盖当前调用使用的集合，但通常应复用上下文自动维护的集合。

### `transformJs()`

返回 `JsHandlerResult`：

- `code`：转换后的 JavaScript；解析失败时保持原始输入。
- `map`：启用时生成的 source map。
- `error`：Babel 解析错误。Core API 会把错误放在结果中，调用方必须主动检查。
- `linked`：启用 `filename + moduleGraph` 跨模块分析后产生的关联模块结果，以绝对路径为键；调用方负责把它们交回构建图。

除显式底层参数 `alwaysEscape: true` 外，`transformJs()` 只转译精确命中当前 `classNameSet` 的候选。空集合、缺失集合和未命中候选都会原样保留。

## 常见问题排查

| 现象 | 优先检查 |
| --- | --- |
| 提示“未检测到 cssEntries” | 是否传入了绝对路径；入口是否真的包含 Tailwind 引用 |
| CSS 有 class，JS/WXML 没有转义 | `@source` 是否覆盖源码；是否在 Tailwind 生成完成前收集了集合 |
| watch 新增 class 不生效 | 是否在源码变化后调用 `getRuntimeSet({ forceCollect: true })`，并在刷新后再转换产物 |
| 修改 Tailwind 配置后仍使用旧结果 | 调用 `getRuntimeSet({ forceRefresh: true, clearCache: true })` |
| API、路由或资源路径被改写 | 升级到最新版；确认未使用 `alwaysEscape`，并检查手工 `runtimeSet` 是否被普通字符串污染 |
| `transformJs()` 没有抛错但代码未变化 | 检查返回值中的 `error`；解析失败时 `code` 会保持原文 |
| 配置了 `cssEntries` 但没有 CSS 产物 | `cssEntries` 只提供入口语义，不会替代构建器加载或生成 CSS |

## 和构建器插件的区别

| 使用方式 | 适合场景 | 构建生命周期 |
| --- | --- | --- |
| `weapp-tailwindcss/vite` | Vite、uni-app Vite、Taro Vite、weapp-vite | 插件接管模块图、CSS 生成、运行时集合和 HMR |
| `weapp-tailwindcss/webpack` | Webpack、Taro Webpack、Mpx | 插件接管 compilation、loader 与产物图 |
| `weapp-tailwindcss/gulp` | 原生小程序流式构建 | 插件接管 Vinyl 文件和增量任务 |
| `weapp-tailwindcss/core` | 自研构建器、批处理脚本、平台适配器 | 调用方显式组织生成、刷新、转换和写回 |

普通项目请先阅读 [Tailwind CSS 4 默认模式参考](/docs/tailwindcss/v4-reference)，再选择对应框架的接入页。
