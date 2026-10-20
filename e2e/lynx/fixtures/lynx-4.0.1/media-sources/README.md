这里保留官方 `lynx-family/lynx` 的 `4.0.1` tag 原文及各文件的 Apache-2.0 版权声明。`sources.json` 记录原始 URL 和完整文件 SHA-256，四个摘要的规范 JSON 再绑定运行前登记的媒体限制合同。保留整文件是为了避免摘录失去周边控制流，禁止对这些上游测试夹具格式化。

`MediaValues` 将 hover/pointer 初始化为 `kUnknown`；`BuildMediaQueryEvaluator` 注入视口、字体和色彩主题，未注入 hover 能力；`EvalHoverFeature` 仅对明确的 `kPresent` / `kNone` 匹配。`RuleSet::MatchStyles` 同时保留旧条件回退，因此这些源码不能单独证明当前宿主的实际行为，必须配合同轮两端原生媒体探针。

负向合同只涉及必要的 `(hover:hover)` 条件。无 guard 与 min-width 的正向探针必须呈现绿色 32×16 矩形，hover:hover 与 hover:none 必须保持红色 16×16 矩形；全部配对照、原始 PNG、原生几何侧车、实际 SDK 版本、本轮 run ID 和 bundle 摘要。原 Tailwind 候选的所有 CSS/TASM 分支必须都经过精确的 guard。缺少任一证据即拒绝，不能从无效果自动改判“不支持”。

媒体条件拒绝后，下游 hover 输入与 hover 伪状态仍记录为未测试。该合同不证明平台有真实鼠标输入，也不向原子能力矩阵贡献状态覆盖。新的 SDK 或源码摘要需要重新审查。
