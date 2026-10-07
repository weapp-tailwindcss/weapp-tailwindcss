---
"weapp-tailwindcss": patch
---

修复 Oxc 快速路径对条件测试字符串的误转换，对齐 Babel 的父表达式与括号节点语义，并保留指令字符串；含 JSX 实体的属性回退 Babel 解码。

Oxc 分析按源码大小与反序列化器初始化状态选择 raw transfer，避免中等 chunk 的首次加载开销；运行时签名使用普通 AST。不支持或失败时回退普通解析，保持模块图、source map 与 ignore 场景的 Babel 回退行为及公开 API 不变。

关闭快速路径或启用模块图时省去不会被消费的类名预扫描，保留依赖分析与原有跳过规则。
