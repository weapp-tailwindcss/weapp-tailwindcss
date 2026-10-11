---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 148cebd6ce3584f5b2c930dd63639a0c3a5d47ee
regressions:
  - e2e/demo-workflow-extended.test.ts
  - e2e/demo-workflow-quality.test.ts
  - e2e/demo-workflow-environment.test.ts
---

# 扩展全面回归的覆盖与环境边界

## 症状

标准本地质量工作流覆盖基础质量检查和 demo 多端，但不包含独立类型、包消费、脚本配置、模板、RN/Lynx 原生和性能门禁。继承局部调试的过滤或跳过变量，还可能让部分测试直接返回而被计为成功。

## 根因与纠正

根 Vitest 依据 workspace 配置发现项目，独立脚本配置和设备入口不在同一个集合。扩展模式将这些入口纳入同一个门禁消费会话，保留逐阶段环境复查和失败停止，不嵌套第二个全面入口。

扩展环境复制当前配置，仅清理明确缩小覆盖、更新基线和复用旧产物的选项；设备与工具链仍由预检绑定覆盖。性能比较要求任务起始提交的完整 SHA，避免分支推进改变基准。

后续覆盖审计发现清理表遗漏了两个消费者开关：`DEMO_VISUAL_STYLE_ISOLATION_VARIANT` 会让 uni-app x 只生成一种样式隔离结果，结果完整性检查无法发现未调度的另一种；`E2E_IDE_REQUIRE_LIVE_PAGE_VISIBILITY=0` 会把要求页面显示本轮标识的 HMR 验证降为产物证据。扩展模式现在删除两项继承配置，恢复消费者默认行为；既有用例级可见性例外仍保持原语义。回归同时检查实际消费者和所有编排子进程，避免仅验证清理表自身。

## 验证

- 修复前，新增编排回归出现 8 个失败，证明扩展参数被忽略、独立套件未运行、过滤配置被继承。
- `pnpm exec cross-env CI=1 vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow-quality.test.ts e2e/demo-workflow-extended.test.ts --update=none`：24 个测试通过。
- `pnpm exec cross-env CI=1 vitest run -c e2e/vitest.e2e.config.ts e2e/e2e-matrix.test.ts --update=none`：34 个测试通过；新工作树先构建 `@weapp-tailwindcss/escape` 以提供矩阵检查依赖。
- 用例验证非法参数与门禁失败均不启动测试、扩展套件覆盖与顺序、固定性能基线、环境继承边界以及失败后的报告和门禁释放。
- 两项遗漏修复前，`e2e/demo-workflow-environment.test.ts` 的三个实际消费者回归和编排环境断言共四项失败，分别显示缺少另一种样式隔离模式、页面可见性仍被禁用、子进程仍继承过滤配置。
- 修复后执行 `pnpm exec cross-env CI=1 vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow-environment.test.ts e2e/demo-workflow-extended.test.ts e2e/demo-workflow-quality.test.ts --update=none`：三文件、27 项通过，零失败、零跳过；改动 TypeScript 的 ESLint 通过。

## 适用边界

以上是编排层的定向回归，不代表真实设备或完整性能矩阵已通过。完整验收必须按多端手册完成本轮 prepare、当前会话 computer use 和 verify，再运行扩展入口。设备验收和后续发现的问题随本任务 PR 保存实际证据。

## 规则评估

不新增 AGENTS 规则。既有全面预检、禁止隐式更新基线和真实设备证据要求已覆盖风险；操作方式更新到多端手册，持续约束由编排回归负责。
