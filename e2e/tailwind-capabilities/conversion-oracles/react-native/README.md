# React Native 字面量转换合同

`react-native-literal-mapping-v1` 只证明 CSS 被准确编码为 React Native manifest。运行时、布局、截图和平台 API 可用性必须另外验收。

## 独立来源

- 输入来自隔离的官方 Tailwind CSS 4.3.3 默认主题与候选编译结果，不读取产品生成器的结果。
- display、position、flex 和对齐枚举冻结自 [React Native 0.81 Layout Props](https://reactnative.dev/docs/0.81/layout-props)。例如 position 只有 relative、absolute、static，display 支持 flex、none、contents。
- 数值和属性映射由本目录人工维护，不导入产品属性表、manifest 或执行状态。默认根字号固定为 16；em、视口单位和宿主字体依赖保留缺口。
- 黑、白、transparent 与明确十六进制色值按字面量保留。现代颜色函数需要另一份独立颜色 oracle，不调用产品颜色转换器制造预期。

## 完整性

每个候选必须完整审查全部选择器、条件、声明和变量依赖。仅有准确单类选择器、无条件规则或完整 dark 媒体查询可以进入正向合同。ios、android、native 从已生成的基础 utility 建立平台合同。

无法确认规则边界的重复声明、局部/条件变量覆盖、未知属性、宿主依赖、结构选择器与复杂表达式使整个候选缺少 oracle，结果保持 not-run。不能只摘取已认识的几条声明。

浏览器变体、明确不适用的布局枚举和预先登记的浏览器专有属性使用负向合同，要求准确的候选级诊断和完整残留声明。编译器失败、规则为空或出现 warning 都不能自动产生 unsupported 预期。

实际观察保留 important、colorScheme、platform 与额外原生运行时 metadata；错值、缺边、丢条件、额外隐藏表达式和错误诊断均失败。

## 已冻结覆盖

默认注册表 23,286 个候选中，当前合同完整审查 1,599 个：1,511 个正向、88 个明确拒绝；21,687 个仍缺独立合同。这些数量只描述编码审查范围。补充的 arbitrary、important、dark 与平台候选在单独的真实编译回归中核验。

回归入口是 [`e2e/tailwind-react-native-conversion-oracle.test.ts`](../../../tailwind-react-native-conversion-oracle.test.ts)。它先建立所有预期，再执行真实编译器，逐项比较固定清单中已审查的合同，并验证缺属性和丢条件等反例。
