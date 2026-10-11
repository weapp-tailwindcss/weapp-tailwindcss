---
status: superseded
supersededBy: docs/engineering/lessons/issue-1214-static-context.md
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1214
baseline: 66db3165a531eae4ca8311f9a4660b7b098f9783
regressions:
  - packages/postcss/test/mini-program-generated-css.test.ts
  - packages/weapp-tailwindcss/test/bundlers/generator-css.unit.test.ts
---

# Issue #1214：小程序 deferred 构建中的 rpx 主题 calc

> 此记录保留首次修复的验证结果，但“动态覆盖不会被冻结”的结论已被后续真实复现推翻。作用域、多来源及缓存的后续修复和当前验证边界见 [静态变量上下文复盘](issue-1214-static-context.md)。以下测试数量属于首次修复，不能作为后续全面验收证据。

## 症状

Tailwind CSS 4 使用 `@theme { --spacing: 1rpx }` 时，工具类会生成合法的 WXSS，但小程序运行时对 `calc(var(--spacing) * N)` 的换算可能与直接写最终 `rpx` 不一致。原生 WXSS 也能复现这种差异，因此不能把问题全部归因于工具类生成。

在库侧还存在一个独立缺陷：显式配置 `cssCalc: ['--spacing']` 后，完整生成路径能够得到静态长度，但小程序 deferred 路径重新处理 `rawCss` 时丢失了主题变量上下文，仍会留下 `calc(var(--spacing) * N)`。

## 根因与纠正

Tailwind v4 生成器在样式上下文中已经收集了自定义属性值。deferred 输出却只携带字符串形式的 `rawCss`，并且先把主题作用域改写为小程序选择器，再进入 `cssCalc` 处理。此时求值器看不到原始变量声明，`cssCalc` 选项只有变量名，无法凭空恢复变量值。

修复保持构建图中的上下文传递：

- 生成结果暴露 `customPropertyValues`，结果合并和增量缓存继续携带这份映射；
- deferred 处理使用完整 `generated.rawCss` 作为上下文，并传入生成结果的变量映射；
- `cssCalc` 在主题作用域改写和小程序 CSS 裁剪前执行；
- 变量固定且可解析时，`calc(var(--spacing) * 32)` 输出为 `32rpx`；
- 未配置、动态覆盖、变量链无法解析或后续插件重新生成表达式时，保留运行时 `calc()`。

这样可以让微信只换算最终长度，绕开小 `rpx` 基数参与运行时乘法时的中间量化；修复不改变微信内部的换算算法，也不冻结运行时主题。

## 验证

- PostCSS 回归覆盖主题作用域改写前的静态计算和增量上下文，当前包测试为 974 项通过、3 项既有跳过。
- 生成器回归覆盖 deferred `--spacing: 1rpx`，`w-32` 输出 `32rpx`、`p-4` 输出 `4rpx`，当前定向测试为 172 项通过。
- 根 `pnpm build` 的 68 个任务全部通过；构建脚本所需的 `tsx` 依赖由基线提交 `66db3165a` 提供。
- 文档构建需同时通过配置文档检查和中英文文档同步检查。

## 适用边界

该修复只覆盖库侧 Tailwind v4 小程序 deferred/incremental 生成链路。动态 CSS 变量、无法取得完整主题上下文的输入、后续插件改写后的 CSS，以及微信 Android/iOS 真机、Skyline 和其他设备的运行时表现仍需单独验证。没有运行时 `calc` 也不等于所有设备尺寸已经验证。

本次不修改 #1208 的 HMR 实现；该问题对应独立的 uni-app x Web HMR 生命周期修复和环境复测范围。

## 规则评估

本次沿用构建图和生成器生命周期中已有的变量上下文，不通过固定目录、文件名或后置文件读取恢复主题值。`cssCalc` 仍由 PostCSS 包负责，主包只传递生成结果和延后处理上下文；现有架构契约、PostCSS 所有权和动态变量边界已经覆盖该修复，不新增 AGENTS 规则。
