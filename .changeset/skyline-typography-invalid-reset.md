---
"@weapp-tailwindcss/postcss": patch
"weapp-tailwindcss": patch
---

增加默认关闭的 `cssOptions.skyline`，按微信小程序目标启用 Tailwind CSS 4 字体变量重置兼容。将 `--tw-leading`、`--tw-font-weight` 的纯 `initial` 与插件生成的对应默认值改为引用未定义的内部保留变量，保留消费端嵌套变量、有效 setter 和作者空值。

为 uni-app Vite 组件本地样式提供独立运行时初始化，并在关闭视觉 preflight、执行根样式覆盖去重时保留该初始化。检查保留变量的声明和注册冲突，拒绝显式保留 `@property` 的不兼容配置；同步说明主题变量移除和作者空值恢复的独立运行时问题。

局部样式产物按作者输入、样式请求和编译依赖版本验证后再复用；多样式块分别登记来源，并在组件主模块更新时撤销已删除的样式，保留独立主题、scoped 及条件语义。关闭 Skyline 时不提前读取 Webpack 样式资产，也不改变既有平台和 calc 默认值。
