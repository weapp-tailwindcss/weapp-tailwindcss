---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 8e097fef4e04857b255f22398e4b56a87899752b
regressions:
  - packages/hbuilderx-runner/test/process-lifecycle.test.ts
  - e2e/hbuilderx-alias-consumers.test.ts
---

# Harmony 取消请求与项目别名释放的异步边界

## 症状

在提交 `8e097fef4e04857b255f22398e4b56a87899752b` 的真实 HBuilderX `5.31.2026093020-alpha` 验证中，`uni-app-x-vdom-tailwindcss-v4` 的 Harmony 热更新失败，IDE 转入 native 构建。父任务返回后，Hvigor 仍报告通过本轮 alias 写入 `symbolMap.map` 失败；事后检查该 alias 已不存在。

首轮证据目录为 `e2e/.artifacts/uni-app-x-alpha/harmony-vdom-diagnostic-8e097fef4/uni-app-x-vdom-tailwindcss-v4-harmony/`，包含 `hbuilderx.log`、`initial/` 与 `hot-update/` 的页面结构和截图。关联构建日志位于 `demo/uni-app-x-vdom-tailwindcss-v4/unpackage/dist/dev/app-harmony/.hvigor/outputs/build-logs/build.log`。以下时间均为 2026-10-03，UTC+08:00。

| 时间 | 已观察事实 |
| --- | --- |
| 20:45:30.113 | `hbuilderx.log:691` 输出“热更新失败”。 |
| 20:45:30.126 | `hbuilderx.log:692` 输出“开始构建鸿蒙工程”。 |
| 20:45:30.417 | 日志开始显示制作运行包 `.hap`。 |
| 20:45:30.913 | CLI 最后带时间戳的输出；末尾只有“(CTRL + C)中止命令已发出，请等待响应”。 |
| 约 20:45:31 | 父任务返回并执行现有项目关闭、alias 清理流程；没有单独记录 unlink 的精确时间。 |
| 20:45:37.655 | 事后只读检查中，真实输出目录 `entry/build/default/intermediates/loader_out/default/ets` 的 mtime。 |
| 20:45:37.714 | `build.log:2`、`:8`、`:64` 记录输出符号表创建失败与 `BUILD FAILED in 6 s 920 ms`。错误路径仍包含本轮 alias。 |

错误文本为 `Failed to create or open the output symbol table file .../symbolMap.map during symbol table initialization`。本轮 alias 名称为 `uni-app-x-vdom-tailwindcss-v4-dd93f02d22-1821-6bd6a6e9-33fa-486d-93c3-191d7afbf374`。事后 `lstat` 检查该 alias 返回 `ENOENT`，真实输出目录仍存在。

这些事实支持“后台构建未结束时 alias 已被释放”的判断，但缺少 unlink 精确时间与原生文件操作追踪。错误本身也列出路径、权限或占用等可能原因，因此不能将该错误唯一归因为删除 alias，更不能把它当作首次热更新失败的根因。

## 根因与纠正

此次确认的是取消与资源释放之间缺少完成屏障，外部问题尚未修复。仓库基线的 `e2e/hbuilderx-local/runner.ts:780` 依次执行 CLI `stop('SIGINT')`、恢复源码、`project close` 和 alias 清理。`scripts/hbuilderx-project-lifecycle.ts:9` 仅要求关闭命令成功，随后删除 alias。`packages/hbuilderx-runner/src/process/termination.ts:112` 确认的是本次创建的 CLI 进程组结束，不包含由共享 IDE 插件持有的 native 构建任务。

下面位置均相对于该版本 HBuilderX 安装目录。两个打包文件均只有一行，使用零起始字符偏移和代码锚点定位；升级后必须重新核对，不能把偏移当作稳定接口。

| 文件与位置 | 代码与含义 |
| --- | --- |
| `plugins/uniapp-extension/out/index.js:1`，偏移 766833，Harmony 专用 `z` 入口 | 创建 `HarmonyRunLauncher`；取消回调为 `t.onCancellationRequested(()=>{c.stop(),e(!1)})`，调用停止后立即完成 CLI 请求，没有等待停止。 |
| 同文件，偏移 786827，Harmony `async stop()` | 先 `await super.stop()`，再调用 `await launcher.stopRun({uuid})`；基类编译器退出、停止日志与 CLI 通知不能证明后续 native 停止完成。此处还捕获并忽略异常。 |
| `plugins/launcher/out/main.js:1`，偏移 1325344，导出的 `async function _e(e)` | 内部调用 `getHLauncherByUDIDEx(n).stopRun(e)` 没有 `await`，随后停止日志并移除 launcher 注册。外层 Promise 完成仍不能证明内层完成。 |
| 同文件，偏移 1156730，Harmony `async pushResource(...)` | quickFix 失败后继续执行 `await this.m_childStopper.stop(); ... await this.buildHap(!0)`；此段没有取消状态检查。extension 的 `pushResources` Promise 又未被纳入停止等待集合，取消与 fallback 可以并发。 |
| 同文件，偏移 1312544，`async stopHvigorDaemon(e)` | 执行 `hvigorw --stop-daemon` 后返回 `true`，未检查 `exeSpawn` 返回的成功状态；也没有提供与本轮 session 绑定的完成证明。 |

因此，`project close` 成功、CLI 退出、停止日志、会话 `STOPPED` 或 launcher 注册消失，都不能单独当作 IDE 已空闲的证明。此次只读审计没有找到能够确认本轮 Harmony session 的全部构建已结束且不再派生任务的公开接口。

按项目路径搜索 PID 也不足以补上这个边界：`uniapp-extension/out/index.js:1` 偏移 26790 的 compiler argv 是插件脚本及平台参数，项目身份主要通过偏移 29754 的 `UNI_INPUT_DIR` 环境变量传入；偏移 55608 的 cwd 又按项目类型选择项目目录或共享编译插件目录。`launcher/out/main.js:1` 偏移 1145386 的 Hvigor argv 为通用 `assembleHap ... --daemon`，项目仅由 `cwd: V` 指定。准确的子进程句柄由 IDE 内部 `exeSpawn` 和 `ProcessStopper` 持有。只读 cwd、环境或 PID 快照可以辅助归因单个活进程，不能证明任务集合完整；即使当前已知 PID 全退出，也无法排除未取消的 fallback 随后再启动构建。

此前[项目清理复盘](hbuilderx-project-cleanup.md)和[alias 消费者复盘](hbuilderx-alias-consumers.md)验证了关闭失败时保留 alias、异常聚合和资源归属。这些结论继续成立，但“关闭成功后删除 alias”的充分性没有覆盖共享 IDE 内仍在运行的 Harmony native 任务，本记录补充这一限制。

## 验证

此次调查只读取首轮日志、文件状态和已安装插件代码，没有重跑设备、调用 HBuilderX、终止进程或修改插件。本文提交只修改文档，`pnpm agents:check` 与 `git diff --check` 通过，不把既有 mock 回归或静态代码阅读写成外部问题已修复。

frontmatter 中列出的现有持久回归分别覆盖受管 CLI 进程生命周期与 alias 消费者的关闭失败行为；它们没有模拟共享 IDE 的独立 native 任务，不构成 IDE idle 的验证。本次不修改这些测试、实现、清理门槛或 static 基线。

后续真实验证需要同时记录取消请求、CLI 退出、该 session 的 native 任务完成、源码恢复、项目关闭和 alias 释放时间。应先证明不存在“取消确认后仍派生 fallback”的情况，再验证 alias 释放；当前证据不足时不得通过重复运行直到偶然通过来补足。

## 适用边界

当前应停止重复执行同一路径的 Harmony fallback 诊断，将其作为已知外部未解决边界交付。不能用固定延时、强杀共享 IDE、全局 daemon 停止或按进程名称批量清理替代完成屏障，也不能仅延长 CLI 等待来声称安全。

若后续运行明确观察到停止或 idle 状态未知，应保留该次 alias、原始源码字节与 hash、host/session 身份和日志等恢复资料，报告清理阻塞并保留原始验收错误、CLI stop 错误的聚合。该处置用于保护已证实的异常现场，不应扩展为所有 App 一律返回未知或永久失败。本文没有实施这项处置；历史本轮 alias 已被清理，不能据本文声称它仍可恢复。

继续实施前，需要官方按 session 提供可靠的停止完成屏障：停止接收新任务，等待编译器、watch、native 构建和未完成的更新任务结束，阻止迟到 fallback，再传播真实成功或失败。另一条待验证路线是真正隔离的测试项目与任务所有权方案，使仍在运行的 IDE 任务拥有独立且持续存在的源码和输出；指向原项目的符号链接 alias 本身不构成这种隔离。两条路线都需先验证生命周期契约，再重新预检执行真实设备回归。

## 规则评估

不新增或放宽 AGENTS 规则。现有资源所有权、清理失败不得放行和本轮证据要求足以表达约束；当前缺口在外部取消协议及其完成信号。没有可靠接口前不加入假定成功的停止逻辑，不把文档记录当作修复完成。
