---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: 4801004a68644b7da5d10f5f452ee73f5deef067
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-extension.integration.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-processed-css-ownership.test.ts
---

# Vite watch 的已处理 CSS 产物退役

## 症状

PR #1316 在基线提交的 [PR quality and unit tests (3)](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40062077593/job/120779182371) 首次暴露真实 watch 回归：当前产物已经包含 `width: 43px`，末尾却再次追加上一轮 `width: 29px`。失败发生于来源替换后的旧样式删除断言，生成引擎已经生成当前候选。

自然顺序的单次本地运行及有限诊断运行没有重现，不能据此归因为 CI 噪声。将 fixture 根样式移动到 bundle 枚举末尾，即可在保留原有 20 秒观察上限及断言的条件下稳定重现。该操作仅改变合法产物的枚举顺序，不改变 CSS 内容、构建图或框架能力。

## 根因与纠正

已处理 CSS registry 使用物理输出文件名缓存转换结果。内容变化使 Vite 发射新的文件名，旧记录仍因其 `outputFile` 指向活跃根样式而被保留。根样式先处理时，覆盖过滤容易使旧记录变为空内容，从而掩盖问题；其他合法枚举顺序则会重放完整旧规则。

修复在覆盖过滤和资产搬移之前登记产物归属。来源使用生成标记，逻辑投影使用 Rollup 公开 `names` / `name`；同一投影可有多个物理输出，一个物理输出也可有多个来源与名称。没有发射名称时只采用准确文件身份，不猜测内容 hash 格式。部分构建只替换明确出现的投影，保留未出现的独立投影。

当当前投影明确替换旧物理产物时，旧产物的全部别名同时退役。复合产物依赖每个贡献来源，删除任一来源均使整份旧复合快照失效；当前批次仍显式出现的产物按完整批次重新登记，不能依赖遍历顺序决定其存亡。

collector 复制到来源或目标别名的记录显式带有物理产物 provenance。失效时撤销对应派生记录，保留被派生值覆盖前的独立来源记录；较新的独立写入解除派生关系。合并目标保留所有参与产物的依赖。registry 不尝试按选择器拆分已经转换的 CSS。

普通生成、最终同步及 CSS finalizer 使用同一归属操作。显式来源删除撤销相关快照；`prune` 同时释放已完全退役的归属索引，活跃来源、目标或派生记录仍能支撑合法的部分图复用。永久释放清空全部实例状态。

## 验证

本轮在 macOS、Node 24.18.0、本任务独立 worktree 上验证，基于 `6747fa1d6db6e8e6b02e0cfcaacbfb6c054f72ef` 加本次改动；该提交本身不包含本次修复。

- 修复前：真实 watch 的根样式末尾顺序稳定触发 `width: 29px` 残留；未放宽超时、断言或性能预算。
- 修复后：使用 `CI=1`、`vitest run` 和 `--update=none` 验证两个持久回归文件及下述受影响测试。覆盖默认及根样式末尾顺序、连续新增/替换/删除、在途关闭及独立 build。
- 受影响的 processed CSS、finalizer、remembered replay、来源输出关系、根样式提交等共 22 个文件、238 项回归通过。新增用例覆盖 POSIX / Windows / 盘符 / 根目录 / 相对路径、同来源多投影、多来源复合资产、别名减少、部分 bundle、来源删除、最终收尾登记及长期索引裁剪。
- `pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --noEmit`、`pnpm --filter weapp-tailwindcss build`、`pnpm architecture:check` 通过；17 个本次修改的 TypeScript 文件通过严格、无自动修复的 ESLint 检查。

本记录未宣称更新后 PR head 的完整 CI 或真实设备验收通过。此修改不调整 demo、static CSS 基线或产品样式预期；测试保留原有旧候选必须消失的语义。

## 适用边界

归属证据来自当前 Vite / Rollup 资产及已有来源标记。没有名称或标记时不猜测来源，也不通过后置读取源文件、硬编码目录、统一清空缓存或固定处理顺序补偿。Webpack、Gulp 及原生设备链路不由本次定向验证证明。

## 规则评估

不新增 AGENTS 规则。现有“按输入、转换、产物定位首次偏离”“来源关系属于构建图”“保留确定性 red / green 回归”已覆盖本次问题。此次将隐含的产物寿命落实为实例内归属与失效契约，并通过行为及资源释放测试持续约束。
