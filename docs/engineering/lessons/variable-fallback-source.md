---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: 4c78b8424dc3ac9e6efe6bccee756abb9e8701fb
regressions:
  - packages/postcss/test/variable-fallback-source.test.ts
  - packages/postcss/test/coverage-additional.test.ts
  - packages/postcss/test/native/native-value-transform.test.ts
  - packages/postcss/test/native/native-declaration-values.test.ts
---

# 变量 fallback 变换的来源区间

## 症状

严格类型检查发现 via-stops 拆分出的 Function、Word、Div 缺少 value-parser 必需的来源位置；直接捕获变换后的真实 AST，也能看到函数位置被主动写成 undefined、新参数和逗号完全没有区间。重新解析输出只能产生新位置，会掩盖这一缺陷。

## 根因与纠正

变换原本用无来源的字面量重新构造已有参数和首逗号，又删除了函数来源。现在复用已确认的 Word 参数、克隆实际首逗号并只归一空白，明确使用 FunctionNode，保留原函数与各节点的 provenance。来源区间指本阶段解析输入，不把生成文本长度当成原文长度。

渐变位置缺少 fallback 时，新增逗号没有可继承的原字符，使用真实输入边界的零宽锚点：闭合函数位于原 after 空白之前，未闭合函数位于原输入末尾。上游4.2.0解析器会为未闭合 quote/url 临时扩长内部字符串，所以先把结束位置限制在本阶段输入长度内，再按原 unclosed 与 after 元数据定位；计算后才修改 after。UTF-16 code unit 与上游保持一致。

过滤空白后的参数序列，逗号后是否还有节点直接由长度判断；注释仍算有效 fallback，不扩大为空的判定范围。

## 验证

本任务独立依赖工作树、Node24.22.1/pnpm12.15.0、基线加本地改动下：

- 真实 parser 透传 spy 捕获变换中的 AST，先7项失败、3项输出对照通过。所有序列化断言在修复前已通过，失败仅在丢失的来源字段。
- 首轮修复后嵌套 calc 新用例的预期锚点少算一位。直接检查输入的内层右括号索引36及真实 parser 的区间5..37后，纠正新测试的35为36；原始失败和纠正证据保留，没有更改产品算法迁就预期。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/variable-fallback-source.test.ts test/coverage-additional.test.ts test/v4.test.ts test/handler-gradient-fallback.test.ts --update=none --coverage.enabled=false`：4文件91项通过，包含首逗号两侧空白/注释、尾空白、未闭合函数、非 BMP 前缀、嵌套函数和未闭合 quote/url。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run --config vitest.native.config.ts test/native/native-value-transform.test.ts test/native/native-declaration-values.test.ts --update=none --coverage.enabled=false`：2文件41项通过，使用先前按当前宿主暂存并核身份的真实 ABI，保留原有种子差分和输出拒绝边界。
- 两个 TypeScript 文件显式 lint 通过。原标准 noEmit 从37降为34条诊断，整体仍失败，未改变检查配置或范围。
- PostCSS bundle/声明构建、71条规则的 agents 检查、release status 与 diff 检查通过；构建仍保留既有 mixed-exports 警告和 noCheck 配置，不将声明生成称为严格类型验收。

## 适用边界

本次修复解析节点的来源契约，不改变输出 CSS，也不声称修复了完整 CSS sourcemap。未修改 Rust 实现、ABI、demo 或快照，没有新的性能或全端验收证据。

## 规则评估

不新增 AGENTS 条目。既有 AST 边界和持久回归要求足够；变换中的来源测试应检查真实 AST，不能重新解析输出后把新位置当成原来源。
