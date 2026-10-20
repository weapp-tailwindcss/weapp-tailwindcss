# @weapp-tailwindcss/postcss-calc

> [English](./README.md) | 简体中文

这个包用于处理 CSS 中的 calc() 表达式：能安全计算时会归约结果，遇到混合单位或无法确定的表达式会保留原始 calc()。

`filterDeclaration?: (declaration: Declaration) => boolean` 允许调用方排除注册描述符等声明上下文。返回 `false` 时保持该声明，默认处理全部声明；此选项不限制媒体查询和选择器处理。

## 官网

更多接入方式、配置说明和框架示例见 [weapp-tailwindcss 官方文档](https://tw.weapp.dev)。
