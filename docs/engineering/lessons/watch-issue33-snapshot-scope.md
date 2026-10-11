---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38115113180/job/114398354722
baseline: 0be08166231418ea142637d028063a435edb7df1
regressions:
  - packages/weapp-tailwindcss/test/ci/watch-issue33-snapshot-gate.test.ts
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-regression.unit.test.ts
---

# issue33 watch 快照门禁与执行范围一致

2026-10-11，完整 E2E Watch nightly 在 `0be08166231418ea142637d028063a435edb7df1` 上暴露外层快照门禁错误。失败为 [Windows Node 22 weapp-vite 分包 issue33 job](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38115113180/job/114398354722)，关联工作为 Refs #1282。

## 症状

内层 watch 工具执行了 `sub-normal` 与 `sub-independent` 两个分包，各自完成 baseline、complex、hex 与 issue33 arbitrary 四轮；issue33 的新增、修改、删除均成功，并输出六份成功快照。报告声明 `miniProgramScope=subpackages`，主包 script 未被调度，符合独立执行分包的设计。

首个偏离发生在内层报告通过之后：外层 `runHotUpdateTarget` 仅按目录名后缀，一律要求 template 与主包 script 的六个阶段。分包 scope 因不存在本来就不执行的 `script-add-success` 被拒绝。该检查还遍历整个快照目录，会被先前命令、另一个项目或另一个分包的同后缀快照错误满足。

## 根因与纠正

外层仍先执行完整报告合同，主包 template/script 和所选分包数量、轮次与性能预算均由该合同强制校验。快照门禁随后从已验收报告的实际 mutation/round 获取 carrier，按本轮 issue33 modify marker 绑定 metadata，再对同一项目、label、source identity、mutation kind 与 round 验证 add、modify、delete 三阶段成功证据。

命令启动前记录快照目录，命令结束后只读取新增目录；旧命令与前一个 scope 的证据不能放行本轮。读取目录与文件使用 `node:path` 和文件系统 API，缺失或损坏的 metadata 立即失败。

报告的 `sourceFile` 原样来自 mutation 的原始 source value，metadata 原有的同名字段却由 `formatPath` 转成相对展示路径，两者不能在验收宿主上推导为同一个来源。生产者新增明确的 `sourceIdentity`，原样复用报告的同一 source value，原有展示字段保留用于诊断。门禁的 modify、add、delete 全部比较该不透明身份值，不在另一台主机解释 POSIX 或 Windows 路径。modify marker 包含 `Date.now()`，正常串行执行不能作为形式上的 carrier 唯一性保证；相同 marker 的不同分包也必须分别验收来源身份。

该修复保留主包 script 必需三阶段，同时要求每个实际分包 template 各自三阶段。没有调整性能阈值、轮次、平台矩阵或 skip 策略，也没有改变 demo 与构建产物，不需要重新生成 static 样式基线。

## 验证

- 新增回归覆盖主包 template/script、每个分包 template 的任一缺失阶段、失败状态、错误 marker、前一命令快照排除、缺失 metadata，以及 POSIX、Windows 盘符、反斜杠与相对 source identity。测试通过实际生产者 metadata 工厂提供三阶段证据，包含相同 project、kind、round、marker 但不同 carrier 的负向回归。
- 从失败 job 下载真实报告与六份 metadata，核对两个分包的完整 CRUD 与首次失败层级。旧格式 metadata 缺少新增来源身份，不作为新 gate 已通过的证据；新格式来源身份与每个缺失阶段通过生产者工厂和门禁的定向回归验证。
- 冷工作树先执行 CI 同入口的依赖构建：`pnpm --filter weapp-tailwindcss... --filter "./packages-runtime/*" run build`。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/watch-issue33-snapshot-gate.test.ts test/ci/workflows.test.ts test/watch-hmr-regression.unit.test.ts --update=none`：3 文件、184 项通过，其中门禁回归 23 项。
- `pnpm exec eslint --no-ignore e2e/watch/hot-update/issue33-snapshot-gate.ts tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class/snapshot.ts tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class.ts packages/weapp-tailwindcss/test/ci/watch-issue33-snapshot-gate.test.ts`：4 文件严格 lint 通过。

## 适用边界

本轮仅修改 E2E 外层证据验收，不修改构建器、CSS 生成与 mutation 执行。真实失败报告重放是门禁根因的定向验证，不是一次新的 hosted Windows watch；完整新 head 的 Watch 与 Coverage 验收仍由主流程执行，因此复盘保持 `partial`。本地没有启动浏览器或操作微信 IDE。

## 规则评估

现有执行范围、当前证据、跨平台路径与回归要求足够，不新增 AGENTS 规则。把 scope、carrier 和本轮报告 marker 固化为可执行门禁，比增加固定目录名或放宽断言更能防止重复错误。
