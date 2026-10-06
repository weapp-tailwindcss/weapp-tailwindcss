---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 303099fc4dafe0404f6c5fce6db3bfd2a3470b92
regressions:
  - packages/weapp-tailwindcss/test/source-line-limit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-plugin.bundle.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-root-style-ownership.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-import-shell-rebuild.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-build-reuse.integration.test.ts
---

# Vite CSS 入口规划与转换调度的职责边界

## 症状

在基线提交启动的完整扩展回归中，轮次 `7e08a49f-553f-4624-b6bc-7423fb85f913` 第 1 阶段根构建完成 69 个任务、0 个缓存命中；第 2 阶段单测发现 `css-entry-processing.ts` 为 501 个物理行，超过已有 500 行上限。该阶段为 1 项失败、7621 项通过、1 项预期失败和 43 项跳过；后续 44 个阶段没有执行。

首次完整运行证据位于 `e2e/.artifacts/full-regression/7e08a49f-553f-4624-b6bc-7423fb85f913/` 的 `workflow.log`、`memory-report.json` 与 `cleanup.json`。主任务确认本轮采样的 453 个进程均已退出，编排退出码为 1，源码工作区干净；没有将此次中止写成全面验收通过。

## 根因与纠正

同一个入口函数累计承担了两组职责：先决定框架 import shell、源码来源和最终输出归属，再执行产物复用、作用域候选收集、缓存签名、回放与转换调度。近期补充来源归属和 import shell 处理后，职责没有同步拆分，触发现有可维护性门禁。

以 `cssCompositionPlan` 完成、最终 `outputFile` 确定为界，将后半段迁入同目录 `css-entry-transform.ts`。入口文件保留输入归一化、框架壳及来源/输出组合计划，转换模块消费这些已确定的值并调度已有转换器；两者分别为 329 行和 221 行。没有通过删空行、压缩语句或放宽上限处理失败，也没有新增文件系统读写或核心反向依赖。

抽出的转换阶段函数体与基线逐字一致，阶段调用显式传递已经求值的输出、来源及 `applyCssResult` 闭包。已处理产物继续在作用域候选收集前返回；缓存仍包含本轮完整 `rawSource` 的 hash，根样式和分包样式继续豁免普通嵌套样式的根覆盖去重。调用方仍等待该阶段完成。

## 验证

复用已有行数门禁与真实消费者回归，没有添加只验证抽取函数形状的镜像单测：

```bash
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/source-line-limit.test.ts test/bundlers/vite-plugin.bundle.unit.test.ts test/bundlers/vite-root-style-ownership.test.ts test/bundlers/vite-css-marker-ownership.test.ts test/bundlers/vite-import-shell-rebuild.test.ts test/bundlers/vite-build-reuse.integration.test.ts test/bundlers/vite-css-output-imports.test.ts test/bundlers/vite-css-transform-decision-plan.unit.test.ts test/bundlers/vite-scoped-generator-sources.unit.test.ts --update=none
pnpm --filter weapp-tailwindcss build
pnpm architecture:check
pnpm agents:check
```

九个定向文件共 259 项通过，无失败或跳过，包含真实 Vite 客户端/SSR 重复构建、微信及其他小程序样式后缀、来源归属、根 import shell 和增量复用。没有重复执行全仓单元测试；后续完整扩展回归由主任务在整合提交后重新预检执行。

主包构建及声明生成通过，架构检查覆盖 35 个包、1339 个源码文件；ESLint（禁用 Prettier 规则）、规则检查和差异检查均通过。另用 TypeScript Compiler API 读取 `tsconfig.build.json`，显式设置 `noCheck: false`，以拆分前入口和拆分后两个入口分别检查依赖图，基线与当前严格类型诊断均为 0；没有将默认跳过类型检查的声明构建当作严格检查。

## 适用边界

本次是内部职责拆分，既有公开行为、缓存语义和产物结构保持不变，不新增发布 change intent。没有修改 demo、static 基线或 IDE/设备验收条件，没有执行浏览器及设备测试。局部回归不能代表后续 44 个阶段已经通过。

## 规则评估

不新增或放宽 AGENTS 规则。现有按职责拆分和 500 行持久门禁已经发现问题；修复落实模块边界，保留该门禁及既有消费者回归。
