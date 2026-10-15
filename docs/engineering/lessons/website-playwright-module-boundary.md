---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 14bd2ee5d186586b6359caa2ca374db37e996b38
regressions:
  - website/scripts/local-worker/command.test.ts
---

# 网站 Playwright 配置的真实模块边界

## 症状

本地扩展验收在网站三浏览器阶段启动即失败：`SyntaxError: Cannot use 'import.meta' outside a module`。此前全仓 Vitest 与网站类型检查均通过。

## 根因与纠正

网站没有声明整个包为 ESM。Playwright 按 CommonJS 加载 `.ts` 配置，局部配置却依赖 `import.meta.url`。原有测试通过 Vitest 导入配置，由 Vite 完成转换，没有经过实际消费者的模块加载路径。

根配置和本地配置统一使用 `.mts`，共享配置也显式导入该 ESM 文件。同步本地命令和类型检查入口，避免改变整个 Docusaurus 包的模块类型。网站为 `noEmit` 工程，允许显式 TypeScript 扩展名导入。

回归通过独立 Node 子进程执行真实 Playwright CLI：分别检查默认配置自动发现和本地显式配置的 `--list --reporter=json`，要求无加载错误、存在用例和完整的 Chromium、Firefox、WebKit 项目。

## 验证

macOS、Node 24.18.0、pnpm 12.9.1、Playwright 1.64.1，基线上叠加本次未提交修复：

- 修复前新回归复现相同语法错误；修复后 `pnpm exec vitest run --project=@weapp-tailwindcss/website website/scripts/local-worker/command.test.ts --update=none` 的 7 项测试通过。
- `pnpm --filter @weapp-tailwindcss/website typecheck` 通过。
- `pnpm --filter @weapp-tailwindcss/website e2e:local` 已加载全部 2361 项用例并进入真实浏览器。随后英文 LLM 资源的独立内容断言失败，主动停止该定向运行；该结果只证明配置加载已恢复，不代表网站或完整矩阵通过。

首次完整流程、定向失败和截图保存在本轮忽略的 `e2e/.artifacts/` 与任务日志中；完整验收需重新预检后运行。

## 适用边界

修复只涉及网站私有测试入口，不改变公开包行为，不生成 change intent，不更新视觉基线。其他操作系统尚未实测；跨平台使用 Node、`node:path` 与 Playwright 官方配置发现，不依赖 shell 后缀执行。

## 规则评估

不新增 AGENTS。用持久回归补齐真实 CLI 消费边界，沿用既有环境预检、禁止自动更新快照和失败即停止后续阶段的规则。
