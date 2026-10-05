---
"@weapp-tailwindcss/react-native": minor
---

修正 React Native 样式类型契约：统一使用原生 StyleProp，支持已注册的 StyleSheet ID、嵌套数组与空样式值；组合样式保留内联类型，移除将返回值伪装为普通对象的断言。读取样式属性请使用 StyleSheet.flatten。同步修复 Babel 类型来源和 Metro 同步、异步返回声明，新增严格源码与组件消费端类型门禁。

此变更收紧公开类型：根入口和 runtime 的样式声明需要 React Native 类型，普通数字不再冒充原生注册 ID。纯 Node 消费方未安装可选原生 peer 时，请从 compiler、tailwind、metro 子入口导入；这些入口的声明与原生运行时隔离，已有独立项目回归验证。
