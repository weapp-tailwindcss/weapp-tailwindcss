# Lynx 编码输出的证据边界

静态生成使用 `generated.rawCss`，经过 `encodeLynxCss` 的 Web/Lynx 兼容处理、生产 serializer、生产 encoder，再交给独立 WASM decoder。这里没有使用小程序 WXSS。serializer 的 `cssMap` 是 encoder 输入，不能用它代替编码后的输出。

当前固定的 encoder 0.0.49、serializer 0.1.9，以及由 0.0.53 准确源码构建的便携 decoder 中，CSS 结构只有 `{ text }`，没有可以直接消费的规则 AST。便携 decoder 已修复配置读取顺序和 class/id 文本转义，来源与 hash 见 `packages/lynx/src/decoder-data/manifest.json`；它不会补全 CSS 语义。

例如合法输入：

```css
.probe { width:32px; color:var(--probe-color,red); }
```

原生 decoder 展示为：

```text
.probe { color: {{--probe-color}}; width: 32px; }
```

这个变量文本不是标准 CSS。原官方 decoder 还会展示未经 CSS 转义的候选选择器，例如 `.hover:flex:hover`；固定的便携 decoder 已用独立 17 条实际二进制回归修正 class/id 身份。把变量替换为 `var()` 后仍无法恢复被展示格式省略的 fallback，复杂值域的通用合同继续保留缺口。

早期调查的 135 个批次均产生非空编码 buffer，encoder 输入没有 `{{`，decoder 展示文本全部含有 `{{`。这些批次记录的 `conversion-executed:false` 源自展示文本的二次解析失败。修正后的报告保留编码完成断言、完整原始展示文本、输入 AST 和诊断；没有独立输出读取器时保持 `not-run`。这项边界修复不构成 Lynx 全部转换语义通过。

## 当前字面子集

`decoder-literal.ts` 直接读取实际 WASM decoder 文本。它只接受 ASCII 单类名、无条件的完整单类选择器，以及不含函数、模板、字符串、数组、custom property 的字面声明。它保留所有关联规则、重复声明、important 和输出顺序；空规则、缺少属性、改值及后续覆盖均参与完整比较，不会去重成成功。

关联条件、复杂选择器、转义歧义、残缺块和未知展示语法保留 `not-run`。输入 AST 的 selector/key/value 位置信息只用于定位诊断；属性和值始终来自 decoder 输出。没有位置、找不到唯一归属或归属选择器存在歧义的诊断会阻断语义判定。已明确归属于其他候选的诊断继续保留在批次原始产物，不冒充本候选诊断。

`conversion-oracles/lynx.ts` 在目标转换前登记 41 个固定的正向合同，涵盖基础 flex、position、尺寸、对齐、文本对齐和 `p-px` 简写展开。每个合同还必须与固定官方参考的完整无条件字面声明一致；主题变化、重复声明和未知形态不会自动扩大合同。生成规则、编码语义、运行时和像素仍是独立层级。

真实生产 encoder + WASM decoder 回归中，41 个正向合同完整匹配。另一个固定反例 `inline-flex` 的 `display:inline-flex` 被静默丢弃：输入 AST 仍有声明，decoder 输出 `.inline-flex { }`，诊断为空。[Lynx 官方 display 文档](https://lynxjs.org/api/css/properties/display.html) 明确说明没有 Web flow layout，且不支持 `block`、`inline`、`inline-block`、`inline-flex`、`inline-grid`；该限制来自独立文档，不能强制映射成 `flex` 改变外部布局语义。额外回归固定 Web 语义保留预期，并确认审计会判 `failed`，不能靠无诊断或输入 AST 得到正向成功。

`inline-block`、`inline-flex`、`inline-grid` 在执行前独立登记三个负向合同，记录上述官方 URL。只有这三个准确的 Lynx `display` 值允许没有诊断的拒绝判定；其他目标和其他负向合同继续要求已审查的实际诊断。负向验收必须同时证明官方参考确有该声明、实际 encoder 输入保留完整无条件声明、真实编码 buffer 非空，以及独立 decoder 输出完整为空。缺少输入或 buffer 证据保持 `not-run`；输入丢失、条件混入、重复声明、错误改成 `flex` 或出现其他输出声明均失败。真实 WASM 回归验证三个拒绝合同；生成仍应通过，编码负向合同通过不代表这些写法得到运行时支持。

`tailwind-lynx-literal.test.ts` 固定字面读取和反例，`lynx-css-defaults.test.ts` 执行真实生产编码/WASM 解码并验证篡改产物会失败，`tailwind-static-conversion.test.ts` 验证执行前登记及实际输出判定。定向验证不启动浏览器、IDE 或设备。

## 尚未覆盖的范围

通用读取器仍需要 decoder 提供结构化的编码后选择器、属性值、变量与 fallback、条件、important 和顺序信息，或一份可校验的私有输出语法合同。复杂选择器、条件、变量和未知格式继续保留缺口。不能通过替换 `{{变量}}`、复制 serializer 输入值、忽略解析错误，或把本轮失败改成 `unsupported` 来得到全绿报告。
