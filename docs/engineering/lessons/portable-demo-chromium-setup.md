---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1288
baseline: bb8a3c5f3d84e6d3154633cc0f64cd2edf74a4a1
regressions:
  - e2e/hosted-workflow-contract.test.ts
verification:
  - claim: Portable Demo Matrix 的浏览器准备有整体上限、条件补装及必需启动检查
    kind: unit
    status: passed
    sha: bb8a3c5f3d84e6d3154633cc0f64cd2edf74a4a1
    environment: macOS，Node 24.18.0，pnpm 12.9.1，Vitest 5.0.3；包含本轮未提交 CI 修复
    command: env CI=1 corepack pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hosted-workflow-contract.test.ts --update=none --coverage.enabled=false
  - claim: 当前 Chromium 二进制可后台启动并执行页面 DOM、JavaScript 与计算样式检查
    kind: integration
    status: passed
    sha: bb8a3c5f3d84e6d3154633cc0f64cd2edf74a4a1
    environment: macOS，Node 24.18.0，pnpm 12.9.1，Playwright 1.63.0，Chromium 153.0.8010.12；包含本轮未提交探针
    command: env CI=1 corepack pnpm exec node scripts/ci/verify-chromium.mjs
  - claim: Ubuntu APT 更新超时使 demo 尚未执行并连带阻断汇总 Gate
    kind: ci
    status: failed
    sha: bb8a3c5f3d84e6d3154633cc0f64cd2edf74a4a1
    environment: GitHub hosted Ubuntu 24.04，Node 24，Playwright 1.63.0
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38236177305/job/114769699899
    reason: 包构建及浏览器缓存恢复成功，但 apt-get update 在 azure.archive.ubuntu.com 停滞至 30 分钟任务上限；测试步骤未执行
---

# Portable Demo Matrix：Chromium 环境准备超时

## 症状

2026-10-12，PR #1288 的 `taro-webpack-vue3-tailwindcss-v4-1`（Ubuntu / Node 24）任务被取消。其他执行任务没有失败或取消，Portable Demo Gate 和 PR Gate 因 `DEMOS_RESULT=cancelled` 连带失败。

异常任务在 11:21:34 UTC 进入 `playwright install --with-deps chromium`。11:22:23 UTC 输出 `Ign:2 http://azure.archive.ubuntu.com/ubuntu noble InRelease` 后停滞，直到 11:50:35 UTC 达到任务上限。没有进入生产构建、dev、HMR 或浏览器测试；上传失败仅因测试未开始而没有证据文件。这不是 #1286 字体声明回归。

## 根因与纠正

浏览器缓存已经精确命中，但 `--with-deps` 每次仍无条件执行 APT 更新。系统依赖准备既没有请求上限，也没有实际可用性判断，因此镜像异常耗尽了整个任务的 30 分钟预算。

将 catalog 与 demo 两入口统一接入 [Chromium 准备 action](../../../.github/actions/setup-chromium/action.yml)：先安装二进制，再真实启动默认 headless Chromium，检查 DOM、JavaScript 和计算样式。可正常运行时无需访问 APT。只有 Linux 初始探针失败才调用官方 `install-deps chromium`；所需包列表仍由 Playwright 管理。

补装在 root 上下文通过 `sudo env APT_CONFIG=...` 传入本轮临时配置，HTTP/HTTPS 请求各有 30 秒上限、最多两次重试，APT 更新任一来源失败即失败。普通用户环境变量不能直接依赖 Playwright 内部的 `sudo` 传递；CLI 从公开 package.json 的 bin 字段解析，避免使用未导出的子路径。临时配置在退出时清理，不修改常驻 APT 配置或镜像地址。

整个 action 保持 5 分钟上限，浏览器下载连接上限为 30 秒。只有初始探针允许失败，最终渲染探针必需；非 Linux 探针失败、Linux 补装失败或最终启动失败均不放行。保留原有任务预算、完整测试和 `if-no-files-found: error`，不把缺证改为跳过。

## 验证

命令从隔离工作树根目录执行，shell 外层使用 `rtk proxy`：

```sh
env CI=1 PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=30000 corepack pnpm exec playwright install chromium
env CI=1 corepack pnpm exec node scripts/ci/verify-chromium.mjs
env CI=1 corepack pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hosted-workflow-contract.test.ts --update=none --coverage.enabled=false
env CI=1 corepack pnpm exec eslint e2e/hosted-workflow-contract.test.ts scripts/ci/verify-chromium.mjs .github/workflows/demo-matrix.yml .github/actions/setup-chromium/action.yml
corepack pnpm agents:check
git diff --check
```

安装与真实后台探针通过，浏览器在 `finally` 关闭；没有使用用户 Chrome 或创建可见页面。7 项工作流契约回归通过，检查两入口的执行顺序、5 分钟上限、Linux 补装条件、APT 请求配置与最终探针不能忽略错误。新增源码和 YAML 通过 ESLint，四个 shell 步骤通过 `bash -n`。Playwright 源码核对确认 root 调用下不会再次切换 sudo，APT 配置会继承到实际 apt-get。

## 适用边界

本地只执行上述定向检查，没有运行全仓/全端验收。macOS 探针成功不能证明 Ubuntu 的缺库补装路径已实跑，也不能换算为新 PR head 的远端 CI 成功；该项以更新后准确 head 的任务结果为准。原失败证据保留，不对旧 head 的整个成功矩阵重复重跑。

## 规则评估

不新增 AGENTS 规则。现有本地优先、真实浏览器证据、任务预算和完整 Gate 约束足够，本次以共享 action 与契约回归固化安装边界。
