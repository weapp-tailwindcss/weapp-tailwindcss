# Lynx decoder 的 CSS selector 标识符序列化

## 问题与边界

修复 [Greedy 解码顺序](lynx-cssrule-decoder-order.md) 后，实际 bundle 中的 class/id 标识符能完整读回；但 `LynxCSSSelector::SerializeCompound` 将已经解码的 `Value()` 直接拼进 CSS 文本，未重新转义。结果 `.aspect-[4/3]` 无法作为 CSS selector 解析，`.punct,comma` 被误读成两个 selector，`#id:with[value]` 丢失 id 身份。

解码成功和 CSS 文本可解析是两道独立检查。消费 `decoded.css.text` 的 oracle 必须检查标识符身份，不能根据生成前的候选、serializer 输入或预期列表反向补齐。

## 最小补丁

官方源码固定为 `@lynx-js/tasm@0.0.53` 的 gitHead `3526f07a8cb25cfb2841736c76b54deadc7e6e46`。第二补丁只修改 `core/renderer/css/ng/selector/lynx_css_selector.cc`：

- 新增 CSSOM identifier serialization helper，并只用于 class/id 的 CSS 文本输出。
- 标点和反斜杠使用反斜杠转义；控制字符、DEL、首位数字和 `-` 后第二位数字使用码点转义，并保留终止空格。
- 单独 `-` 转义；NUL 按 CSSOM 替换成 U+FFFD；非 ASCII UTF-8 字节保持原样。
- 嵌套 `:not(...)` 继续递归序列化，所以子 selector 内的 class/id 也应用相同规则。

补丁不修改 selector AST、匹配逻辑、encoder 或 bundle 格式。源码的 `ToString()` 也是 DevTools 文本展示入口；修正后的文本仍表达同一已解码 selector。

补丁：[0002-serialize-css-identifiers.patch](../../../e2e/lynx/decoder/patches/0002-serialize-css-identifiers.patch)。SHA-256：`f14ab36c1aa7e26b1021ff4b31af3030a82cd4fe21952c7af5f6dba5834c0b76`。

## 同一实际 bundle 的回归

[固定夹具](../../../e2e/lynx/decoder/fixtures/selector-identifiers.json) 保存 1,946 字节实际 bundle 的 Base64、SHA、原 CSS 和独立预期。bundle SHA-256 为 `0b751511fd435c1e54ef84ba932f3abe947d069dd91ea30b7bb165f4d80a6035`。两轮都读取这份 bundle，没有重新编码或从输入补齐解码输出。

17 条规则覆盖 arbitrary value/type hint、important、伪元素、class/id 首位数字、`-` 后数字、逗号、反斜杠、控制字符、DEL、中文、emoji、单独 `-`、NUL 替换、嵌套 `:not` 和命名 group。NUL 的 CSS 转义在解析阶段就规范化为 U+FFFD；此项验证公开 encode/decode 路径的规范化结果。

每条规则用不同 width 作为定位标记，先断言规则数量，再独立核对 CSSOM 文本和 CSS selector parser 读回的 class/id。

| 检查 | 只有顺序补丁 | 同时应用 selector 补丁 |
| --- | --- | --- |
| CSSOM 标准序列化文本与身份均正确 | 2 / 17 | 17 / 17 |
| 仅 class/id 身份可被宽容 parser 读回 | 8 / 17 | 17 / 17 |
| 相同 bundle 的 CSS 文本 SHA-256 | `87da1ab8ce2dfb933b19430363db7d23a18fa12ee1e7ab9daa51870a19329688` | `9adde11b9a2d6744d5ff270ce6442f713d60a4316decec694565e55e7a386ebf` |

数值开头和部分控制字符虽被宽容 parser 接受，原始文本仍不符合 CSSOM；回归因此同时检查精确转义和语义身份，避免漏检。

原 development 示例 bundle（encoder 0.0.49，SHA `4c0e8dc7ac8b6ff0a29626da0dbfb0cab6d44bc0ccba1251ab32adccc4f5bcb7`）重新解码成功；修复后 CSS 为 41,186 字符，SHA-256 `1cb5cbf324dcd4b3fe5054aab096db09ada1eebf44c015c4ac22296d2f83b49f`。前后记录见[调查结果](../../../e2e/lynx/decoder/investigation/selector-identifiers.json)。本机 addon 不提交；WASM oracle 必须从相同固定源码及两项补丁重建，并在测试中实际解码固定夹具。
