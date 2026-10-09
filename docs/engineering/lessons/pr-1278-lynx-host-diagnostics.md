---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1278
baseline: 09e1f11e5b65f04b1085f3be1cbb6f716a8b36ae
regressions:
  - e2e/lynx-command-host.test.ts
  - e2e/lynx-command-observer.test.ts
  - e2e/lynx-native-command.test.ts
  - e2e/lynx-native-device.test.ts
---

# PR #1278 的 Lynx iOS 重复设备查询超时

## 症状

最新产品与端口回归的三个质量分片均已通过，但 Lynx iOS 在进入编译前再次失败。以下两次失败均为 attempt 1，已保存精确 job JSON、完整日志和上传 artifact：

- `11a0f9150`：run `37888246900` / job `113683027731`，主机 `1000020449`。
- `09e1f11e5`：run `37898415592` / job `113715037103`，主机 `1000020876`。

两次定向 simctl 查询均无输出、30 秒超时，sample 同样超时；镜像均为 `macos-15-arm64 / 20260907.0337.1`。本次系统日志为 macOS `15.7.9 / 24G830`。本次 bootstatus 已于 `07:29:02 UTC` 完成，命令观察器记录原查询于 `07:29:23.574 UTC` 开始；spawn 后 stdout / stderr 均为零字节，约 30.05 秒收到 SIGTERM，exit 与 close 紧邻。sample 于约 10.06 秒开始，约 17.81 秒结束且 timedOut，没有产生调用栈文件。

旧 head 的一次有限重试、`a6d6eb3f9` 的首次运行均成功；这些成功不能消除重复失败，也不能证明根因已修复。本轮没有再次重跑失败 job。

## 根因与纠正

现有证据只定位到设备发现阶段，尚不能区分 xcrun、CoreSimulator 等待与主机资源压力。没有进入 Tailwind、Lynx bundle、Pod 或应用构建；不能将本次失败归因于 CSS 产品代码。

可确认的诊断缺口是：sample 自身超时后，现有 artifact 没有进程状态和资源指标，只有空输出与超时生命周期。现在在原有慢命令采样触发时，并行记录 Node／内核／架构、可用并行度、负载、内存、父进程资源，以及一次 `ps -A -o pid=,ppid=,state=,pcpu=,rss=,comm=`。进程表仅取状态、资源和可执行文件名，不取命令参数或环境变量。结果随同原命令写入 `device-discovery-command.json` 的 `sample.host`。

主机查询与 sample 都使用原命令的取消信号，各自五秒上限、SIGKILL 回收；主机查询失败保留其状态和输出。仅 macOS 的慢命令采样增加该只读查询。没有额外 simctl 查询、预热、等待、重试、服务重启或设备切换；原设备查询仍只执行一次、保留 30 秒预算，失败继续阻断 CI。

## 验证

`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-command-host.test.ts e2e/lynx-command-observer.test.ts e2e/lynx-native-command.test.ts e2e/lynx-native-device.test.ts e2e/lynx-native-artifacts.test.ts e2e/lynx-ios-container.test.ts e2e/lynx-native-options.test.ts e2e/lynx-ci.test.ts --update=none`，8 文件 65 项通过。

新增四项主机诊断测试覆盖进程查询字段、主机及目标身份、非零退出码、忽略 SIGTERM 时的超时与取消回收；现有采样测试增加 macOS 主机证据关联断言。iOS workflow 的准备回归包含新增测试。原命令错误保留、证据写入失败和设备查询不回退仍由既有回归约束。

改动范围的 TypeScript 检查、显式 `--no-ignore` ESLint、agents 和 diff 检查通过。文件列表类型检查使用 `--ignoreConfig`，不将根配置误用于这组独立 Node 脚本；未修改仓库类型配置。

本机实际执行主机诊断及一次只读 `simctl list devices booted --json`，ps 成功，simctl 约 2.50 秒返回 146 字节，未复现超时，也没有 Booted 设备可作相同条件对照。没有创建或启动模拟器。本机为 Darwin `27.0.0 / arm64`、16 个可用处理器，与远端镜像不同，该结果仅验证命令和证据链可运行。

原始证据位于忽略目录 `e2e/.artifacts/issue-1271-production-watch/cicd` 的 `11a0-lynx-ios*`、`09e1-lynx-ios*`；本机命令及验证记录由同级任务目录的 `commands.jsonl` 保存。

## 适用边界

本次只补齐诊断缺口，**尚未修复或证明远端设备查询超时的根因**。需要新 head 的实际执行，失败时检查主机资源、原 PID、CoreSimulator 进程状态和 sample；通过时保留此前两次失败边界，不据单次成功宣称稳定性问题解决。不得提高超时、更换设备矩阵或弱化验收求绿。

本轮未执行本地全面测试，未操作微信 IDE 或其登录态，也没有产生样式输出或 static 基线变化。PR 和四个 Issue 保持开放。

## 规则评估

不新增 AGENTS。诊断预算、字段范围、进程回收和证据归属由持久回归约束；与[查询范围](lynx-ios-device-query-scope.md)及[命令生命周期证据](lynx-device-discovery-command-evidence.md)一起保留待证边界。
