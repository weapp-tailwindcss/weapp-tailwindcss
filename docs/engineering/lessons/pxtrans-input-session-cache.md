---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: eaf4167bbb775088313526db14008bf6ae4d6087
regressions:
  - packages/postcss/test/px2rpx-callback-lifecycle.test.ts
---

# 动态设计稿的派生倍率必须属于单次处理

## 症状

同一个 designWidth 回调从750改为375，相同文本仍返回旧倍率。复用同一个 Root 的 Input 时，即使修改 Input.document 已使完整结果缓存失效，第二轮仍把10px转换成10rpx，而新 handler 能正确得到20rpx。直接复用公开 pipeline 组装的同一个 PostCSS Processor 也有相同问题。

## 根因与纠正

实际安装的 postcss-pxtrans1.1.0 在插件实例中以 WeakMap 按 Input 保存派生 rootValue。Root 克隆保留来源 Input，handler 的 Pipeline 和 Processor 也会复用该插件，因此这个缓存越过了单次处理的边界。仅禁用最后的结果缓存不能解决插件内部的旧倍率。

动态 canonical designWidth 且没有显式 rootValue／root_value 时，内部适配器保持原插件名称，在每个 LazyResult 的公共 prepare 中创建真实上游实例并委托其真实 prepare。WeakMap 因此属于本轮处理，同一轮仍按 Input 复用派生值。没有嵌套 Processor、私有状态重置、AST 假修改或提前执行回调。

handler 对这个分支禁止文本与 Root 完整结果缓存的读取和写入。Pipeline、Processor、配置缓存和特征探测继续保留；默认、常量以及未启用分支继续消费原上游实例，不增加新阶段。显式 rootValue 或 root_value 常量完全绕过设计稿派生倍率，designWidth 不被消费，保留原缓存控制。

## 验证

本工作树独立依赖、Node24.22.1/pnpm12.15.0：

- 新回归先4项失败、7项对照通过，分别确认最终结果缓存、同 Input 插件实例、公开 Processor 复用及提前创建多个 LazyResult 的边界。
- 修复后8个文件78项通过，使用 `--update=none`，不更新已有快照。
- 默认 true、常量750／375和 false 保留原输出、结果命中与 pipeline 复用；显式 rootValue／root_value 常量不调用 designWidth。旧别名的上游弃用警告保留。
- 动态分支的输出与新 handler 一致，来源 Input 保持绑定、调用方原 Root 不变；组装 pipeline 不执行回调，实际处理中的非 Error rejection 保持原对象。
- 最初 lint 未覆盖默认忽略的测试文件；显式 `--no-ignore` 后发现并修复新测试的一处同行多语句格式错误。最终3个 TypeScript 文件显式 lint、包构建与声明、规则检查、发布状态和 diff 检查通过。原严格检查仍只有两处作者阶段 protected 接口错误，未改变编译参数。

## 适用边界

本次只修 canonical designWidth 的派生倍率生命周期，不证明 rootValue、exclude 或其他插件工厂回调的外部状态均可缓存，也不处理不透明配置实例的全部身份问题。旧 design_width 在适配器默认值合并后的选择行为没有调整。完整作者阶段、Document parser、保护占位及 source map 所有权仍需独立设计；严格检查原两处 protected 接口错误继续保留。

未修改正式性能预算、后端或全面验收门槛，不依据定向单测宣称端到端性能或全端验收通过。

## 规则评估

沿用现有生命周期、来源身份和根因回归规则，不新增 AGENTS。配置缓存只能复用无状态适配器，按 Input 派生的运行状态须明确归属本轮处理。
