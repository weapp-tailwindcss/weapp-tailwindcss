---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: d4ee686ad35f050ada02b643a3bfb5ab694d72ea
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-bundled-css-replay.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-remembered-css-replay-cache.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-uni-app-x-css-watch.integration.test.ts
---

# 样式模块已提交不代表拥有整个合并资产

## 症状

`d4ee` 的 quality shard 2 在 uni-app-x H5 连续生产 watch 中失败，两种 `cssCodeSplit` 均首轮正常，第二轮框架 reset 只剩尾部 marker。Vite CSS 后处理之后仍有完整规则，共享适配器在同轮额外发射一份生成来源 CSS，并在根覆盖清理时误删原合并资产的 reset。

压缩已经移除生成 marker，资产的 `originalFileNames` 也没有逐一对应生成来源；仅凭资产元数据无法得知该来源已经提交。当前 chunk 的模块身份仍包含实际样式来源，原回放流程却把它当成缺席来源。不能通过恢复 marker、硬编码框架选择器或输出文件名补救。

## 根因与纠正

生成器将 CSS 实际返回给 Vite 模块管线时，独立记录交付事实。回放前读取本轮 chunk 的 `moduleIds` 与 `modules`，按完整样式请求身份判断来源是否已经进入当前图；保留 SFC style index，统一处理 Windows 路径与请求参数。

这一判断只排除重复的缺席回放，不建立来源到整份合并资产的替换或删除权限。真正离图的来源、不同 style index、尚未交付的作者来源继续遵循原回放规则；作者刷新覆盖旧记录时撤销此前交付身份。当前图集合只存在于本次调用，不跨 watch 轮次保存。

没有模块交付来源时直接返回，避免为小程序链路遍历无关模块。Iterable 只物化一次，提前查询不能耗尽后续回放输入。

## 验证

原两项真实 watch 回归先本地复现红灯，修复后两种拆分模式连续三轮的 reset、hash 和引用均正确，并新增断言只存在当前被引用的 CSS 产物。作者十七文件 / 358 项定向回归及标准类型、严格 ESLint、架构和 diff 检查通过，0 跳过。

主树整合 `c7760972c` 后，来源回放、缓存、输入所有权、CSS 缓存输入、真实 watch 和独立/内置 injector 双 watcher 六文件 / 70 项通过，0 跳过。`3b5daf6a8` 的按需模块读取修订再以新模块身份测试与真实 watch 两文件 / 18 项通过，包含无交付来源时不读取 bundle getter 和单次 Iterable。数量交叠，不累加成独立验收数。

## 适用边界

本轮没有修改 demo、持久 CSS/JS 快照或设备预算。临时项目回归证明上述图关系，既有 demo static、完整本地设备流程与最终 head CI 仍需分别验收，不能由定向通过代替。

## 规则评估

没有新增规则。既有构建图、产物所有权与禁止硬编码的要求足够；本次增加明确交付事实及正反行为回归，不扩张共享框架契约。
