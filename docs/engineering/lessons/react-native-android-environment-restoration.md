---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/commit/e0e7400c91d871e8562cbd57b7cc8a46aca97215
baseline: e0e7400c91d871e8562cbd57b7cc8a46aca97215
regressions:
  - e2e/react-native-android-environment.test.ts
  - e2e/react-native-android-environment-entry.test.ts
  - e2e/workflow-cleanup.test.ts
  - e2e/react-native-runtime-artifacts.test.ts
---

# RN Android 环境准备与恢复属于同一事务

## 症状

RN Android 入口在进入 try 前建立 reporter、8081 两个 reverse 映射，改写三个全局设置并清空 logcat。任一步准备失败都会跳过原收尾。即使原生验证结束，原收尾也只移除端口，没有恢复设置，并可能被更早的收尾失败截断。

入口回归在原排查基线复现：第二个设置准备报错后，`hide_error_dialogs` 仍为 `1`，原值为 `0`。本轮首次失败日志为 `e2e/.artifacts/rn-environment-regression/red.log`；这份日志是设置值断言失败，不是模块导入失败。

## 根因与纠正

把端口与设置准备提取成绑定设备的事务，准备前读取原状态。`settings list global` 只提取 `hide_error_dialogs`、`anr_show_background`、`show_first_crash_dialog`，区分缺失、字面值 `null` 和含 `=` 的原值，不保存无关设置。默认执行器对 Android shell 参数引用，原值中的空格、单引号、美元和反引号不会成为远端命令。

已有目标 reverse 映射直接阻断；创建使用 `--no-rebind`。恢复只处理本轮成功创建的映射，保留其它端口。若创建命令失败后出现映射，无法证明归属，保留现场并将收尾判为失败；运行期间 remote 改变时也不删除。该边界优先保护未知归属资源，不把不明确的创建结果写成恢复成功。

设置已符合目标值时不写。恢复前再次读取当前值：等于原值则无需再写，等于本轮目标值才恢复；第三方改值或删除则保留并报错。原来缺失的设置用 delete 恢复。恢复后独立读回，命令返回成功但值不一致仍失败。恢复重复调用复用同一结果，各资源失败不截断其余收尾。

报告服务的异步 listen 错误会拒绝 ready；ready 与事务构造都在收尾保护区内。文件、进程、报告服务及环境恢复均独立尝试；使用共享 `runWithCleanup` 保留首次错误、聚合收尾错误，最后仍发布本轮产物。logcat 不再清空，失败采集用准备时读取的设备时间限制本轮日志。

每轮独立生成 `e2e/.artifacts/react-native-android/android-environment.json`，包含设备、三个设置与两个端口的原状态、变更状态、恢复读回、错误和 logcat 时间边界。回执存在本身不是恢复通过，需审查整体及各资源的 cleanup/readback/errors。

## 验证

Node 24.18.0、任务 Corepack pnpm 12.9.1，冻结锁文件安装。在修复工作树执行：

`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-android-environment.test.ts e2e/react-native-android-environment-entry.test.ts e2e/workflow-cleanup.test.ts e2e/react-native-runtime-artifacts.test.ts e2e/react-native-android-device.test.ts e2e/react-native-android-window.test.ts --update=none`：六文件、41 项通过，零失败、零跳过。

覆盖准备中途失败、写入后传输异常、执行异常、恢复错误与首次错误聚合、恢复读回不一致、未设置与特殊原值、已有目标端口、端口竞争、第三方设置变更/删除、其它端口保护、重复恢复、报告服务绑定与关闭失败。ADB 与报告服务均为受控模拟，未调用真实设备。代码 ESLint、新事务及单测的严格 TypeScript 检查、`pnpm agents:check` 与 `git diff --check` 通过；入口依赖图仍有原基线的严格类型诊断，未据此声称全仓类型通过。

证据目录为 `e2e/.artifacts/rn-environment-regression/`，日志仅证明相应定向回归。真实 Android 的回执读回、原生运行、HMR、截图和完整扩展验收仍需主流程在新预检后执行，本复盘保留 partial。

## 适用边界

只调整本地 RN 验收的环境生命周期，不改变公开包、demo、样式输出和 static 基线，不需要包 change intent。没有启动浏览器、IDE、模拟器或真实 ADB 操作。Windows/macOS/Linux 宿主均继续使用 execa argv；单引号语义仅用于明确的 Android 远端 shell。

## 规则评估

不新增 AGENTS 规则。通过入口级故障回归、归属核对和独立回执落实已有的本轮证据、首次失败及资源收尾要求。
