---
"weapp-tailwindcss": patch
---

优化 Oxc JavaScript 快速路径的 class 上下文判断，在单次 AST 遍历中增量维护对象属性、JSX class 属性和类名 helper 参数的上下文，保持与 Babel 的父表达式语义一致并减少重复祖先链扫描。

class 上下文统一依据解析后的 AST 判断，修复转义斜杠、转义或规范化属性名，以及带注释的 helper 调用被源码文本预筛遗漏的问题；Oxc 与可选 Rust 内核均保留精确类名集合匹配和普通业务路径保护。
