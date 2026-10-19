---
"@weapp-tailwindcss/react-native": patch
"@weapp-tailwindcss/postcss": patch
---

隔离 React Native 的多个 Tailwind 样式入口，避免前缀、主题和配置相互污染；解析原生排版中的主题变量，未解析或循环变量保留明确诊断。按最终字号层叠结果换算相对行高，支持内联字号及静态样式查找；完整保留多层阴影与 spread，避免局部变量污染其它规则。

在最终 class、important 和内联样式层叠后解析阴影变量，完整组合 ring、inset、颜色与透明度修饰符；保留入口默认值边界和 currentColor 上下文，输出 RN 与 Expo Web 均可消费的颜色格式。新增不依赖 Node 的原生值解析子入口供运行时复用。

复杂选择器按 AST 精确诊断，避免 group、peer 等规则静默丢失；在最终变量层叠后组合双轴 skew。运行时实例分别维护注册表及元数据，样式工厂更新后刷新缓存；深层数组采用迭代解析并拒绝循环引用，保留近零但非零的阴影透明度。
