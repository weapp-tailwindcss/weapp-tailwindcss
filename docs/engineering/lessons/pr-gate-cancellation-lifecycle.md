---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1278
baseline: b160a008109804710737d1ec8ef4e59d2fabf3d1
regressions:
  - packages/weapp-tailwindcss/test/ci/workflow-gate-cancellation.test.ts
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
---

# PR 汇总门禁的取消生命周期

## 症状

2026-10-09，PR #1278 从 `9f56af85f402f6a4d72b26188e315b24a3f967f1` 更新为合并 main 的 `b160a008109804710737d1ec8ef4e59d2fabf3d1`。新 PR Gate [37887548376](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37887548376) 处于 pending，旧 run [37886583113](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37886583113) 已没有运行中的测试，但仍有 `Portable demos / Portable Demo Gate` 排队，旧 run 因此尚未结束。

旧 run 的 177 个 job 已完成，唯一未完成的汇总 job 为 `113681185682`。旧 Benchmark 与 Release run 已正常结束为 cancelled；问题不是新提交的测试失败，也不应把旧提交成功结果当作新提交的验收。

## 根因与纠正

[Portable Demo Gate](../../../.github/workflows/demo-matrix.yml) 和调用它的 [PR Gate](../../../.github/workflows/pr-gate.yml) 都使用 job 级 `if: always()`。该条件在工作流取消后仍为真，汇总 job 会继续排队。父工作流以 PR 编号作为 concurrency group，旧 run 未完成时，新 run 继续等待该组。

两层汇总 job 改为 `always() && !cancelled()`。依赖失败或跳过时仍会执行原有结果／证据断言；整个工作流被取消时退出，释放过期工作。依赖列表、验收条件、矩阵、超时与失败证据上传步骤保持原有语义。

现场恢复仅对旧 run `37886583113` 调用 GitHub force-cancel API。操作前已确认旧 head、当前 PR head、并发组及可复用工作流关系；新提交的 run 未被取消。旧 run 随后变为 completed/cancelled。该恢复动作只解决当时已创建的旧 job，持久修复由新工作流条件负责。

## 验证

新增[取消生命周期回归](../../../packages/weapp-tailwindcss/test/ci/workflow-gate-cancellation.test.ts)读取实际 YAML job 条件，并分别求值 success、failure、skipped、cancelled 四种状态。两个汇总 job 在依赖失败／跳过时必须运行，取消时必须退出。修复前 8 项中 2 项取消场景失败、6 项通过；修复后全部通过。既有 workflow 契约同步检查新的取消条件。

定向命令从仓库根执行，固定 `CI=1` 和 `--update=none`：

```sh
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/workflow-gate-cancellation.test.ts test/ci/workflows.test.ts test/ci/actions-failure-diagnostics.test.ts --update=none
```

修复后上述 3 个文件共 56 项通过。两份工作流、新增回归与本记录的显式 `--no-ignore` lint、`pnpm agents:check`、`git diff --check` 通过。既有 `workflows.test.ts` 被正常 lint 配置忽略；强制检查时，修改前后均有相同的 63 项历史诊断。本次只同步取消条件断言，未引入新的 lint 诊断。

完整命令、修复前后结果与当前 head 的远端快照位于忽略的 `e2e/.artifacts/issue-1271-production-watch/`，取消现场与 lint 基线对比记录位于其 `cicd/` 子目录。

## 适用边界

本次定向修复两层 PR 汇总门禁；保留测试失败时执行汇总的能力，不降低 CI 门槛。其他工作流按各自生命周期处理。远端最终结果须核对后续 PR head，取消的旧 run 不计为通过。本地条件回归不能代替 GitHub 调度器上再次更新提交的真实验收。

## 规则评估

不新增 AGENTS。现有远端 head、并发组、可复用工作流与依赖核对要求足以约束现场操作，通过工作流条件回归固化取消语义。纯 CI 变更不增加公开包版本 intent，不修改 static 基线。
