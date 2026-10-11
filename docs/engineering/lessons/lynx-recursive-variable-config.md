---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: a183ff5b6c9916baced758781274ae2d24100748
regressions:
  - packages/lynx/test/plugin.test.ts
  - e2e/lynx-rspeedy.test.ts
  - e2e/lynx-pixel-effects.test.ts
---

# Lynx 嵌套变量的模板配置边界

## 症状

渐变和阴影的 CSS 已进入真实 bundle，但 Android 原始图片仍为纯色或缺少投影。弱像素比较误报支持的问题见[像素语义复盘](lynx-pixel-effect-semantics.md)。修正验收后继续追踪发现，实际模板的页面配置没有启用递归变量解析。

## 根因与纠正

Lynx 4.0.1 的旧 `css_var` 路径只替换一层占位符；嵌套 `var(...)` 随后进入属性解析器。该版本同时提供 `enableCSSInlineVariables`：模板解码器读取此配置，将旧变量值通过 `ToVarReference()` 标记为 `NeedsVariableResolution`，随后由 `ResolveCSSVariables` 处理。

因此问题边界是模板配置，不应跨选择器静态展开应用变量，也不能把整个固定版本标记为不支持嵌套变量。适配器现在在所有 Rsbuild 插件 setup 完成后的构建链阶段，取得宿主以 `Symbol.for('LynxTemplatePlugin')` 公开的模板 API，注册 compilation / beforeEncode hook，仅为未配置的值设置 `true`。保留显式 `false`、页面元数据、CSS 和目标 SDK。

复用宿主 API 避免加载不同版本的模板插件；该上游包只提供 ESM import 入口，不能由本包 CJS 产物同步 require。缺少模板 API 时明确报错，不静默绕过配置。

## 验证

- 真实构建回归先失败：`tasm.sourceContent.config.enableCSSInlineVariables` 为 undefined。修复后编码输入与独立 decoder 解出的 page-config 都为 true，engineVersion 仍为 3.9，动态渐变和阴影变量保留。
- 公开包回归覆盖 setup 顺序、宿主 hook、每轮 compilation、显式 true/false、元数据保留与缺少 API 的失败；真实公共 CJS 产物可 require 并注册插件。
- `pnpm --filter @weapp-tailwindcss/lynx test --update=none` 8 项通过；`pnpm e2e:lynx --update=none` 示例 61 项、根目录 100 项通过，含真实相关包/Rspeedy 构建和独立解码。
- `pnpm e2e:lynx:static:update` 限定 React Lynx 重生成，118 项结论、版本和 catalog hash 不变，仅时间更新；随后无更新回归通过。
- 定向 TypeScript、ESLint、agents、双语 README/配置/i18n 检查通过；`pnpm --filter @weapp-tailwindcss/website exec docusaurus build` 英文与中文静态站构建通过。
- `pnpm release status` 确认本次 intent 将 Lynx 从 0.3.20 规划为 0.4.0，以反映旧构建器缺少 API 时的支持范围收窄；没有执行版本或发布。

## 适用边界

源码对照表明 runtime 3.5.2 尚无该开关，3.6.0 已提供；ReactLynx 插件 0.12.0–0.12.3 未公开模板 API，0.12.4 起已公开，当前 0.20 由其底层构建插件公开。旧构建器需要升级，不能仅凭 Rspeedy 版本推定存在 hook。

当前编码回归固定 ReactLynx 插件 0.20.2、Rspeedy 0.17.2、模板插件 0.16.1 和 target SDK 3.9；原生矩阵保持 Lynx 4.0.1。真实双端效果与动态更新、循环引用等运行时语义仍需新报告，不能从页面配置或合成图片测试推定通过。本提交不改原生支持基线。

## 规则评估

不新增 AGENTS；继续使用构建器公开生命周期和完整的生成、编码、原生证据边界。修正上一复盘“runtime 校验”的表述：设备代码保留 runtime 信息，实际校验的是精确 ID、Booted、available 与 destination。
