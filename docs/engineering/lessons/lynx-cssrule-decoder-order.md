---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1311
baseline: 2633f77a8ab31f73bad29a373fc86213559caee1
regressions:
  - e2e/lynx-decoder.test.ts
  - e2e/lynx-media-guard.test.ts
---
# Lynx CSSRule 的 Greedy 解码顺序回归

## 症状

开启 `enableCSSRule` 后，Lynx encoder 会输出统一 CSS 规则格式。`@lynx-js/tasm@0.0.53` 的公开 decoder 却先按默认配置读取 CSS，随后才读取页面配置，导致普通规则和媒体规则都可能被误当作旧格式解析。

这与生成器未输出 CSS、encoder 拒绝属性、原生运行时未命中媒体条件是不同的失败层级。serializer 输入只证明提交给 encoder 的内容；`bundled` 证据必须来自实际 bundle 字节的解码结果。

本记录只确认 decoder 的根因和本机原生构建对照，不代表 Windows、Linux、WASM 或全部原生能力已验收。

## 根因与纠正

- 官方包：`@lynx-js/tasm@0.0.53`。
- 官方源码提交：[`3526f07a8cb25cfb2841736c76b54deadc7e6e46`](https://github.com/lynx-family/lynx/tree/3526f07a8cb25cfb2841736c76b54deadc7e6e46)。
- 源码压缩包 SHA-256：`8c570a0a56a2cb5926e58b09cbe8774398fb956bd275f65cb6a107e17cdd9c23`。
- 补丁：[先读取页面配置](../../../e2e/lynx/decoder/patches/0001-decode-page-config-before-css.patch)。
- 补丁 SHA-256：`1282e4927efef30ce3a73a5dca4a499daafa5aef0fbef17026593ffb36376f62`。

`codec::Decode` 固定调用 `FromBinaryGreedy`；公开 Node、WASM 和 CLI 接口没有 lazy 或先读取配置的参数。

`LynxBinaryConfigDecoder::UpdateCSSConfigs` 从页面配置派生 `compile_options_.enable_css_rule_`，而 `LynxBinaryBaseCSSReader::DecodeCSSFragment` 根据该位选择二进制格式。原有 fiber 和非 fiber section 顺序均在 CSS 之后读取 CONFIG。

补丁仅将两套顺序中的 CONFIG 移至 CSS 前，保留 STRING、PARSED_STYLES、ELEMENT_TEMPLATE 的原有相对顺序，不改变 encoder、二进制内容、媒体预期或平台支持分类。

原生页面加载还存在 `TemplateBinaryReader` 的延迟路径：先读 CSS route，完成 CONFIG，再在渲染时读取规则。因此公开 Greedy decoder 失败不能单独证明实际宿主也失败。Android 的模板预解析 API 另有 Greedy 路径，不能把延迟路径的结论推广到所有原生入口。

## 验证

输入是实际编码后的 728 字节 bundle，SHA-256 为 `039d2aad9ecd77775d1a9e763d69638d71138fe835463ea0f808ec0cf83b64ba`，目标版本为 `4.0`，页面配置为 `enableCSSRule: true`。

| decoder | 进程结果 | 输出 |
| --- | --- | --- |
| npm 发布版 0.0.53 NAPI | exit 1 | legacy selector/string 解析错误，约 2.33 MB 日志 |
| 准确源码重建，未修改 decoder | exit 1 | 同类解析错误，约 5.84 MB 日志 |
| 相同构建条件，应用顺序补丁 | exit 0 | 从相同 bundle 读回普通规则和媒体规则 |

失败探针限定 30 秒，最多保留 1 MiB 日志并继续排空子进程输出；本次均在 1 秒内退出。补丁后 `decoded.css.text` 为：

```css
.a { height: 16px; width: 16px; }
@media (min-width: 1px) { .a { width: 32px; } }
```

该 CSS 文本 SHA-256 为 `06639649567e035c9b84590fdeea861a894834b26d8f3499afe23be97719e11f`。来源是 `decoder.decode(bundle).result`，没有读取 serializer 输入代替解码。

## 负控制与完整示例

固定断言要求同时存在 16 × 16 的普通规则，以及被 `min-width: 1px` 保护的 32px 宽规则。每个负控制重新编码为 bundle，再由修复后的 decoder 解码。

| 对照 | 独立断言结果 |
| --- | --- |
| 正确普通规则和媒体规则 | 接受 |
| 媒体宽度改为 24px | 拒绝 |
| 普通规则缺少 height | 拒绝 |
| 缺少媒体规则 | 拒绝 |
| 32px 规则失去媒体条件 | 拒绝 |
| 关闭 enableCSSRule，媒体规则被 encoder 忽略 | 拒绝 |

结果和各 bundle/CSS hash 见[调查记录](../../../e2e/lynx/decoder/investigation/greedy-order.json)。关闭开关的 bundle 能被正常解码，却只包含普通规则，这说明“成功生成 bundle”不足以证明媒体样式已保留。

另外使用生产链路的 `tasm@0.0.49` 所构建的完整 development 示例 bundle 验证兼容性：

- bundle 大小：1,623,624 字节。
- bundle SHA-256：`4c0e8dc7ac8b6ff0a29626da0dbfb0cab6d44bc0ccba1251ab32adccc4f5bcb7`。
- 解码成功，CSS 文本 40,939 字符；CSS SHA-256：`ee016423c672d8d3c70705dc7504cdbb4bf3329a4887440a36d8206addd918f3`。
- 独立核对 base 的尺寸/颜色、unguarded 规则，以及 min-width、hover:hover、hover:none 的条件和声明。
- 实际输出同时包含 `@media` 内嵌 `@layer` 和无 layer 的分支；后续规则分析必须保留祖先条件，不能扁平化后误报为无条件规则。

该示例由 static 测试以 development 模式构建，不能称为 production 模式验证。

## 构建记录与交付要求

本轮使用 Apple Clang 21、macOS SDK 27、Node 24.18.0、GN `cc28efe6`、Ninja 1.13.2，构建官方 `oliver/lynx-tasm:create_tasm_node` 目标。依赖按源码 DEPS 固定：buildroot `0d76bc8f966dbc64c69e310346ae5a4bd492570d`、PrimJS `76a456ec5ead13e0dce78f519eefc6a2720088f2`、tools-shared `bdea62f7b500026aab237b271abc7eff279a5c2d`、modp_b64 `50685101d51ef9aabbd60c94f52d9e026d39c509`，并应用仓库原有两项 modp_b64 补丁。

先运行官方 error-code、feature-count 和 performance-entry 生成脚本，再生成 GN 图并编译。为了适配当前宿主工具链，GN 使用 `use_xcode=true`、`enable_lto=false`、`mac_deployment_target="14.0"`；buildroot 定向增加 `-Wno-error=unused-result`，处理新版 libc++ 给上游 `std::future` 返回值增加的告警。原始和修复 decoder 使用完全相同的宿主配置，宿主适配不属于 decoder 补丁。

本机 `.node` 只用于根因调查，不作为跨平台测试依赖提交。持久 oracle 应固定源码、补丁、工具链和产物 hash，并从实际 bundle 解码 CSS；缺少、过期或不匹配的 oracle 必须阻断，不能静默改用未修复 decoder 或 serializer 输入。原生证据仍由各宿主 runner 独立提供。

## 适用边界

这些记录只证明固定源码、补丁与实际 bundle 的编码或解码行为，不能替代原生运行时、输入状态和像素证据。完整四端验收仍为 partial。

## 规则评估

保持源码与产物身份、生成/编码/运行时分层及严格失败门禁；不放宽平台支持预期，不以 serializer 输入或旧报告替代本轮证据。
