# Lynx CSSRule 的时间表示与属性值丢弃

固定生产 encoder `@lynx-js/tasm@0.0.49`，源码为 `3f35de1c6150c1b94df165a248e8c76789487318`。解码使用仓库固定的便携 WASM 与已登记补丁。以下结论来自真实 bundle，不由 serializer 输入重建输出。

| 案例 | 输入 | 实际解码声明 | 判定 |
| --- | --- | --- | --- |
| `duration-300` | `transition-duration:300ms` | `transition-duration:300` | 同一毫秒时间的有限表示差异 |
| 秒数对照 | `transition-duration:.3s` | `transition-duration:300` | 秒乘 1000，不能按去单位文本比较 |
| `auto-rows-min` | `grid-auto-rows:min-content` | 空声明 | 该属性值未编码 |
| grid 正向对照 | `grid-auto-rows:24px` | `grid-auto-rows:24px` | 属性本身可编码 |
| `justify-self-end` | `justify-self:flex-end` | 空声明 | 该属性值未编码 |
| justify 正向对照 | `justify-self:end` | `justify-self:end` | `end` 不能被报告成 `flex-end` 已保留 |
| `whitespace-pre-wrap` | `white-space:pre-wrap` | 空声明 | 该属性值未编码 |
| white-space 正向对照 | `white-space:nowrap` | `white-space:nowrap` | 属性本身可编码 |
| `syntax-important` | `background-color:#737373!important` | `background-color:#737373!important` | important 确实保留，旧 serializer 观察不是编码事实 |

对三项拒绝值，NAPI 和 WASM encoder 都产生有效 bundle、空属性输出与空诊断数组。测试同时验证 serializer 输入确实含原属性，再检查独立正向声明，排除未扫描、未构建、解码器整体失效等解释。不得把空诊断或仍可见的节点当作属性保留证明。

## 固定源码路径

- 时间：[TimeHandler](https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/core/renderer/css/parser/time_handler.cc#L26) 调用时间 parser；[TimeToNumber](https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/core/renderer/css/parser/css_string_parser.cc#L2579) 将秒乘 1000，毫秒保持数值。有限比较只登记四个 duration/delay 属性的单值时间，不接受错误单位、列表或错误数值。
- white-space：[ToWhiteSpaceType](https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/core/renderer/css/parser/enum_handler.cc#L76) 只接受 `normal`、`nowrap`，其余返回 false；[官方值定义](https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/tools/css_generator/css_defines/42-white-space.json#L11) 与之吻合。
- justify-self：[ToJustifyType](https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/core/renderer/css/parser/enum_handler.cc#L637) 接受 `start/end/center/stretch/auto`；[分派](https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/core/renderer/css/parser/enum_handler.cc#L800) 同时处理 justify-items/self。`flex-end` 不在该值集合中。
- grid-auto-rows：[注册](https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/core/renderer/css/parser/grid_template_handler.cc#L169) 使用 GridTemplateHandler；[ParserLengthValue](https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/core/renderer/css/parser/grid_template_handler.cc#L37) 调用 LengthHandler，失败不写输出。固定版本的[官方兼容数据](https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/tools/css_generator/css_defines/174-grid-auto-rows.json#L203) 将 `min-content` 登记为 Android/iOS 不支持。
- important：[StripImportant 与目标 map 选择](https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/core/template_bundle/template_codec/binary_encoder/css_encoder/css_parser_token.cc#L110) 将 important 声明单独保存，便携 decoder 的真实输出也保留该标志。

## 无属性诊断的原因

[CSSParser 的 CSSRule 分支](https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/core/template_bundle/template_codec/binary_encoder/css_encoder/css_parser.cc#L164) 直接交给 CSSRuleParser；[ParseStyleRule](https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/core/template_bundle/template_codec/binary_encoder/css_encoder/css_rule_parser.cc#L111) 构造 CSSParseToken，未调用旧 token 分支的 CollectStyleDiagnostics。

实际属性值进入 [UnitHandler::Process](https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/core/template_bundle/template_codec/binary_encoder/css_encoder/css_parser_token.cc#L161)；失败值不会由 serializer 输入自动补回。这个路径也不同于 selector 解析失败的诊断路径，不能要求三项值拒绝必须产生 selector diagnostic。

## 持久回归与边界

`e2e/lynx-encoder-values.test.ts` 对 NAPI/WASM 分别运行三项值拒绝、时间表示与 important 正负对照。`e2e/lynx-encoded-declarations.test.ts` 额外覆盖毫秒、秒、负 delay、错误单位、错误量级与多时间列表。

```sh
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-encoded-declarations.test.ts e2e/lynx-encoder-values.test.ts --update=none
```

此次只确认生成与编码层。三项空声明不允许由 finite comparator 补造为 actual；important 编码保留也不直接证明 Android/iOS 的优先级效果，运行时支持状态仍须本轮设备证据审查。
