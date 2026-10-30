---
"@weapp-tailwindcss/postcss": patch
"weapp-tailwindcss": patch
---

增加默认关闭的 `cssOptions.skyline`，按微信小程序目标启用 Tailwind CSS 4 字体变量重置兼容。将 `--tw-leading`、`--tw-font-weight` 的纯 `initial` 与插件生成的对应默认值改为引用未定义的内部保留变量，保留消费端嵌套变量、有效 setter 和作者空值。

为 uni-app Vite 组件本地样式提供独立运行时初始化，并在关闭视觉 preflight、执行根样式覆盖去重时保留该初始化。检查保留变量的声明和注册冲突，拒绝显式保留 `@property` 的不兼容配置；同步说明主题变量移除和作者空值恢复的独立运行时问题。
