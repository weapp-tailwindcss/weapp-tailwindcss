---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1172
baseline: 5ce6db93e80baf1bbaacb6a6fc080ac223c52c15
regressions:
  - packages/hbuilderx-runner/test/discovery.test.ts
  - packages/hbuilderx-runner/test/discovery-windows.test.ts
  - packages/hbuilderx-runner/test/host-connection.test.ts
---

# Windows 进程探测的冷启动依赖与失败证据

## 症状

自动回归 34306912103 的 Windows Node 22 任务 102325400331 在真实中文、逗号、空格和 & 路径进程用例失败。PowerShell 查询超过原有 10 秒期限，spawnSync 返回 ETIMEDOUT；同提交 Windows Node 24 通过。没有原生 IDE 启动参与该用例。

## 根因与纠正

日志只能定位到探测命令超时，无法证明具体内部阶段。查询已按进程名过滤，但使用 ConvertTo-Json 引入 Utility 模块自动加载和模块发现依赖。移除该无关依赖：查询仅使用 PowerShell 语言及 .NET API，显式禁用自动加载，以带首尾标识的 Base64 路径列表传输结果，保留中文、逗号和 UNC 路径。关闭未使用的标准输入，释放 Process 对象；保留原 10 秒期限，没有重试。

错误现在同时保留退出信号、底层错误、查询阶段和最近输出。完整空列表才能表示无实例；截断、非法路径、损坏编码及超时仍然失败，不能据此重新启动用户 IDE。当前属于缩减冷启动依赖并改进诊断，尚不把单次超时的内部根因写成已证实结论。

## 验证

本地执行包内 Vitest、构建和定向 ESLint；真实 Windows 进程用例仍由 Node 22/24 自动矩阵执行。新增截断列表、路径损坏、盘符根目录、相对盘符路径、UNC、BOM、阶段日志与信号回归。macOS 本地通过不替代 Windows 实测。cc6b30f96 的 Windows Node 22/24 真实进程用例分别在 5065/2755 ms 通过，但 host-connection 的另一份 mock 仍返回旧 JSON 协议，导致该 job 失败。本次同步该 fixture，并把信息查询测试改成显式三平台分支；在 macOS 上旧 fixture 的 win32 分支已复现失败，修正后本地完整包测试 58 项通过，2 项平台用例跳过。该遗漏说明依赖 process.platform 的模拟用例不能只运行当前宿主分支。

## 适用边界

这是 runner 的操作系统进程查询，不调用 HBuilderX CLI，不证明 CLI 间歇挂起已修复。后续以当前提交的 Windows 自动检查记录实际结果；如再超时，根据阶段证据继续定位。

## 规则评估

不新增 AGENTS；保留跨平台回归、失败不得等同于空实例的现有边界。
