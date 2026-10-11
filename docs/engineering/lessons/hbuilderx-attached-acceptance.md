---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1170
baseline: 2f7318b022c5ea2ff00750ff6121e44b6a275e1d
regressions:
  - e2e/hbuilderx-attach.test.ts
  - e2e/issue-hbuilderx-attach.test.ts
---

# 原生 IDE 启动与 Web HMR 验收分离

## 症状

Windows 官方 CLI 在未加载 Tailwind 的最小项目中仍有间歇挂起，导致每次 PR 原生检查重复失败。用户明确选择原生 CI 仅手动触发，并使用 IDE 点击运行后的连接验收。

## 根因与纠正

此前 Web HMR 验收器拥有服务启动、停止与项目关闭职责，无法复用用户已经启动的原生编译服务。现在通过内部 WebServerSession 分离服务所有权与浏览器断言，连接模式只检查身份和读取日志；源码写入由持久账本管理，失败后只恢复本轮拥有的字节。服务启动时冻结 runId 和 instanceId，拒绝旧服务及中途实例更换。

这不是 CLI 挂起修复。三系统自动回归继续运行；两套原生工作流仅手动触发，仍保留失败判定和证据。既有 PR 自动跟进任务已同步新范围，不再自动重跑或反复报告已知原生挂起。

## 验证

- 定向 portable 回归：`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hbuilderx-attach.test.ts e2e/issue-1144-runner.test.ts e2e/hbuilderx-project-alias.test.ts --update=none`，33 项通过，其中新增 18 项涵盖实际 Vite/Chromium 保存与刷新、外部服务存活、身份/日志反例、期限与源码恢复。合成日志只验证验收器，不作为 IDE 证据。
- `pnpm --filter weapp-tailwindcss... run build` 通过。
- `CI=1 E2E_ISSUE_1170_STATIC=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1170-web.test.ts e2e/issue-1144-static.test.ts --update=all` 单独生成基线，再将末尾参数改为 `--update=none` 复验；3 项生产样式检查通过，2 项原生 Web 用例明确跳过，基线内容无变化。
- actionlint 对修改工作流通过；仅排除原有自托管标签 hbuilderx/android 的未知标签提示。`pnpm agents:check` 通过。

macOS 初次尝试：Alpha 5.25.2026082902-alpha 实际点击「运行到浏览器 → Chrome」：#1170 LF 初始加载、9 次保存及刷新浏览器断言完成；本轮未能导出完整控制台日志，整体验收按缺失日志失败，源码自动恢复，IDE 服务仍存活后由操作者点击停止。此前另一次准备在导入 IDE 项目期间超时，也成功恢复。不能把这两次失败写成完整连接模式通过。

真实 GUI 控制台没有 CLI 专有的 `HBuilderX Version:` 行，纠正了此前合成日志掩盖的契约错误：连接模式记录实际 `HX_Version` 元数据并标注独立来源；CLI 模式保留原版本行断言。原生编译器日志兼容括号和空白差异，仍严格校验版本及 VDOM。

后续 `6f2d368f5` 实测：macOS Alpha 的 #1170 LF 已完整通过，runId 为 `b4d0d88b-bda2-44f8-bb45-d839dc5279c4`，包括初次加载、9 次保存、刷新、完整 IDE 日志与真实版本校验。日志通过原生控制台可访问文本取得，没有用 CLI 输出补写；该实例返回的 `HX_Version` 为 `5.25.2026082902-alpha`。其后 CRLF 浏览器断言完成，但未及时取得完整日志而失败，源码恢复成功。后续结果见下表，完整两轮矩阵仍待完成。

macOS Alpha 首轮最终结果：

| 场景 | 本轮标识 | 结果 |
| --- | --- | --- |
| #1170 LF | b4d0d88b-bda2-44f8-bb45-d839dc5279c4 | 完整通过，9 次保存及刷新 |
| #1170 CRLF | e2793249-efad-4d6e-9308-b130f4ce04bd | 独立复验完整通过，9 次保存及刷新 |
| #1144 Options | 5089b5e1-6e74-49a7-a45a-17f317e8403f | 完整通过，16 次保存及刷新 |
| #1144 setup | b1be047d-4519-47f6-a09a-a8cb3dfb678d | 完整通过，16 次保存及刷新 |

每项原始证据位于 `e2e/.artifacts/hbuilderx-attach/<channel>-<case>-<标识>/`，日志来自原生控制台的可访问文本原样保存，记录了 `HX_Version`、编译器、VDOM 和起止标识。LF 在 `6f2d368f5`，其余三项在 `7b50dcb58` 执行，二者被测产品和连接代码相同，后者仅新增 watcher 夹具与报告变更。第二轮 LF 因 GUI 未启动新服务而等待超时、源码恢复；stable 两轮、alpha 完整第二轮及 Windows 交互验收尚未完成，不能声称计划矩阵已全通过。

该提交的 portable 六个系统/Node 组合全部成功，Windows 原生 job 为 skipped，self-hosted 原生工作流未由 PR 触发。完整 PR 其它自动任务仍继续跟进。

## 适用边界

入口和步骤见[本地多端手册](../../../e2e/LOCAL-MULTI-PLATFORM-E2E.md)。Windows 交互桌面的连接验收尚待取得；本机合成服务、portable 和历史原生证据不能代替新增模式的实际验收。必须区分样式修复、runner 跨平台修复与原生 CLI 挂起。

## 规则评估

不新增 AGENTS 规则。使用已有源码归属、同进程 HMR、static 基线与真实平台证据要求；原生触发范围依据本次用户明确选择调整。
