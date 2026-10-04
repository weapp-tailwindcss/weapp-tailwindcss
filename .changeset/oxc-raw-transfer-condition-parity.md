---
"weapp-tailwindcss": patch
---

修复 Oxc 快速路径对条件测试字符串的误转换，对齐 Babel 的父表达式与括号节点语义，并保留指令字符串；含 JSX 实体的属性回退 Babel 解码。

Oxc 分析与运行时签名优先使用 raw transfer 传递 AST，不支持或失败时回退普通解析。保持模块图、source map 与 ignore 场景的 Babel 回退行为及公开 API 不变。
