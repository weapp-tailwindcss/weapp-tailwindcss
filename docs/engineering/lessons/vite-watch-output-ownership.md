---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1244
baseline: 653d61f6840e492f70062094384aa1dc3aa75a66
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-css-replay-planned-output.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-source-watch-registration.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-plugin.bundle.unit.test.ts
  - e2e/issue-1241-watch.test.ts
  - scripts/agents/check.test.mjs
  - e2e/issue-1241.test.ts
---

# Vite watch 的输出归属与监听生命周期

## 症状

本地全面流程在 issue #1241 的真实 uni-app watch 回归失败。双 CSS 入口中的一个入口清空扫描范围，另一个将文件型 `@source` 改指向只含 `p-4` 的文件后，干净构建不含 `w-32`，但 watch 产物仍含旧类。解决该场景后，连续从新来源新增、删除类的删除场景又失败。

## 根因与纠正

第一个问题发生在生成任务与历史回放的编排边界。CSS 输出名可能通过框架导入壳关系重定向；本轮异步任务已经计划写入目标，但旧回放只检查最初的 bundle 文件列表，没有看到尚未提交的目标。于是当前生成结果之后又回放旧 CSS。日志中可见当前生成候选已经缩为 1 个，随后出现旧缓存命中与追加。

现在每轮 `generateBundle` 维护明确的 CSS 输出计划。处理当前 CSS 入口时记录最终输出名，回放时先解析导入壳到目标的关系，再排除已被本轮计划负责的输出。所有写入仍经过 bundler 的产物 API；没有读取输出目录来推导来源，也没有硬编码项目布局。

第二个问题发生在监听生命周期。文件型 `@source` 可以不属于模块图，必须通过 `addWatchFile` 注册。旧实现用插件实例级 Set 跳过曾经注册的文件，Rollup 重建本轮监听集合后，连续第二次编辑便可能丢失通知。现在每次 `buildStart` 都注册当前扫描层给出的文件，不把上轮已注册当作本轮已注册。

排查同时确认 `source(none)` 在多 CSS 入口的空范围语义：普通单入口生成仍可接受调用方提供的运行时候选，但多入口来源隔离必须把 `source(none)` 识别为显式空范围，不能把 bundle 候选或历史运行集合当作来源候选。最终修复收敛为输出计划、来源范围识别和监听生命周期三个边界。

记录验证命令时，规则检查器将 pnpm 12 原生 `change` 误认为缺失脚本。同步登记该内置命令，并区分显式 run 子命令的脚本调用与原生命令；前者仍要求 manifest 中存在对应脚本，没有扩大未知命令的放行范围。

## 验证

- 计划写入目标与旧回放冲突的 2 项单测在修复前失败，覆盖直接目标及导入壳重定向。
- 监听生命周期的 4 项单测在修复前第二轮注册均失败，覆盖 POSIX、Windows 盘符、根目录及相对路径；也验证扫描文件移出后不再注册、重新加入后恢复注册。
- 上述回归及既有 Vite bundle、remembered replay、扫描会话用例共 231 项通过。
- `pnpm typecheck`、改动源码的 ESLint 和插件定向构建通过。
- 真实 watch 的 16 个场景全部通过与干净构建的逐条行为比较。原 watch 快照仅有 5 个阶段中的两条同值声明从重复两次变为一次，选择器、声明值集合和作者样式一致。
- 基线更新限定到 `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1241-watch.test.ts -u`；验收仍使用同一文件的 `--update=none --bail=1`。
- 更新后同一 watch 用例以 `--update=none --bail=1` 完整通过，耗时约 49 秒。
- `pnpm agents:test --update=none`：13 项通过；`pnpm agents:check`：0 错误。
- issue #1241 的 `both-empty` 构建回归曾在修复前输出 `.w-32`/`.h-32`，修复后以 `--update=none` 通过且输出为空；该场景保留在 `e2e/issue-1241.test.ts`。

## 适用边界

本次针对 Rollup/Vite 的真实增量构建、输出别名和额外扫描文件监听。路径用例不代表已在 Windows 主机完成原生 watch 验收。全端阶段需要基于最终 checkout 重新预检，单个 watch 回归通过不能替代全面测试结果。

本次属于 `weapp-tailwindcss` 的行为修复，已通过 `pnpm change` 记录中文 patch intent；不改变公开配置项。

## 规则评估

不新增规则。现有 bundler 生命周期、产物图归属、路径边界、先补回归和修改后重新预检的要求已覆盖本次问题。
