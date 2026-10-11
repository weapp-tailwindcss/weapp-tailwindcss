---
title: uni-app x 配置参考
description: uni-app x、HBuilderX 与 weapp-tailwindcss 的 Tailwind CSS 4 配置职责、用法和多端边界。
keywords:
  - uni-app x
  - HBuilderX
  - uniAppX
  - Tailwind CSS 4
  - componentLocalStyles
  - 样式隔离
  - 单位转换
  - uvue
---

# uni-app x 配置参考

本页说明 `uniAppX()` preset 的每个公开配置。首次接入请先看 [uni-app x 快速开始](../quick-start/frameworks/uni-app-x)，遇到问题时再按本页区分候选扫描、CSS 生成、类名转译和局部样式。

## 支持基线

- `weapp-tailwindcss` `5.3.3`
- Tailwind CSS `4.x`
- Node.js `^22.18.0 || >=24.11.0`
- HBuilderX `>=5.11`
- HBuilderX Web、小程序、Android、iOS 与 HarmonyOS

## 最小配置

```ts title="vite.config.ts"
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { uniAppX } from 'weapp-tailwindcss/presets'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

const projectRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    uni(),
    WeappTailwindcss(uniAppX({
      base: projectRoot,
      cssEntries: [resolve(projectRoot, 'main.css')],
    })),
  ],
})
```

Tailwind CSS 生成由 `weapp-tailwindcss` 接管，同一次构建不要再注册 `tailwindcss`、`@tailwindcss/postcss` 或 `@tailwindcss/vite`。

## 先分清四个职责

| 阶段 | 机制 | 解决的问题 |
| --- | --- | --- |
| 候选发现 | CSS 中的 `@source` | 哪些 `.uvue`、`.uts` 文件里的 class 需要生成 |
| 入口识别 | `cssEntries` | 哪些纯 CSS 文件包含 Tailwind 指令与扫描声明 |
| CSS 生成 | `generator` | 将候选编译为当前目标可消费的 CSS |
| 隔离内投递 | `componentLocalStyles` | 将组件实际使用的 utility 放入组件自己的局部样式作用域 |

`cssEntries` 不会替代真实 import，`componentLocalStyles` 也不会替代 `@source`。出现“class 已扫描但组件内部没样式”时，通常已经越过前三层，问题在样式隔离投递。

## 配置索引

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| [`base`](#base) | `string` | 必填 | uni-app x 工程根目录 |
| [`cssEntries`](#cssentries) | `string[]` | 自动识别 | Tailwind CSS 4 入口列表 |
| [`rem2rpx`](#rem2rpx) | `boolean \| object` | 关闭 | `rem` 转 `rpx` |
| [`unitsToPx`](#unitstopx) | `boolean \| object` | 关闭 | 多种长度单位统一转 `px` |
| [`unitConversion`](#unitconversion) | `object \| false` | 关闭 | 自定义或分平台单位转换 |
| [`generator`](#generator) | `object \| false` | 按目标推断 | Tailwind CSS 生成策略 |
| [`uniAppX`](#uniappx) | `boolean \| object` | 原生 App 自动启用 | uvue/App 适配总开关与细粒度配置 |
| [`componentLocalStyles`](#componentlocalstyles) | `boolean \| object` | `true` | 组件局部 Tailwind 样式快捷入口 |
| [`uvueUnsupported`](#uvueunsupported) | `'error' \| 'warn' \| 'silent'` | `'warn'` | 不兼容 utility 的处理方式 |
| [`customAttributes`](#customattributes) | `ICustomAttributes` | 无 | 转换 `class` 之外的类名属性 |
| [`resolve`](#resolve) | `PackageResolvingOptions` | 工程依赖路径 | Tailwind 包解析位置 |
| [`rawOptions`](#rawoptions) | `UserDefinedOptions` | 无 | 透传核心插件选项 |

## 配置详情

### `base` {#base}

**作用** 提供稳定的工程根目录，preset 会据此解析 `node_modules`、Tailwind 入口和相对扫描路径。

**使用场景** 所有项目都必须传。HBuilderX 启动构建时可能改变 `process.cwd()`，所以不要把当前工作目录当作工程根目录。

**用法** 从配置文件 URL 推导跨平台绝对路径：

```ts
const projectRoot = dirname(fileURLToPath(import.meta.url))
uniAppX({ base: projectRoot })
```

**注意事项** 不要硬编码本机绝对路径，也不要通过字符串拼接路径。

### `cssEntries` {#cssentries}

**作用** 告诉生成器哪些纯 CSS 文件是 Tailwind CSS 4 入口，以便读取 `@import`、`@source` 和 `@config`。

**使用场景** 建议所有业务项目显式配置；多入口、分包或独立样式入口必须全部列出。

**用法** 使用从 `base` 解析出的绝对路径，并在 `App.uvue` 中真实导入同一文件：

```ts
cssEntries: [resolve(projectRoot, 'main.css')]
```

```html title="App.uvue"
<style>
@import './main.css';
</style>
```

**注意事项** 只配置 `cssEntries` 而没有真实 `@import`，会出现生成器识别了入口、但 HBuilderX 没有加载 CSS 资产的情况。

### `rem2rpx` {#rem2rpx}

**作用** 在样式处理阶段把 `rem` 转成 `rpx`。传 `true` 时使用 `rootValue: 32`、全属性转换和 `rpx` 输出。

**使用场景** 设计稿或第三方 CSS 以 `rem` 表达尺寸，而小程序目标需要 `rpx` 时使用。

**用法** 简单项目传 `true`，需要不同根字号时传对象：

```ts
rem2rpx: { rootValue: 16, propList: ['*'], transformUnit: 'rpx' }
```

**注意事项** 它是 `uniAppX()` 的顶层快捷配置。不要再用 `unitConversion` 配置同一条 `rem -> rpx` 规则，否则可能重复转换。

### `unitsToPx` {#unitstopx}

**作用** 使用默认单位表或自定义映射，将多种长度单位统一转换为 `px`。

**使用场景** 原生 uvue 目标只接受有限长度单位，且项目希望统一输出 `px` 时使用。

**用法** 可控制精度、最小值、属性和选择器范围：

```ts
unitsToPx: {
  unitPrecision: 4,
  propList: ['font-size', 'line-height'],
}
```

**注意事项** 这是通用批量转换，不负责按平台选择规则。需要 Web、小程序和 App 使用不同映射时应改用 `unitConversion`。

### `unitConversion` {#unitconversion}

**作用** 通过明确规则执行任意单位转换，并可按照 `UNI_PLATFORM`、`UNI_UTS_PLATFORM` 等环境选择平台配置。

**使用场景** 同一套源码需要在小程序输出 `rpx`、在原生 App 输出 `px`，或需要组合多条转换规则时使用。

**用法** 使用公开 preset 组合平台规则：

```ts
import { unitConversionPresets } from 'weapp-tailwindcss'

unitConversion: {
  platforms: {
    'mp-weixin': { rules: [unitConversionPresets.pxToRpx({ ratio: 2 })] },
    'app-android': { rules: [unitConversionPresets.rpxToPx({ ratio: 0.5 })] },
  },
}
```

**注意事项** `rem2rpx`、`unitsToPx` 和 `unitConversion` 的匹配范围不要重叠。优先选择一个能完整表达需求的入口，避免同一声明被连续改写。

### `generator` {#generator}

**作用** 控制 Tailwind CSS 4 生成目标与 Web 兼容降级。preset 会根据当前构建环境自动选择 `web` 或小程序输出。

**使用场景** 通常无需配置；只有自定义环境无法提供平台变量，或项目明确调整 Web 兼容基线时才覆盖。

**用法** 现代 WebView 项目确认无需兼容降级后可以显式关闭：

```ts
generator: { target: 'web', webCompat: false }
```

**注意事项** uni-app x 原生 App 不存在 `target: 'app'`，原生约束由 `uniAppX` 链路处理。`generator: false` 会关闭内置 Tailwind 生成，普通项目不要使用。

### `uniAppX` {#uniappx}

**作用** 控制 uni-app x 模板转译、uvue 原生样式兼容和局部样式子配置。

**使用场景** preset 会按环境解析，通常保持默认。只有需要细调 `componentLocalStyles` 或 `uvueUnsupported` 时传对象。

**用法** 对象配置可集中表达原生兼容策略：

```ts
uniAppX: {
  componentLocalStyles: true,
  uvueUnsupported: 'error',
}
```

**注意事项** 顶层 `componentLocalStyles`、`uvueUnsupported` 是快捷入口；同名的 `uniAppX.*` 嵌套值优先于快捷入口，`rawOptions` 中的值又具有最高优先级。不要在多个层级重复配置同一项。

### `componentLocalStyles` {#componentlocalstyles}

**作用** 在样式隔离场景中，将组件或页面实际使用的 Tailwind utility 编译进对应 `.uvue` 的局部 scoped style。

**使用场景** HBuilderX 5 样式隔离 2.0 下，组件默认是 `isolated`，不能引用 `App.uvue` 中的全局 class；这时必须依靠局部样式桥让组件内部节点使用 Tailwind。完整隔离规则见 [DCloud 样式隔离 2.0 文档](https://doc.dcloud.net.cn/uni-app-x/css/common/style-isolation.html)。

**用法** 默认的 `true` 已覆盖 `components` 和 `pages`。项目使用自定义目录时同时保留默认目录：

```ts
componentLocalStyles: {
  componentMatcher: id => /(?:^|\/)(?:components|layouts)\/.+\.(?:uvue|nvue)$/.test(id),
  pageMatcher: id => /(?:^|\/)(?:pages|screens)\/.+\.(?:uvue|nvue)$/.test(id),
}
```

**注意事项** `componentMatcher` 和 `pageMatcher` 会覆盖默认 matcher。回调收到的 module id 已移除 query/hash，并统一为正斜杠。

样式隔离 2.0 的默认关系是：全局样式可以影响页面，但不能影响隔离组件内部；组件根节点接受父层 `class/style` 传递属于单独的根样式规则。因此“根节点生效、内部节点失效”正是隔离边界的表现，不是 Tailwind 漏扫。

插件的概念转换如下，实际 alias 会按文件和 utility 生成稳定哈希：

```vue
<!-- 转换前 -->
<view class="w-full h-[200px]" />

<!-- 概念上的转换结果 -->
<view class="wtu-width wtu-height" />
<style scoped>
.wtu-width { @apply w-full; }
.wtu-height { @apply h-[200px]; }
</style>
```

这比给每个组件设置 `styleIsolation: 'app'` 更收敛：组件仍保持隔离，只引入自身实际使用且已被 Tailwind 验证的 utility，不会让全部全局 class 穿透组件。

| 子配置 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| [`componentLocalStyles.enabled`](#componentlocalstyles-enabled) | `boolean` | `true` | 是否启用局部样式桥 |
| [`componentLocalStyles.onlyWhenStyleIsolationVersion2`](#componentlocalstyles-onlywhenstyleisolationversion2) | `boolean` | `true` | 是否只在 manifest 声明隔离 2.0 时启用 |
| [`componentLocalStyles.componentMatcher`](#componentlocalstyles-componentmatcher) | `(id) => boolean` | `components` 目录 | 哪些文件按组件处理 |
| [`componentLocalStyles.pageMatcher`](#componentlocalstyles-pagematcher) | `(id) => boolean` | `pages` 目录 | 哪些文件按页面处理 |

#### `componentLocalStyles.enabled` {#componentlocalstyles-enabled}

**作用** 总开关，决定是否收集 utility、生成 alias 并追加局部规则。

**使用场景** 保持默认开启；只有项目明确不使用隔离 2.0，或全部组件自行处理样式作用域时才关闭。

**用法** `componentLocalStyles: false` 或 `{ enabled: false }`。

#### `componentLocalStyles.onlyWhenStyleIsolationVersion2` {#componentlocalstyles-onlywhenstyleisolationversion2}

**作用** 控制插件是否读取工程根目录的 `manifest.json`，只在 `uni-app-x.styleIsolationVersion` 为 `"2"` 时开启组件局部桥。

**使用场景** 默认保持 `true`，避免旧隔离策略下产生不必要的局部规则。只有非标准构建无法提供 manifest、且运行时证据确认需要局部桥时才设为 `false`。

**用法** `componentLocalStyles: { onlyWhenStyleIsolationVersion2: false }`。这不是常规接入必填项。

#### `componentLocalStyles.componentMatcher` {#componentlocalstyles-componentmatcher}

**作用** 声明哪些 `.uvue/.nvue` 文件具有组件隔离语义。

**使用场景** 复用组件放在 `layouts`、`widgets` 等非默认目录时配置。

**用法** matcher 必须同时包含仍需支持的默认 `components` 目录，路径使用 `/` 匹配。

#### `componentLocalStyles.pageMatcher` {#componentlocalstyles-pagematcher}

**作用** 声明哪些 `.uvue/.nvue` 文件按页面局部样式处理。

**使用场景** 页面放在 `screens` 等非默认目录，或自定义路由生成布局时配置。

**用法** matcher 必须同时包含仍需支持的默认 `pages` 目录；不要用硬编码本机根路径判断。

### `uvueUnsupported` {#uvueunsupported}

**作用** 决定 uvue 原生目标遇到不兼容 utility 时是终止、警告还是静默跳过。

**使用场景** 本地开发推荐 `'warn'`；希望 CI 阻止引入已知不兼容样式时使用 `'error'`；只有已有替代实现且明确接受丢弃时才使用 `'silent'`。

**用法** `uvueUnsupported: 'error'`。例如原生端不能把 `gap`、`space-x-*`、`space-y-*` 当作通用布局能力。

**注意事项** warning 表示规则没有进入目标样式，不是可忽略的运行时提示。

### `customAttributes` {#customattributes}

**作用** 为组件自定义属性增加与 `class` 相同的 Tailwind 候选识别和安全类名转译。

**使用场景** 类名通过 `leftClass`、`thumb-class` 等 prop 传入组件，而不是直接写在 `class` 属性时使用。

**用法** 按标签声明允许承载 class 的属性：

```ts
customAttributes: {
  'a-navbar': ['leftClass'],
  'switch-card': ['thumb-class'],
}
```

**注意事项** 这里只解决类名识别；跨组件影响内部节点还必须符合 uni-app x 的 `externalClasses` 与样式隔离契约。

### `resolve` {#resolve}

**作用** 调整 Tailwind 包及其 PostCSS 入口的解析路径。preset 默认先查工程 `node_modules` 和 `base`。

**使用场景** monorepo、依赖提升或自定义包目录导致 HBuilderX 无法从工程根解析 `tailwindcss` 时使用。

**用法** 追加真实依赖目录：

```ts
resolve: { paths: [resolve(projectRoot, '../node_modules')] }
```

**注意事项** 不要用它掩盖依赖未安装；先确认 Tailwind CSS 4 安装在构建实际可访问的位置。

### `rawOptions` {#rawoptions}

**作用** 透传 `uniAppX()` 没有提供快捷入口的核心 `UserDefinedOptions`，并允许高级用户覆盖 preset 默认值。

**使用场景** 需要 `cssOptions.cssCalc`、生命周期回调或自定义 matcher 等核心能力时使用。

**用法** 只放 preset 未直接暴露的配置：

```ts
rawOptions: {
  cssOptions: { cssCalc: true },
}
```

**注意事项** `rawOptions` 优先级最高。不要同时在顶层和 `rawOptions` 设置同一项，否则配置来源难以追踪。

## Tailwind CSS 入口

```css title="main.css"
@import "tailwindcss" source(none);

@source "./App.uvue";
@source "./pages/**/*.{uvue,uts}";
@source "./components/**/*.{uvue,uts}";
@source "./layouts/**/*.{uvue,uts}";
@source not "./uni_modules/**/*";
@source not "./unpackage/**/*";
```

不要无差别扫描 `unpackage`、`dist` 或全部 `uni_modules`，否则构建产物可能反向进入候选扫描并干扰增量构建。

## 验证

在自己的 HBuilderX 项目中逐个运行目标平台，并分别验证：

- `cssEntries` 指向的入口被 `App.uvue` 实际导入，`@source` 覆盖页面、组件和布局源码。
- 隔离 2.0 下组件内部子节点的静态 class、动态 class 和普通 scoped class 混用均生效。
- 单位转换只执行一次，产物单位符合当前 Web、小程序或原生 App 目标。
- `uvueUnsupported` warning 已完成取舍，Android、iOS 与 HarmonyOS 运行时结果和真实产物一致。

构建成功只证明编译链完成，不能替代模拟器或设备上的 CSS 兼容验证。
