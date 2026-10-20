---
"@weapp-tailwindcss/postcss": patch
"@weapp-tailwindcss/react-native": patch
---

修复 React Native 默认 spacing 简写中 calc() 被空格拆分的问题，完整保留四边数值并拒绝超过四项的非法简写。按 React Native 0.81 布局 API 校验 display、position 与 flex 对齐关键字，保留 contents，对 fixed、sticky 和浏览器独有布局值明确诊断。原生平台变体与浏览器状态或响应式条件复合时不再丢弃条件并无条件套用基础样式；派生规则使用独立 StyleSheet ID，避免覆盖基础规则的运行时条件。
