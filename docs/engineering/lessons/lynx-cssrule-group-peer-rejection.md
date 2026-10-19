---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1311
baseline: 2633f77a8ab31f73bad29a373fc86213559caee1
regressions:
  - e2e/lynx-decoder.test.ts
  - e2e/lynx-media-guard.test.ts
---
# Lynx CSSRule 的 group/peer 编码拒绝证据

## 症状

Tailwind 4 的 `.group-hover\:block:is(:where(.group):hover *)` 和 `.peer-checked\:opacity-100:is(:where(.peer):checked ~ *)` 能被生成并进入 serializer，Lynx encoder 随后把它们登记为 selector 诊断并丢弃样式规则。开启 `enableCSSRule` 可以保留媒体规则，但不补充 selector 解析能力。

实际 bundle 解码后的 group 结果只有 `@media (hover: hover) { }`；peer 的 CSS 文本为空。空媒体壳不能证明其内部 group 声明存在，也不能作为 group 的媒体运行时门禁。

## 根因与纠正

npm registry 固定 `@lynx-js/tasm@0.0.49` 的 gitHead 为 `3f35de1c6150c1b94df165a248e8c76789487318`，`0.0.53` 为 `3526f07a8cb25cfb2841736c76b54deadc7e6e46`。

- [CSSSelectorParser](https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/core/renderer/css/ng/selector/css_selector_parser.cc#L512) 的名字映射登记了 `:is`、`:where`，但 `ConsumePseudo` 的带参数分支只实现 `:not`、`:dir`、`:lang`、`nth-*`；`is`、`where` 走默认分支并返回 `nullptr`。
- [CSSRuleParser::ParseStyleRule](https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/core/template_bundle/template_codec/binary_encoder/css_encoder/css_rule_parser.cc#L97) 检查 `FlattenedSize == 0`，记录 `Diagnostic{"selector", selector}` 后返回空规则。
- [SelectorMatcher](https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/core/renderer/css/ng/matcher/selector_matcher.cc#L152) 的 NG 伪类匹配只实现 `not`、`hover`、`active`、`focus`、`root`，其余默认返回 false。因此不能只给名字枚举补一个解析入口就宣称原生能力已支持。

49 与 53 的 CSSRuleParser、SelectorMatcher 文件逐字一致。CSSSelectorParser 只有 `ANPlusB` 中两处数值 `static_cast<int>` 差异，带参数伪类解析路径一致。文件 SHA 见[调查结果](../../../e2e/lynx/decoder/investigation/group-peer-rejections.json)。

## 验证

三路 encoder 分别为仓库消费的 0.0.49 NAPI、0.0.49 WASM 和准确源码重建的 0.0.53 NAPI；每路运行相同 11 项，目标为 `3.9`，开启 `enableCSSRule`、`enableCSSSelector` 和 fiber。所有调用返回 status 0，测试另外检查 diagnostics 及实际 bundle 的 CSS 声明，避免把生成成功当作编码支持。

| 样本 | 三路实际结果 |
| --- | --- |
| 普通 `.a`、`.a:hover`、`.a:active` | 声明保留，无诊断 |
| `.a:not(.b)` | 声明保留，无诊断 |
| `.a:is(.b)`、`.a:where(.b)` | selector 诊断，CSS 为空 |
| group 只含 `:is`、只含 `:where` | selector 诊断，仅保留空媒体壳 |
| Tailwind 原 group selector | selector 诊断，仅保留空媒体壳 |
| Tailwind 原 peer selector | selector 诊断，CSS 为空 |
| `.group:hover .group-hover\:block` 语法控制 | 声明保留，无诊断 |

末项仅用于隔离 `:is`/`:where` 的解析拒绝；没有修改 Tailwind 输出、声明其特异性相同或证明原生运行效果。这里也没有修改原生预期或 encoder。

原 group 的诊断为 `type: "selector"`、`name: ".group-hover\\:block:is(:where(.group):hover *)"`。其诊断同时出现在三路 encoder；实际 bundle 都缺失 `display: block`。原 peer 也在三路缺失 `opacity: 1`。各 bundle 大小、SHA、诊断和 CSS SHA 均保留在调查结果中。

能力清单应按准确候选登记这项 encoder 限制，并保留可执行负向断言。生成层、serializer 层、bundle 层、宿主运行时需要分别记录；已有 selector 拒绝不能因新媒体开关被误登记为 bundle 已保留。

## 适用边界

这些记录只证明固定源码、补丁与实际 bundle 的编码或解码行为，不能替代原生运行时、输入状态和像素证据。完整四端验收仍为 partial。

## 规则评估

保持源码与产物身份、生成/编码/运行时分层及严格失败门禁；不放宽平台支持预期，不以 serializer 输入或旧报告替代本轮证据。
