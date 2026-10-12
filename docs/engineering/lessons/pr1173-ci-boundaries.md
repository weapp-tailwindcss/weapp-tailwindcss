---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1173
baseline: 73d1e6c46f5ce20f07d17cae4c6c8739e2bab14b
regressions:
  - scripts/agents/verification.test.mjs
  - packages/weapp-tailwindcss/test/ci/lockfile.test.ts
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
  - scripts/ci/demo-matrix/browser-hydration.test.mjs
  - scripts/ci/demo-matrix/browser-readiness.test.mjs
verification:
  - claim: 旧记录兼容、证据字段校验和只读检查回归通过，57 项
    kind: unit
    status: passed
    sha: 73d1e6c46f5ce20f07d17cae4c6c8739e2bab14b
    environment: macOS，Node 24.18.0，pnpm 12.9.1，基线加本次未提交的代码和回归
    command: CI=1 pnpm agents:test --update=none
  - claim: 锁文件语义选择与当前 CI 工作流契约回归通过，53 项
    kind: unit
    status: passed
    sha: 73d1e6c46f5ce20f07d17cae4c6c8739e2bab14b
    environment: macOS，Node 24.18.0，pnpm 12.9.1，基线加本次未提交的代码和回归
    command: CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/lockfile.test.ts test/ci/workflows.test.ts --update=none
  - claim: 真实 Vue hydration、文档切换、开发连接及现有浏览器和报告门禁回归通过，27 项
    kind: integration
    status: passed
    sha: 73d1e6c46f5ce20f07d17cae4c6c8739e2bab14b
    environment: macOS，Node 24.18.0，pnpm 12.9.1，headless Chromium，基线加本次未提交的代码和回归
    command: CI=1 pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/browser.test.mjs scripts/ci/demo-matrix/browser-connection.test.mjs scripts/ci/demo-matrix/browser-navigation.test.mjs scripts/ci/demo-matrix/browser-readiness.test.mjs scripts/ci/demo-matrix/browser-hydration.test.mjs scripts/ci/demo-matrix/matrix.test.mjs --update=none
  - claim: uni-app SSR 生产基线、四轮保存和最终刷新通过
    kind: integration
    status: passed
    sha: 73d1e6c46f5ce20f07d17cae4c6c8739e2bab14b
    environment: macOS，Node 24.18.0，pnpm 12.9.1，uni-app 5.26 vue3，基线加本次未提交的代码和回归
    command: CI=1 pnpm e2e:demo:matrix uni-app-vite-tailwindcss-v4:h5:ssr
---

# PR #1173 在当前 main 上的 CI 边界重整

## 症状

原分支混合了证据流程、pnpm 12 适配和 watcher 修复。其中原生 pnpm 入口、版本契约、Rollup 升级已经由后续 PR 合入 main，但三项缺口仍在：复盘检查器忽略 `verification`，工作流测试固定读取锁文件第二个 YAML 文档，SSR runner 可能在 Vue 客户端挂载前开始保存。

SSR HTML、页面 load 和 Vite 开发连接就绪都不能证明延后导入的客户端组件已挂载。恢复旧分支的完整浏览器文件还会丢失 main 后续增加的文档身份与 HMR 就绪检查。

## 根因与纠正

只迁移三项负责模块及回归。证据字段保持可选，兼容现有复盘，非法记录定位到文件和记录序号；校验器不执行命令、不联网，也不证明结论真实性。锁文件按对象类型的 `settings`、`importers` 识别唯一项目文档，拒绝错误 YAML、重复项目段和缺失项目段。

仅 uni-app `h5:ssr` 开启 Vue 挂载检查。检查接在现有 load 之后，最终文档版本、成功响应、模块队列、连接身份和 HMR idle 复核之前；保持后台 Chromium 与现有导航恢复边界。

真实 Vue 回归使用手动释放动态导入的门控，先观察未挂载状态，再触发 hydration；不以固定等待证明成功。另在挂载状态的异步检查返回前切换到 HTTP 200、404 文档，确认旧组件结果不能放行新文档。

## 验证

main 负对照中，证据回归 37 项失败，原锁文件文档选择逻辑 3 项失败；SSR 等待用例在门控释放前返回，1 项失败，而默认不等待的用例通过。修复后上述定向验证共 137 项通过，0 失败、0 跳过。

独立工作树使用 manifest 的 Node/pnpm 版本完成定向冻结安装。实际 demo 首次启动缺少共享 Vue 编译依赖；补齐后因尚未构建主包退出，再完成主包构建后发现 demo 的 merge 运行时产物也需准备。这些失败均发生在浏览器验收前，不能作为 hydration 结论。随后按完整 demo workspace 依赖先安装再构建：`CI=1 pnpm --filter '@weapp-tailwindcss-demo/uni-app-vite-tailwindcss-v4^...' run build`，构建通过。

实际 SSR 的 production、initial、replace、add、restore、refresh 六阶段通过，生产结果与既有 static 基线一致。没有修改 demo、样式输出用例或 static 基线，运行后确认源码恢复。定向脚本 ESLint、`pnpm agents:check`、`git diff --check` 通过。

原始负对照、安装准备失败及成功日志保存在忽略目录 `.tmp/pr1173-restructure/`，SSR 成功报告位于该目录的 `ssr-verified/report.json`。verification 中的 SHA 为准备本次改动的基线，环境字段明确包含待提交代码；不宣称未修改的基线已通过新增回归。本说明文档在验证之后添加。

## 适用边界

本轮只验证上述 CI 工具边界及 macOS 的 uni-app SSR 流程，未运行全仓、Windows/Linux 原机、HBuilderX 或设备验收，也未等待远端 CI。公开 API、Tailwind 生成链路、发布流程和依赖版本均没有变更；旧 pnpm、repoctl 与 Rollup 补丁不重新带入。

## 规则评估

不新增 AGENTS 规则。只在已有工程流程定义可选证据结构及其只读边界，用实际校验器和回归保障该约定；根规则继续指向现有权威流程。
