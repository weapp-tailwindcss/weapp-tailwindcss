---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: 2e3fb6d004ea7af9b663cad00c90f6f0f5538992
regressions:
  - e2e/lynx-ios-report-retention.test.ts
  - e2e/lynx-failure-evidence.test.ts
  - e2e/lynx-evidence.test.ts
---

# Lynx iOS 已收到报告的证据保留

## 症状

[run 40131291877 的首次 Lynx iOS 作业](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40131291877/job/120984233671) 已完成构建、安装、启动和报告等待，随后独立整屏 `simctl screenshot` 超过原 60 秒预算，输出的 `screen.png` 为空。报告已在 runner 内存中返回，但 artifact 没有 `raw-report.json` 和本轮语义裁剪，无法继续分析已经产生的原生证据。

同轮主机诊断记录 3 个 CPU、约 7 GiB 内存、362 以上的 load average 和约 139 MiB 可用内存。进程采样没有提供完整等待栈；这些观察不能证明负载来源，也不能证明截图超时的具体原因。

## 根因与纠正

可复现的证据丢失来自 runner 顺序：收到原生报告后先调用整屏截图，成功后才写报告并校验、收集报告绑定的语义文件。整屏截图失败使后两步没有执行。整屏截图与报告已经包含的语义证据是独立操作，不应控制已收到证据的持久化时机。

现在先保存原始报告字节，再解析报告并通过原 `collectNativeEvidence` 校验本轮身份、清单及文件字节，最后执行原整屏截图。截图仍然必需，保持原设备、参数和 60 秒截止；失败仍抛出原异常。语义文件收集失败立即阻断，不能用整屏截图替代。原失败诊断路径和诊断异常聚合继续保留；runner 此处不写最终成功 `report.json`，后续完整校验仍由原调用方负责。

现有慢命令观察器只在原命令存活超过 10 秒后对其 PID 采样一次；采样和只读 `ps` 各有 5 秒上限并共享取消信号，没有循环查询或重启模拟器服务。该实现检查仍不足以解释首次失败的主机负载，因此不据此调整诊断策略、截图预算或验收标准。

## 验证

在上述 baseline 的独立 worktree 中，新增生命周期回归先对未修改的 runner 执行，6 项全部失败；移动截图调用后相同命令 6 项全部通过：

```sh
CI=1 pnpm --config.verifyDepsBeforeRun=false exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-ios-report-retention.test.ts --update=none
```

回归覆盖整屏截图失败、语义收集失败、报告写入失败、损坏 JSON、截图与独立诊断同时失败以及正常调用顺序。使用真实临时文件、构建目标协调器和失败诊断读写，模拟设备命令及语义收集服务；既有 evidence 回归继续约束实际身份、清单、字节和最终报告校验。

同轮追加 `lynx-ios-build-target`、`lynx-ios-container`、`lynx-failure-evidence`、`lynx-native-artifacts`、`lynx-evidence`、`lynx-native-command`、`lynx-native-failure` 和 `lynx-native-device`，共 9 文件、148 项通过。修改的两个 TypeScript 文件严格 ESLint、`pnpm agents:check` 和 diff 检查通过；没有使用自动修复或更新快照。

另执行 `lynx-command-observer.test.ts` 与 `lynx-command-host.test.ts`，2 文件、10 项通过，覆盖仅采样原 PID、退出后取消和忽略 SIGTERM 的采样/主机查询子进程在原 5 秒预算后被回收。这些回归只证明观察器边界，不证明原生超时的负载成因。

上述 red/green 的源码包含尚未提交的修复，不能把 baseline SHA 当作已含修复的源码。未在本机调用 IDE、模拟器或开展全面验收；准确新 head 的 hosted iOS 执行仍待主任务验证。

## 适用边界

本修复只纠正已收到报告的证据持久化顺序，不宣称解决原 60 秒整屏截图超时。缺失截图仍是失败，诊断目录不能作为原生通过证据。capture-only 分支、demo、样式与 static 基线均未修改；临时文件使用宿主 `node:path` 与 `os.tmpdir()`。

## 规则评估

不新增 AGENTS 规则。现有失败分层、原始证据保留与准确提交验收要求已适用；新增持久回归直接约束收到报告后的顺序和失败传播，完整原生结果仍待验证，故保留 partial。
