---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: a763888caff3c66d59fe6bcc391c1fbf45093af5
regressions:
  - packages/weapp-tailwindcss/test/ci/local-worker-workflow.test.ts
  - website/scripts/local-worker/launch-gate.test.ts
  - website/scripts/local-worker/launch-gate-options.test.ts
  - website/scripts/local-worker/command.test.ts
  - website/scripts/local-worker/process-lifecycle.test.ts
  - website/scripts/local-worker/windows-lifecycle.test.ts
---

# 本地 CLI 的启动身份必须先于业务执行

## 症状

PR #1316 的本地完整验收在提交 `a763888caff3c66d59fe6bcc391c1fbf45093af5` 上完成根构建 71/71，但 `website/scripts/local-worker/command.test.ts` 的真实 Playwright 首错回归失败。实际命令按预期退出 1，生命周期却报告“启动身份未确认：根进程已退出或首次采集缺失”，覆盖了原本的命令退出结果。

首次身份采集是异步操作，快速 CLI 可以在结果到达前结束。这不是上轮宿主高负载造成的探针超时，不能靠增大超时、接受空身份表或反复重跑解决。

## 根因与纠正

原流程先启动业务，再登记根进程身份，并把“已经确认身份后自然退出”和“从未确认启动身份”合并为失败。后者仍必须失败：空表不能证明未登记的独立后代已经退出，历史 PID/PGID 也不能用于重新领取清理归属。

网站本地命令作用域现在为已知的 Node CLI 建立启动握手。在原 Node 进程中前置加载极小的 CJS preload，等待首次身份采集确认后再放行业务。握手使用私有临时目录与原子目录创建；保留原 PID、命令参数、标准流、cwd、退出码和信号，不引入另一层命令代理。首次身份不足、探针错误、取消或截止时间耗尽时不放行。非 Node 命令继续使用原有严格协议。

preload 在用户 preload 和 main 执行前恢复原 `NODE_OPTIONS`，删除私有握手环境，防止 Playwright worker 和后代 Node 再次等待。默认值、父环境和显式空字符串保持原 runner 的优先级；路径引用遵守 Node 的选项解析规则，不能把 JSON 字符串转义等同于 Node 参数引用。

命令与已登记后代先完成有界清理，再关闭身份观察器并释放握手目录；任一清理失败仍执行剩余清理并保留错误。已经确认出生身份后发生的自然退出不会撤销启动证据。原有 PID 复用、未知后代、Windows 观察器和清理失败边界保持有效。

真实 Playwright `--list` 还暴露了加载链差异：它会将被测脚本依赖按 CJS 转换，单纯改为 `.mts` 仍不足以保护 `import.meta`。最终以两行 CJS 资源定位桥使用 `__dirname` 和 `node:path.join` 定位 preload，供 Playwright CJS 与 tsx ESM 共用，不依赖启动工作目录。

## 验证

原失败来自完整验收 `7b7d6991-e8b6-4251-80f8-807c5569a11f`，原始日志、内存和清理回执归档在 `.tmp/framework-isolation/local-acceptance/7b7d6991-e8b6-4251-80f8-807c5569a11f/`。该轮 10991 项单测通过、1 项失败，后续质量、static、watch、IDE 与设备阶段未执行；失败后立即释放共同测试窗口。

新增回归用受控的首次身份采集和真实 preload ready/main 标记证明执行顺序，覆盖成功、失败、取消、探针错误、超期、环境恢复、路径引用和后代清理。原真实 Playwright 首错、零重试与不调度后续用例的断言完整保留；原先允许“启动身份未确认”提前返回的后代回归改为必须核对真实退出与清理结果。

实现提交 `43222c72d798c1c254ed8b8975fc73792e4d99dd` 的 6 文件、60 项定向测试、website `tsc --noEmit`、9 个修改文件 ESLint、diff 与 commitlint 全部通过；独立只读审查无阻断项。主工作树整合提交 `8d8403397b57f28c9ebbd819848a00849da22e72` 再次执行下列定向命令（实际调用额外使用 `--config.verifyDepsBeforeRun=false` 关闭共享依赖的自动安装），60 项全部通过（macOS、Node 24.18.0、pnpm 12.14.0，`CI=1`）：

```sh
pnpm --filter @weapp-tailwindcss/website exec vitest run scripts/local-worker/launch-gate.test.ts scripts/local-worker/launch-gate-options.test.ts scripts/local-worker/process-lifecycle.test.ts scripts/local-worker/windows-lifecycle.test.ts scripts/local-worker/command.test.ts scripts/local-worker/server.test.ts --update=none --maxWorkers=1
```

真实 Playwright local/default `--list` 和首错退出回归均通过；测试内部故意产生的 `expect(false).toBe(true)` 是验证首错调度的输入，不是 Vitest 失败。`pnpm agents:check` 检查 68 条规则、387 份文档、1066 个命令，0 错误。真实 Windows 执行仍由本次新提交的 CI 验证；本机模拟平台与参数用例不能替代 Windows runner。


最后的覆盖核对发现，既有 PR Gate 全量单测只运行在 Ubuntu，原 Windows job 不包含网站脚本，所以此前 CI 全绿不能证明新握手在 Windows 上通过。整合提交 `51a7e5c8b343aa90d27667ea2e6c3b52cc7b657c` 复用平台工具矩阵，在 Windows Node 22/24、Ubuntu/macOS Node 24 执行完整六文件；显式 Bash `pipefail` 保留真实退出码，始终上传各系统与 Node 版本的日志、JSON。原 required 汇总继续要求该 job 成功，网站代码单独变更也会触发。

新增工作流契约及既有 scope、取消、release trigger 回归共 5 文件、72 项，在实现工作树和主工作树均通过；命令为 `pnpm --filter weapp-tailwindcss exec vitest run test/ci/local-worker-workflow.test.ts test/ci/workflows.test.ts test/ci/workflow-gate-cancellation.test.ts test/ci/release-trigger-workflow.test.ts test/ci/pr-scope.test.ts --update=none --maxWorkers=1`。YAML 与测试 ESLint、diff 和独立审查通过。这些结构回归保证入口与失败传播存在，真实跨平台执行结果仍须等待新 head 的 CI，不能以静态检查替代。

## 适用边界

握手仅用于网站脚本实际使用的 `process.execPath` Node CLI，不把任意系统命令变成通用受管进程协议，也不改变共享编译核心、HBuilderX runner 或框架插件。未登记且已经失去活身份锚的独立后代仍不在可确认范围内，不用本次修复扩大清理权限。

本记录在新提交的 CI 和本地完整验收完成前保持 `partial`。定向回归通过不能替代后续真实设备验收。

## 规则评估

不新增 AGENTS 规则。已有进程归属、跨平台、回归和清理要求足以约束本次修复；以持久行为测试保护启动顺序与加载链，避免把机器时序经验写成宽泛规则。
