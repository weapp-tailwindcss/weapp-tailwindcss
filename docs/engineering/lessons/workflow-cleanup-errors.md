---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: c41bde74bbea9c432239360a1cb7c1613daea0db
regressions:
  - e2e/demo-workflow-quality.test.ts
  - e2e/workflow-cleanup.test.ts
  - e2e/preflight-gate.test.ts
  - e2e/preflight-error-report.test.ts
---

# 全面测试保留首次失败和收尾失败

## 症状

运行 5673670d-8452-409e-b0f2-a72825b6fc48 时，预检服务结束后，quality lint 阶段复查已生成阻断报告；终端最终却只显示 TypeError: fetch failed。阶段名和报告路径被后续 finish 请求失败覆盖。新增编排回归在修复前有六项失败，还暴露了清理失败前提前打印成功、读取空异常的 stepReport 再次抛错的问题。

## 根因与纠正

编排层使用 finally 直接 await gate.close()。finally 的拒绝会覆盖主流程异常，而只打印 Error.stack 也不会展开 AggregateError.errors。

增加共享收尾执行器，记录主流程的成功/失败结果，随后只执行一次清理。单独失败原样抛出；同时失败用 AggregateError 保留两个异常及主因。状态使用显式判别字段，undefined、null、false 等被抛出的值仍是失败。demo 工作流与本地全端报告入口共用此边界，成功消息移到收尾完成之后。

终端通过 Node inspect 展开聚合错误、cause 和各层堆栈，保留循环引用的安全表示。内存报告或门禁阻断报告写入失败时也保留原阶段错误。本地报告入口完成失败报告后显式抛出子进程失败，避免只设置 exitCode 而被收尾层误判为成功。未吞掉 finish 错误，也未添加门禁重试或继续调度。

## 验证

`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/workflow-cleanup.test.ts e2e/preflight-error-report.test.ts e2e/demo-workflow-quality.test.ts e2e/demo-workflow-extended.test.ts e2e/preflight-gate.test.ts --update=none`：五文件、73 项通过，0 失败、0 跳过。首组六项和报告边界追加四项均保留修复前失败证据。

覆盖复查失败零子进程、子进程失败停止后续阶段、报告写入失败、单独清理失败、双重失败、假值异常、成功日志顺序、本地报告入口、嵌套堆栈和循环 cause。门禁回归还通过真实 CLI 子进程确认缺报告不会启动全面测试。修改代码 ESLint 与收尾模块严格 TypeScript 检查通过。

## 适用边界

这是 E2E 编排诊断与生命周期修复，不改变公开包行为、设备选择或登录状态；无需 change intent 或 static 基线更新。底层资源仍由原有清理协议负责，本执行器不进行全局进程清理。

## 规则评估

不新增 AGENTS 规则。用共享执行器和实际入口回归落实原有失败停止、资源归属与原始证据要求。
