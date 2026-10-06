---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 7829a74a8f5150b77c86fddea3ba5b8b38721de2
regressions:
  - e2e/demo-workflow-signal-result.test.ts
  - e2e/demo-workflow-process-identity.test.ts
  - e2e/demo-workflow-capture-flight.test.ts
  - e2e/demo-workflow-windows-cleanup.test.ts
  - e2e/demo-workflow-native-cancellation.test.ts
---

# 进程自然退出与终止请求回执

## 症状

扩展验收 `4af4383e-9897-4079-a365-bfcdfdfc2a05` 第 29 阶段发生 weapp-vite 微信运行时错误，随后阶段清理报告 `本轮已确认身份的进程通过 SIGTERM 终止`。历史报告只保存信号种类，没有保存发送对象，无法从记录准确还原被操作的 PID。

最后一条内存样本时间为 2026-10-04T08:09:04.705Z，包含 pnpm 包装进程、Vitest 主进程 74887、worker 75071 和 esbuild 75033；样本仅保存 RSS 排名前 8 的进程，不含启动时间身份，因此不能用它证明 SIGTERM 的目标。原始日志位于 `e2e/.artifacts/preflight/4af4383e-9897-4079-a365-bfcdfdfc2a05/full-regression-run.log`，内存报告位于 `e2e/.artifacts/demo-e2e-memory/demo-e2e-memory-report.json`。

## 根因与纠正

只读审查发现一个可独立复现的报告缺陷：代码先把 SIGTERM 加入成功终止记录，再调用 `process.kill`。已核对的目标可能在两步之间自然退出，导致调用抛出 ESRCH。原实现忽略 ESRCH，却没有撤销提前写入的记录，即使后续空树和 close 都已确认，仍然误报强制终止。

发送记录改为在 POSIX `process.kill` 或 Windows `taskkill` 成功返回后生成。每条记录包含 PID、已核对的启动时间及实际机制；进程表不可用时仅针对本次 spawn 本体的回退明确标记启动时间未采集，不制造身份数据。Windows 记录 `taskkill /pid /f`，不把它描述成 POSIX 信号。

正常空树后的错误和最终有界清理失败均包含成功发送对象。措辞使用“已发送终止请求”，不以系统调用成功推断具体死亡原因。ESRCH 不生成成功记录，但仍必须等待有效空表与 close；非 ESRCH 错误原样保留，真实成功发送请求仍使阶段失败。归属判断、再次身份核对、截止时间和清理范围均未改变。

## 验证

- 修复前新增的 6 个模拟用例中 5 项失败、1 项通过，稳定证明 ESRCH 虚报、失败请求误记以及成功请求缺少对象身份。日志保留在独立工作树 `.tmp/signal-result-before.log`。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow-signal-result.test.ts e2e/demo-workflow-process-identity.test.ts e2e/demo-workflow-capture-flight.test.ts e2e/demo-workflow-windows-cleanup.test.ts --update=none`：4 个文件、19 项通过。新增用例覆盖 ESRCH 后空树、仍存活、close 未完成、复查失败、EPERM、成功请求、最终超时和 PID 复用。
- 上述回归使用模拟进程表及发送方法，没有向真实系统进程发信号。合作取消回归的断言同步为新的终止请求文字，继续要求正常恢复不包含强制发送记录。
- 本次只修复测试进程管理与诊断，不改变 demo 样式产物，不更新 static 基线。

### 子集扫描接入后的回归修正

后续进程采样优化增加 `readProcessSubset`，但信号测试 fixture 只替换了 `readProcessTable`。停止阶段因此进入真实子集扫描，而测试命令 mock 没有返回 stdout，首次偏离为 `parsePosixProcesses` 对 undefined 调用 `split`，掩盖了要验证的信号与身份错误。修正同时替换两种扫描入口，并将最终复查失败与 PID 复用注入子集扫描；不修改生产清理行为或错误预期。

基于 `797dab1c89056a64284d54bc89bfe8e69ca02ec1` 的定向回归为 8 个文件、43 项通过；随后预检 `11b7b590-6cdd-4788-ac32-82bb337b897d` 的完整扩展流程中 static 阶段 182 个文件、1324 项通过（另有 14 个文件、36 项按既定条件跳过），包括全部 10 个信号结果用例。该轮后来在第 27 阶段的模板截图几何校验失败，不能将本条定向修正描述为完整扩展验收通过。

## 适用边界

确定的是源码报告缺陷，不能据此断言历史 `4af4383e` 遭遇了 ESRCH，也不能把该轮失败改判为通过。首次微信运行时错误与具体遗留进程原因仍需各自证据；此次新增身份记录用于后续精确归因。

## 规则评估

不新增 AGENTS 条目。已有归属、清理与错误保留边界足够，通过可复现测试及成功请求审计改进证据质量。
