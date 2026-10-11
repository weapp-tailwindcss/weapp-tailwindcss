---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: e192ed3d3b2a6e3aa402f1c72b9355f7efe7f94c
regressions:
  - e2e/framework-ide-watch-lifecycle.test.ts
  - e2e/framework-ide-source-cancellation.test.ts
  - e2e/framework-ide-mutation-cancellation.test.ts
  - e2e/framework-ide-project-lifecycle.test.ts
  - e2e/framework-ide-live-page.test.ts
  - e2e/frameworkIdeReopen.test.ts
  - e2e/frameworkIdeProbeRunner.test.ts
---

# Framework IDE HMR 的取消与恢复边界

## 症状

只读审查发现，`frameworkIdeHotUpdate` 使用 `Promise.race` 返回总超时，但底层任务没有被取消或等待。等待中的基线读取、IDE 调用或文件写入稍后完成时，任务仍可能继续写源码；此时外层 `finally` 已恢复过源码。恢复失败又被空 `catch` 吞掉，而 watcher 关闭失败会覆盖原探针错误。

先补的三个回归在旧实现上全部失败，分别表现为恢复失败仍成功、只剩 watcher 错误、总超时后任务未结束就出现恢复事件。它们证明生命周期缺陷，但没有证据将这些问题认定为历史 `4af4383e` 的运行时错误根因；该次记录首先失败于 template HMR 后的运行时检查，并非总超时。

进一步沿同一调用链检查发现，临时 IDE 连接释放失败被忽略，最外层项目关闭失败会覆盖探针错误，项目配置恢复失败只打印日志。聚合错误若仍包含瞬时故障关键词，旧重试器还会在清理失败后启动下一轮。

## 根因与纠正

- 总时限触发 `AbortSignal`，仍等待拥有源码写入权的任务结束，然后统一恢复。模板、脚本和样式入口在写入前检查取消；已经提交的文件写入必须落定，不能被 `Promise.race` 遗弃。
- 轮询携带取消信号，长轮询间隔也能立即结束。IDE 读取只在不持有源码写入或待回收资源的叶子调用处中断等待；后续调用每次检查信号，迟到结果不能重新启动读取链。
- 临时连接获取保留原有有界 `launch`；取消时等待获取结果并释放自己的连接，不提前放弃可能迟到的连接。项目关闭继续走原绑定服务和现有登录保护，不增加启动、重启、注销或账号操作。
- 源码按保存的原文恢复，保留混合换行。各文件恢复、watcher 停止、临时连接释放、项目关闭和项目配置恢复均参与失败判定；每项仍会在前一项失败后被尝试，首错及嵌套聚合原因保留。
- 清理错误包含稳定标识，禁止作为瞬时故障自动重试。最外层仅恢复一次项目配置，不在错误日志阶段再次尝试并掩盖第一次失败。

代码按取消、源码恢复、项目资源与错误汇总拆入 `e2e/framework-ide/`，避免继续增长原有探针文件。变更仅影响私有验收工具，没有修改 demo 源码、样式输出或 static 基线。

## 验证

`CI=1 pnpm exec vitest run --config e2e/vitest.e2e.config.ts e2e/framework-ide-watch-lifecycle.test.ts e2e/framework-ide-source-cancellation.test.ts e2e/framework-ide-mutation-cancellation.test.ts e2e/framework-ide-project-lifecycle.test.ts e2e/framework-ide-live-page.test.ts e2e/frameworkIdeReopen.test.ts e2e/frameworkIdeStyleHotUpdate.test.ts e2e/frameworkIdeProbeRunner.test.ts e2e/wechat-session-boundary.test.ts --update=none`：9 个文件 42 项通过，随后新增嵌套聚合错误回归，该文件 6 项再次通过，累计 43 项覆盖。延迟任务、写入和连接均由可控 promise 构造，不依赖设备或实际 IDE。

共享轮询同时运行 `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-regression.unit.test.ts --update=none`：116 项通过。定向 TypeScript 检查包含依赖图既有诊断，因此另外通过相同严格编译选项、相同依赖与 `e192ed3d3` 原文进行诊断差分：基线 256 项、当前 255 项、没有新增诊断；补全 `CliOptions` 默认字段去除其中 1 项。这不表示全仓类型检查通过。

## 适用边界

本轮未执行浏览器或设备验收。已发出的底层 IDE IPC 不能被本地信号撤回；保证的是本地任务不会因迟到结果继续发起调用或写入源码。后续真实 IDE 和全面测试由主流程重新预检后验证。

## 规则评估

不新增 AGENTS 条目。现有失败停止、源码恢复、资源归属和微信登录保护约束已经覆盖本场景，通过持久回归落实取消与清理边界。
