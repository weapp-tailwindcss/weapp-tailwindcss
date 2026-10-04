---
"weapp-tailwindcss": minor
"@weapp-tailwindcss/postcss": minor
---

将 WXML tokenize、JavaScript 完整字面量转换与运行时签名计算接入 Rust Node-API 内核，保留 JavaScript/Babel 兼容路径与公开 TypeScript API。原生与回退路径共享 UTF-16 位置、精确类名命中和条件测试保护语义，并支持显式关闭或要求原生内核的验证模式。

WXML 静态属性值在原生实例内完成扫描、转义和组装；精确模式仅查询实际候选，避免复制完整类集合。动态表达式与自定义回调保留原执行顺序。

修复快速路径的模板正文边界与显式 class 上下文语义，避免模板正文中的括号被错误覆盖。JavaScript 原生转换仅同步查询源码实际候选，消除完整集合扫描；集合原地修改立即生效，映射按实际内容重建实例，原生不支持的语义直接交给 Babel。

修复回退结果缓存对可变类集合、映射、复用覆盖配置与有状态回调的生命周期判断，避免返回过期转换结果；自定义 Set、getter 与 Proxy 保留原有 Babel 执行语义。

PostCSS 接入 Rust 选择器与声明值计算，合并 Tailwind v4 变量及渐变 fallback 解析，并批量处理 uvue translate 参数。保留 PostCSS AST 与用户插件契约，修复原生包加载顺序和自定义映射原地更新的缓存边界。

复杂选择器通过 Rust AST 完成伪类展开、平台伪类移除与 spacing 选择器转换，只向 PostCSS 返回规则动作；未接管语法明确回退。专门的原生测试入口强制验证真实二进制，普通单测保持无 Rust 工具链可运行。

圆角 clamp、渐变方向与 infinity/calc 的独立值计算迁入 Rust，并与变量回退合并为单次声明调用；保留声明顺序、父规则语义和原有数值行为。
