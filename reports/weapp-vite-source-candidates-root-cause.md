# Issue #1127：weapp-vite source-candidates 性能根因

## 结论

Issue #1127 报告的主要耗时来自候选源扫描、候选提取重复执行和 `generateBundle` 入口规划的全图遍历。`realpath` 只是次级热点，单独优化它不能解决 3 至 5 秒的构建耗时，也不能消除单文件 HMR 的级联更新。

问题复现环境为 `weapp-tailwindcss 5.3.6`、Tailwind CSS 4.3.3、`weapp-vite 6.23.0`、`wevu 6.23.0`、Vite 8.2.2，项目约 51 个页面、105 个 Vue SFC、116 个组件和 815 个生产文件。固定 repro 的构建观测约为 11 至 13 秒，其中插件约 10.9 至 13.0 秒，`post generateBundle` 约 3.7 秒，`source-candidates buildStart/transform` 合计约 2 秒。单文件 HMR 可观察到数百次 `watchChange/handleHotUpdate` 调用。

## 根因数据流

1. source scan 通过 source entries 解析所有 eligible 文件，并读取、提取每个文件。watch 只复用扫描定义和部分快照，不能保证 scan 与 transform 对同一文件共享提取结果；全局内容 LRU 容量有限，在百级 SFC 项目中会频繁淘汰。
2. Vite 先调用 `watchChange`，随后可能为同一文件调用 `handleHotUpdate`。原实现按文件保存 pending promise，但两个生命周期各自读取和同步，无法把一次文件系统变化合并为一个事务；非候选文件也会触发匹配、删除和快照路径。
3. `generateBundle` 已有 dirty 集合，但入口循环仍为 clean JS/CSS 构造完整处理计划。clean JS 只需要回放处理缓存时，仍会创建 handler、链接集合和任务工厂；CSS 入口也会重复执行归属和 source plan 判断。

## 修复边界

- shared source-candidate store 增加按规范化文件和源码版本的有界 memo，scan、transform、CSS、module layer 统一命中；返回集合始终 clone。
- Vite source scan session 增加 queued change 与 batch flush。`watchChange` 登记事件，`handleHotUpdate` 复用登记源码并等待同一批次；同文件只保留最新事件，批次完成后按 collector revision 至多生成一次快照。
- bundle state 缓存 entry metadata；增量 clean JS 优先直接回放已缓存代码，只有缓存未命中才进入完整 transform。CSS 入口继续使用保守的 dirty/remembered replay 判定，避免把“曾处理过”误当成“当前源码可复用”；root CSS、分包、linked impact 和删除场景保留完整回退。
- 缓存仅存在当前进程和当前构建图，不写磁盘，不改变生产构建之间的状态隔离。

## 验证口径

候选集合、特殊 class/任意值、删除和重新创建行为必须与完整扫描一致。基准使用仓库自有 4 个 source root、120 个 SFC 合成夹具，并与现有 150 页面 Vite adapter 结合，报告 cold build、warm incremental、单文件 HMR 和批量 HMR 的 median/P95。性能回归继续使用仓库现有 5% 规则，不设置绝对耗时门槛。

关联：[Issue #1127](https://github.com/sonofmagic/weapp-tailwindcss/issues/1127)
