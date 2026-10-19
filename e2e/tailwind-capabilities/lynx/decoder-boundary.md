# Lynx 编码输出的证据边界

静态生成使用 `generated.rawCss`，经过 `encodeLynxCss` 的 Web/Lynx 兼容处理、生产 serializer、生产 encoder，再交给独立 WASM decoder。这里没有使用小程序 WXSS。serializer 的 `cssMap` 是 encoder 输入，不能用它代替编码后的输出。

当前固定的 encoder 0.0.49、serializer 0.1.9、decoder 0.0.53 中，`decode_wasm` 的 CSS 结构只有 `{ text }`，没有可以直接消费的规则 AST。包的 JavaScript 入口只是对 WASM `_decode` 结果执行 `JSON.parse`，不会补全 CSS 语义。

例如合法输入：

```css
.probe { width:32px; color:var(--probe-color,red); }
```

原生 decoder 展示为：

```text
.probe { color: {{--probe-color}}; width: 32px; }
```

这个文本不是标准 CSS。它还会展示未经 CSS 转义的候选选择器，例如 `.hover:flex:hover`。将其传给通用 CSS parser 会把变量模板当成语法错误；把变量替换为 `var()` 后再解析，也无法恢复被展示格式省略的 fallback，更不能可靠区分字面 class 与伪类。

本轮 135 个批次均产生非空编码 buffer，encoder 输入没有 `{{`，decoder 展示文本全部含有 `{{`。因此这些批次记录的 `conversion-executed:false` 实际源自展示文本的二次解析失败。修正后的报告保留编码完成断言、完整原始展示文本、输入 AST 和诊断；没有独立输出读取器时保持 `not-run`。这项边界修复不构成 Lynx 全部转换语义通过。

## 读取器的后续范围

通用读取器需要 decoder 提供结构化的编码后选择器、属性值、变量与 fallback、条件、important 和顺序信息，或一份可校验的私有输出语法合同。既有 serializer 输入能用于诊断位置归属，不能提供编码后已经保留相同值的证明。

可以优先研究字面子集：只接受不含冒号、方括号、点等歧义字符的 class、无条件规则和纯字面属性值，再用运行前冻结的正向 oracle 验证。即便如此，也必须排除关联的条件规则和后续覆盖，并按来源位置独立归属 encoder 诊断；不能把无关批次诊断算给每个候选，或把整个批次诊断删除后声称没有诊断。

复杂选择器、条件、变量和未知格式仍需逐项保留缺口。不能通过替换 `{{变量}}`、复制 serializer 输入值、忽略解析错误，或把本轮失败改成 `unsupported` 来得到全绿报告。现有 `lynx-css-defaults.test.ts` 固定真实编码/解码格式，`tailwind-static-conversion.test.ts` 固定分层结果及原始产物保留，`tailwind-conversion-audit.test.ts` 拒绝没有输出读取器却使用输入 oracle 判通过。
