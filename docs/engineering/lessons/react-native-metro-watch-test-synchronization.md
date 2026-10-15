---
status: superseded
supersededBy: docs/engineering/lessons/react-native-metro-watch-reconciliation.md
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: fc4f67b5395acaf50fd9adab6d8e7f4823ec4f8c
regressions:
  - packages/react-native/test/metro-watch.test.ts
  - packages/react-native/test/metro-refresh.test.ts
  - packages/react-native/test/metro-store.test.ts
---

# Metro 原子保存回归应等待真实文件事件

后续完整验证在 `b46a8ead75026bdb53d7e311461ba45be91b3ab6` 的原有 30 秒边界内没有收到任何原生事件，说明测试同步修订不足以补齐生产通知遗漏。当前产品修复和回归见 [Metro 文件监听版本核对](react-native-metro-watch-reconciliation.md)。以下保留首次排查的证据、当时结论和限制，不以独立诊断通过替代后续失败。

## 症状

全面验证在上述基线运行时，[原子保存回归](../../../packages/react-native/test/metro-watch.test.ts)第一次等待失败：预期回调读取 `first`，实际仍为初始空字符串。失败发生在 `vi.waitFor`，其默认等待预算为 1000 ms；原始输出保留在 `e2e/.artifacts/full-validation-20261014/full-run-ab163.log`。同轮还有一项与该监听无关的发布脚本断言失败，由主任务独立处理。

未修改源码的独立单文件运行随后通过 2 项测试，原子保存耗时 109 ms。这一次通过不能推翻首次失败，也不能确定首次失败发生在操作系统通知、事件循环调度还是测试轮询边界。

## 根因与纠正

本次确认的是测试同步合同存在额外的 1 秒轮询边界；尚未确认首次失败的唯一原因。有限原生诊断直接调用现有 `watchInput`，在每轮监听同步返回后立即首次原子替换，再等待实际回调后执行第二次替换。12 轮、24 次保存均收到回调：首次替换到回调为 9.47–51.20 ms，第二次为 0.027–0.107 ms，关闭通知为 0.10–0.15 ms。没有观察到通知丢失，也没有观察到超过 1 秒的交付，不能据此宣称已证实调度延迟导致首次失败。

测试现在在每次替换前登记 Promise，由实际监听回调读取新内容并完成 Promise，随后精确断言 `first`、`second`。首次保存仍紧接监听创建，不增加暖机等待、补发事件或重试；异步等待统一受包配置已有的 30 秒 `testTimeout` 约束。失败时记录当前待通知内容、保存时间、回调内容和原生事件时间，便于下轮区分通知与等待边界。

清理登记在 `onTestFinished`，测试通过、断言失败或整体超时均先等待 `FSWatcher` 的 `close` 事件，再删除临时目录。不能仅用悬挂 Promise 外层的 `finally` 保证测试超时清理，因为测试运行器超时不会自动取消该 Promise。

[生产监听实现](../../../packages/react-native/src/metro/watch.ts)保持不变，继续监听目标文件的父目录并过滤相邻文件；本次不发明 ready API，不新增公开包 change intent。

## 验证

环境为 macOS arm64、Node 24.18.0、pnpm 12.9.1。以下修订后验证基于基线 SHA 加本次未提交测试改动，不将该 SHA 误记为已包含修订。所有普通 Vitest 命令使用 `CI=1`、禁用覆盖率且不更新快照。

```bash
CI=1 pnpm --filter @weapp-tailwindcss/react-native exec vitest run test/metro-watch.test.ts --coverage.enabled=false --update=none --reporter=verbose
CI=1 pnpm --filter @weapp-tailwindcss/react-native exec vitest run test/metro-watch.test.ts test/metro-refresh.test.ts test/metro-store.test.ts --coverage.enabled=false --update=none --reporter=verbose
```

第一条为修改前基线，2 项通过；第二条为修改后定向回归，3 文件 14 项通过。原始输出分别保留为 `metro-watch-baseline.log`、`metro-watch-targeted-core.log`，原生事件诊断脚本与逐轮时间保留为 `metro-watch-events.mjs`、`metro-watch-events.log`，均放在忽略的 `.codex-tmp/` 中。

额外使用如下命令，刻意把单次测试总边界压到 1 ms，验证失败路径，而不是放宽生产验收门槛：

```bash
CI=1 pnpm --filter @weapp-tailwindcss/react-native exec vitest run test/metro-watch.test.ts --testNamePattern=同一文件连续原子保存 --testTimeout=1 --coverage.enabled=false --update=none --reporter=verbose
```

该命令按预期失败，输出 `Test timed out in 1ms`，并记录 `pending: 'first'` 与首次保存时间。执行前后核对本轮 `rn-watch-*` 临时目录，残留为零；输出保留为 `metro-watch-timeout-cleanup.log`。另用临时配置继承包 tsconfig、仅包含该测试及其导入的监听实现，执行 `pnpm exec tsc -p .codex-tmp/metro-watch-typecheck.json --pretty false` 通过。

首次扩大到 `test/metro.test.ts` 时，31 项中的 29 项通过，另外 2 项 `react-native-web` 解析断言失败，完整输出保留为 `metro-watch-targeted.log`。本工作树仅进行 scoped 依赖安装，该测试的 `../../examples/react-native-expo` 从测试目录解析到 `packages/examples/react-native-expo`，不等于仓库实际示例目录；主任务同轮完整安装下该文件已通过。这里仅记录依赖与 fixture 边界，未证明路径就是这两项失败的唯一原因，也未将其改写为监听产品缺陷。

## 适用边界

本次没有重新启动全仓测试、全面预检、浏览器或设备。Windows/Linux 原机事件交付与真实 Metro 原生 HMR 均未新增验证；macOS 有限诊断不能替代这些环境。首次全面失败尚未获得包含事件时序的复现，因此状态保持 `partial`，待主任务集成后重新全面验证。

## 规则评估

不新增 AGENTS 规则。沿用现有未复现不制造产品补丁、真实异步边界、失败保留证据和资源归属要求，以持久测试同步及超时清理改进落实。
