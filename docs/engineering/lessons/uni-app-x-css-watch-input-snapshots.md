---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: 8f0d56a7b355a86fc11a9f23748ae88e8f7adb90
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-uni-app-x-css-watch.integration.test.ts
verification:
  - claim: 已完成快照按本轮样式输入匹配，合法脚本增量不会被误认为下一轮样式产物
    kind: integration
    status: passed
    sha: 44a3a48670513ed45b330392bfb184f060be2b24
    environment: macOS arm64，Node 24.18.0，pnpm 12.14.0，CI=1，两个 CSS 拆分模式
    command: pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-uni-app-x-css-watch.integration.test.ts --update=none
---

# uni-app-x CSS watch 快照与本轮输入

## 症状

`ab1aa7d59e6fa22e1208e15453f2217bed3cfb40` 的质量分片 job `120792087906` 在相邻样式输出文件名必须变化的断言失败：两次读取均为 `assets/style-db93861908786f01.css`。自然顺序的本地两个模式通过，不能据此归因为 CI 噪声。

## 根因与纠正

旧测试用累计 `END` 数量和 `snapshots[index]` 对应 red、blue、green 三次写入，同时假定恰好发生三次构建。合法的脚本增量保持 CSS 不变，却产生另一份完成快照；下一次写入便可能读到前一个输入的结果。

在真实 Vite watcher 中加入一次仅修改 `entry.js` 的构建，保留旧等待和断言，即可使两个 CSS 拆分模式稳定复现同名资产失败。此实验证明测试存在可确定复现的轮次归属缺陷；原 CI 日志没有逐轮输入及事件轨迹，不能声称已确定该次 CI 额外构建的具体触发源。

修订将 `generateBundle` 快照先暂存，到 `END` 后才允许选择。每次写入前记录快照起点，再按本轮实际颜色选取已完成产物。脚本增量通过脚本内容确认归属，并明确验证 CSS 和文件名保持一致。样式轮次继续验证 CSS 自身 hash、相邻样式 hash 变化、旧资产消失、仅有一个 CSS、脚本引用以及 reset 顺序，观察上限仍为 20 秒。

## 验证

- 作者在准确基线叠加真实脚本增量、保留旧逻辑时，两项均失败；修正后 Node 24.18.0 与 CI 所用 Node 22.23.3 的两个模式均通过。
- 主树整合提交 `44a3a4867` 后，完整测试文件两项通过、零跳过；标准 `tsc -p tsconfig.typecheck.json --noEmit`、该文件严格 ESLint（显式关闭禁止使用的 Prettier 规则）通过。
- 原始基线、确定性红、两个 Node 版本绿及主树整合 JSON 报告保留在本任务忽略的工件目录，未触发正式 CI 重跑。

## 适用边界

此修改只调整临时 fixture 的输入和观察，不修改产品模块、仓库 demo、CSS 语义或 static 基线。它不能证明 Windows 文件监听恢复、Mpx 性能预算或新 head 全部 CI 已通过；完整本地验收仍须重新预检。

## 规则评估

不新增 AGENTS。既有[本轮源码与完成事件归属](vite-watch-mutation-completion.md)规则已覆盖该问题，本次用真实的额外构建固定回归。
