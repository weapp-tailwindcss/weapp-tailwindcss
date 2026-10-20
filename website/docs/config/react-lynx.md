---
title: ReactLynx / Rspeedy 配置参考
description: ReactLynx、Rspeedy 与 @weapp-tailwindcss/lynx 的配置职责、Rspack loader 用法和 Lynx encoder 边界。
keywords:
  - ReactLynx
  - Rspeedy
  - Lynx
  - Tailwind CSS 4
  - Rspack
  - CSS loader
  - encoder
  - 原生 CSS
---

# ReactLynx / Rspeedy 配置参考

本页逐项说明 `pluginLynxTailwindcss()` 的 Lynx 专属配置。首次接入请先看 [ReactLynx / Rspeedy 指南](../quick-start/frameworks/lynx)。

本集成要求 Node.js `^22.18.0 || >=24.11.0`，覆盖适配器及其必装核心依赖链。启用 ReactLynx 集成时，必须安装并注册 `@lynx-js/react-rsbuild-plugin` `>=0.12.4`；该 peer 的 optional 安装标记只避免自动引入另一份构建器。递归 CSS 变量要求 Lynx runtime `>=3.6`，这与当前原生基线的 Engine 版本和 bundle 编码 target 是不同的要求。

稳定的 Tailwind theme token 可以替换为字面值；Web 颜色兼容阶段也可能在降级现代颜色表达式时解析应用变量。当前 CSS 输入中可见的局部、条件或优先级覆盖会阻止相关变量静态化。跨文件 stylesheet 或 inline style 的覆盖不在分析范围内，不能改变已生成的字面值；变量改名也不能保证动态覆盖语义。

全部 `@property` 注册、描述符与变量依赖保持原文；`--tw-*` 名称也可来自公开 theme 前缀，不能证明注册归属。默认值兼容仅匹配明确登记的完整签名，冲突或条件注册不合成全局默认；不以全局默认值模拟任意注册语义。目标端仍须支持注册属性；保留输入与浏览器对照不代表 Lynx 原生已支持该语义。

## 支持基线

- `@weapp-tailwindcss/lynx` `0.4.4`；适配器 Node.js `^22.18.0 || >=24.11.0`
- 核心 `weapp-tailwindcss` `5.6.3`；依赖链 Node.js `^22.18.0 || >=24.11.0`
- `@lynx-js/rspeedy` `>=0.16.0`
- Tailwind CSS `4.x`
- 仓库示例固定 Rspeedy `0.17.2`、ReactLynx 插件 `0.20.2`、ReactLynx runtime `0.126.1`、Tailwind CSS `4.3.3`、Lynx Engine `4.0.1`、bundle `engineVersion: '3.9'` 与 `css-defines` `0.0.18`
- 仅支持 ReactLynx + Rspeedy 原生构建，不覆盖 Rspeedy Web、非 React Lynx 或 React Native

## 最小配置

```ts title="lynx.config.ts"
import { defineConfig } from '@lynx-js/rspeedy'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { pluginLynxTailwindcss } from '@weapp-tailwindcss/lynx'

export default defineConfig({
  plugins: [pluginReactLynx(), pluginLynxTailwindcss()],
})
```

```css title="src/global.css"
@layer theme, base, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities) source(none);

@source "./**/*.{ts,tsx}";
```

插件固定使用 `platform: 'lynx'`、`generator.target: 'web'` 与 Lynx Web CSS 兼容输出。ReactLynx 保留原始 `className`，不会生成小程序 safe class，也不会创建 React Native style manifest。

递归变量路径要求 Lynx runtime 3.6 以上，以及 ReactLynx 插件 0.12.4 以上公开的模板 API；更旧的构建器需要升级。稳定 Tailwind theme token 可能在构建期静态化；同一 CSS 中可见的覆盖会保留 `var()` 依赖。跨文件 stylesheet 或 inline style 覆盖不在静态分析保证范围内。源码支持边界不等于设备验收，当前原生测试仍使用固定 4.0.1 矩阵。

模板编码前，插件复用 ReactLynx 构建器公开的 `LynxTemplatePlugin` hook，将未配置的 `enableCSSInlineVariables` 默认设为 `true`，让嵌套的 Tailwind utility 变量进入原生递归解析路径。显式页面配置和动态变量依赖保持不变；缺少模板 API 时构建失败，不静默回退。该设置不改变 `engineVersion`，也不代替渐变、阴影等效果的设备验收。当前真实编码回归固定 `engineVersion: '3.9'`，原生矩阵固定 Lynx `4.0.1`。

## 配置索引

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| [`generator`](#generator) | `LynxGeneratorOptions \| false` | Lynx 固定配置 | 覆盖生成器非目标字段 |
| [`rspack`](#rspack) | `PatchRspackConfigOptions` | CSS 规则补丁开启 | 控制 Rspeedy/Rspack loader 补丁 |
| [`rspack.cssImportRewriteLoader`](#rspack-cssimportrewriteloader) | `boolean \| object` | `true` | 注入 Tailwind CSS 入口重写 loader |
| [`rspack.removeLightningCssLoader`](#rspack-removelightningcssloader) | `boolean` | `false` | 是否移除内置 Lightning CSS loader |
| [`diagnostics`](#diagnostics) | `LynxDiagnosticsOptions` | `{}` | 输出 encoder 兼容性报告，按需启用 strict |

除上述字段外，插件继承核心 [`UserDefinedOptions`](/docs/api/interfaces/UserDefinedOptions)。常见可用项包括 `cssEntries`、`cssOptions`、缓存、文件 matcher 与生命周期回调；`platform`、`rewriteCssImports`、`generator.target` 和 Lynx 样式平台由适配器接管，不能用来切换成小程序或 React Native 产物。

## 配置详情

### `generator` {#generator}

**作用** 调整 Tailwind 生成器中未被 Lynx 适配器固定的字段，例如额外 style options。适配器始终覆盖 `target: 'web'`、`webCompat: true` 和内部 `cssOptions.platform: 'lynx'`。

**使用场景** 通常无需配置。只有需要传递生成器的非目标高级选项，且已经从最终 CSS 与 encoder 日志确认影响时才使用。

**用法** 例如补充生成阶段的非目标配置：

```ts
pluginLynxTailwindcss({
  generator: {
    styleOptions: {
      cssOptions: { cssCalc: true },
    },
  },
})
```

**注意事项** 即使传入 `target: 'weapp'` 或 `webCompat: false`，Lynx wrapper 仍会覆盖它们。这里的 `generator: false` 只清空用户自定义 generator 字段，不会关闭适配器创建的 Lynx 生成链路。

### `rspack` {#rspack}

**作用** 将 `PatchRspackConfigOptions` 传给 Rspeedy 的 Rspack 配置补丁，负责在真实 CSS rule 中定位并调整 loader 顺序。

**使用场景** 默认配置适合标准 Rspeedy。只有自定义 CSS rule、替换 loader 路径或确认 Lightning CSS 与项目冲突时才传对象。

**用法** 所有 Rspack 细项放在同一对象中：

```ts
pluginLynxTailwindcss({
  rspack: {
    cssImportRewriteLoader: true,
    removeLightningCssLoader: false,
  },
})
```

**注意事项** 这个对象只修改匹配到的 CSS rule，不代替 `pluginLynxTailwindcss()` 注册核心生成插件。

### `rspack.cssImportRewriteLoader` {#rspack-cssimportrewriteloader}

**作用** 在 Rspeedy 的 CSS loader 链中注入入口重写 loader，让 Tailwind import 由 `weapp-tailwindcss` 生成，并强制启用 `generateCss: true`。

**使用场景** 保持默认 `true`。只有现有 Rspack 配置已经安装了等价 loader、或自定义链路明确接管 Tailwind 入口生成时才关闭。

**用法** 可以提供自定义 loader 路径与额外选项；适配器仍会合并 `generateCss: true`：

```ts
rspack: {
  cssImportRewriteLoader: {
    loader: require.resolve('./custom-css-loader.cjs'),
    options: { tailwindcssImportRewriteRuntimeKey: 'lynx-runtime' },
  },
}
```

**注意事项** 设为 `false` 后，插件不会补偿缺失的 CSS 生成入口。只有构建图已经存在明确替代链路时才这样做。

### `rspack.removeLightningCssLoader` {#rspack-removelightningcssloader}

**作用** 从匹配到的 Rspack CSS rule 中移除 `builtin:lightningcss-loader`。

**使用场景** 默认保留。只有 Lightning CSS 已被 encoder 或另一个 loader 完整替代，且日志证明它正在删除或改坏目标规则时才开启。

**用法** 在 `rspack` 下显式设置：

```ts
rspack: { removeLightningCssLoader: true }
```

**注意事项** 移除后会改变压缩、语法降级和浏览器 CSS 处理链，不是消除 warning 的通用办法。必须比较修改前后的最终 bundle 与设备结果。

### `diagnostics` {#diagnostics}

**作用** 在模板编码收尾阶段消费 encoder CSS 诊断，输出结构化报告并关联生成阶段的 selector、property/value、utility 与来源位置。

**使用场景** 默认模式适合在 CI 或本地持续观察兼容性；只有希望把已确认删除的业务规则当作门禁时才启用 `strict`。`preflight`、Tailwind 默认规则和无法可靠关联的 `unknown` 诊断始终只报告，不会因 strict 自动失败。

**用法** `ignore` 按 selector/property 限定范围，reason 仅作审计说明；`onReport` 接收包含版本、计数、分类、拒绝原因和替代建议的报告：

```ts
pluginLynxTailwindcss({
  diagnostics: {
    strict: true,
    ignore: [{ property: 'padding-inline', reason: '业务明确接受该平台限制' }],
    onReport(report) {
      console.log(report)
    },
  },
})
```

报告把 `encoder-log` 原始日志与 `bundle-comparison` 发现的静默删除分开记录，状态为 `bundled`、`encoder-rejected` 或 `unknown`。输入通过唯一选择器分支、条件和声明关联；编码证据来自 `afterEmit` 的构建图 asset，并绑定 bundle、固定 decoder 与输入 CSS 的 hash。忽略项必须限定 selector/property，`reason` 仅作审计说明；记录和删除计数始终保留。

来源文件/行列只在当前构建图 source map 可证明时提供；合成 cssId 和生成坐标单独保存。跨入口同名分支、重复声明、未知值规范化、无法完整解码的 CSS section，以及无法唯一关联的 scoped CSS 来源均不猜测。诊断不扫描 `dist`，也不把进入 bundle 视为 Lynx 原生支持。


例如业务候选 `px-[7.5px]` 的 `padding-inline` 在本轮 bundle 确证缺失时，报告包含：

```js
{
  status: 'encoder-rejected',
  category: 'business',
  utility: 'px-[7.5px]',
  property: 'padding-inline',
  value: '7.5px',
  reason: '唯一输入与本轮实际 bundle 比较确认该规则或声明缺失；这不推断 encoder 内部拒绝根因。',
  suggestion: '可按业务方向选择 padding-left / padding-right；这不是完整逻辑属性等价替换，RTL 与动态方向须分别验证。',
}
```

`versions.encoder` 优先记录与宿主暴露模板类身份一致的 `@lynx-js/tasm` 依赖版本；`versionEvidence.encoder` 明确这并非独立验证实际 encode hook 或执行二进制，定制编码器或 Web 路径仍须另行确认。无法绑定时记录 `unknown` 或标明 compilerOptions 显式声明来源。`versions.engine` 缺少宿主证据时为 `unknown`，`targetSdk` 不能替代运行时版本。`unknown` 项只建议补证，不虚构等价样式。

## CSS 与候选

Lynx 推荐只引入 theme 和 utilities，避免浏览器 preflight 中的 `:root`、`:host`、`:where(...)` 等规则触发无关 warning。任意值必须是完整静态候选：

```tsx
<view className="w-[123px] h-[45rpx] rounded-[18px] bg-[#123456]" />
```

动态场景枚举完整 class，或在 CSS 中注册：

```css
@source inline("w-[120px] w-[240px] bg-[#123456]");
```

不要拼接 `w-[${width}px]`，Tailwind 无法在构建期得到最终 token。

## 三层验证证据

| 层级 | 检查内容 | 能证明什么 |
| --- | --- | --- |
| Tailwind 生成 | CSS bundle 中存在目标规则 | 候选扫描与生成器成功 |
| Lynx encoder | encoder 日志和编码后 bundle 保留属性与 selector | 规则没有在编码阶段被删除 |
| 设备运行时 | Android/iOS 页面像素、布局与交互状态 | 当前 Lynx 版本真实支持该能力 |

`padding-inline`、复杂 `:is()` / `:where()`、伪元素、hover、dark、data、supports、媒体查询和复杂渐变都必须走完三层验证。“Tailwind 已生成”不能替代 encoder 和设备证据。

## 设备与验证证据

CI runner 默认使用 Android API 30、Pixel 2、x86_64，以及 iOS 18.5、iPhone 16 Pro。已提交的原生报告来自 Android `sdk_phone_x86_64`（Android 11/API 30，x86_64）和 `LynxCompatibility`（iPhone 16 Pro，iOS 18.5，arm64），基线 `verifiedAt` 为 `2026-10-20T15:29:36.721Z`，`catalogHash` 为 `2e3a1a60517c13de507d22ef8b4d209ffcdb86b2dfbf5bf7100df35c40dc3fec`。当前基线来自正式 run `39445561718`；相同设备配置的后续 CI 仍需独立运行证据。

`--capture-only` 仅在显式指定 bundle 和目标设备时采集截图/视频，不写入 native support report，也不能更新已提交基线。

## 验证

- 原始 `className` 保持可用，没有出现小程序 safe class 或 RN manifest。
- CSS import rewrite loader 位于实际命中的 rule，并且 Tailwind 规则进入最终 bundle。
- encoder warning 已逐项对照编码后 CSS，不支持的逻辑属性已改为 Lynx 可用的物理属性。
- Android 与 iOS 分别验证布局、任意值、伪类、媒体查询和渐变。
