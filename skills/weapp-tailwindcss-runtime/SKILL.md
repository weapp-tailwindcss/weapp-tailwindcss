---
name: weapp-tailwindcss-runtime
description: 设计和排查 weapp-tailwindcss 动态 class 组合与运行时封装，覆盖 @weapp-tailwindcss/runtime、merge、cva、variants、typography、theme-transition、ui、clsx、twMerge、weappTwIgnore、escape/unescape、rpx transformer、缓存和组件 class 覆盖。Use for dynamic classes, cn helpers, variant APIs, runtime package selection, or class escaping at runtime；不用于 bundler 初始接入、React Native 或 Lynx 编译器配置。
---

# weapp-tailwindcss runtime

使用项目提供的运行时封装保持 class 合并、转义和构建期精确候选一致。

## 工作流

1. 识别 class 来源：静态模板、完整字面量条件、组件外部覆盖、第三方透传或真正的运行时输入。
2. 读取 [references/runtime-guide.md](references/runtime-guide.md)，按任务选择最小包和 API。
3. 读取各包当前 manifest 与 exports，避免把 `merge/slim`、`merge/lite`、UI CSS 或插件入口当成主入口。
4. 优先使用完整 class 字面量或枚举；不要拼接 `bg-${color}-500` 这类半截 token。
5. 普通组件覆盖使用 `@weapp-tailwindcss/merge`；单槽 variants 使用 `@weapp-tailwindcss/cva`；多槽 recipes 使用 `@weapp-tailwindcss/variants`。
6. 自定义封装名时检查构建期可识别标识符；需要原样透传时使用 `weappTwIgnore`，不要扩大全局忽略。
7. 自定义 runtime factory、escape/unescape 或 rpx transformer 时保持纯函数边界，并验证缓存淘汰前后的等价输出。

## 关键约束

- 运行时包已经封装小程序 escape/unescape；不要先手动 escape 再交给 merge/cva/variants。
- `clsx` 只负责组合，不解决 Tailwind 冲突；需要“调用方最后覆盖”时使用 merge。
- 只有会改变冲突分类的自定义 Tailwind token 才同步 merge 配置，并补冲突用例。
- `weappTwIgnore` 是精确局部保护，不是让未扫描动态 class 自动生成 CSS 的工具。
- 构建期仍遵循 `classNameSet` 精确命中，运行时封装不能补生成缺失的候选。

## 输出要求

输出包选择理由、可复制实现、构建期配套配置、类型约束，以及冲突、转义和生产压缩验证用例。
