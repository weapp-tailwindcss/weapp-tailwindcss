---
"weapp-tailwindcss": patch
---

优化 Oxc JavaScript 快速路径的 class 上下文判断，在单次 AST 遍历中增量维护对象属性、JSX class 属性和类名 helper 参数的上下文，保持与 Babel 的父表达式语义一致并减少重复祖先链扫描。
