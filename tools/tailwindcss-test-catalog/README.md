# 共享 Tailwind CSS 测试清单

这是仅供仓库测试消费的纯数据包。保留 118 个原有兼容性 case ID、官方功能映射和 361 个去重 parity 候选；运行时不能从静态生成结果推断支持。

根入口导出 `compatibilityCases`、`officialFeatureManifest`、`compatibilityCandidateMap`、`authoringFixtures`、`sourceSyntaxCases`、`arbitrarySyntaxCases` 和 `functionalValueProfiles`。`catalogIdentityPayload` 是包含声明预期、夹具和语法输入的稳定 JSON 字符串；消费方负责 SHA-256 和运行证据。

`compatibilityCandidateMap` 为历史混合 case 增加候选子身份，不更改原有列表。每个候选必须分别验证；父 case 的声明集合不能视为每个候选都已满足。

`authoringFixtures` 包含内存文件、CSS、候选以及按候选或选择器匹配的声明预期。文件名是逻辑请求路径；消费方写到临时目录时必须用 `node:path` 转换。动态插值负例只断言缺失完整候选，不要求扫描器忽略普通业务文本中的所有词法 token。

上游有限注册表和完整默认补全基线位于 `e2e/tailwind-capabilities/inventory/`。functional 的任意值、用户主题和组合变体有无限值域；这里以语法族与类型 profile 明确覆盖边界，不宣称枚举所有字符串。

应用只应扫描根目录的 `compatibility-candidates.txt`，不要递归扫描 `src`。该文本按 `compatibilityCases` 的 `className` 顺序去重，逐行保留原始候选；它避免 TypeScript 字面量转义破坏带引号的任意值，也隔离 parity、authoring 和 source syntax 的独立夹具。修改兼容性候选时同步此文件，`e2e/lynx-source-boundary.test.ts` 会严格校验两者一致。
