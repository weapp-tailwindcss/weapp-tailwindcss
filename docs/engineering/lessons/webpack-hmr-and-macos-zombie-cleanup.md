---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1275
baseline: c0235c34d6f1acd659ab378e527a2ac25ef6ab66
regressions:
  - scripts/ci/demo-matrix/webpack-hmr.test.mjs
  - scripts/ci/demo-matrix/process-group-signal.test.mjs
  - scripts/ci/demo-matrix/process-stop.test.mjs
---

# Webpack 热更新竞态与 macOS 僵尸进程组收尾

## 症状

PR #1275 的 [PR Gate run 37725638756](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37725638756) 有两个独立失败：

- [macOS Node 24 Taro 分包任务](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37725638756/job/113145122330) 的 H5 浏览器停在 ready，归档日志包含 `apply() is only allowed in ready status (state: prepare)`。
- [macOS Node 22 weapp-vite 任务](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37725638756/job/113145129249) 已完成首编译及 replace/add/restore，但在 stop 收尾时报告 `kill EPERM`。

不能把前者归为普通浏览器等待超时，也不能把后者归为源码热更新失败。

## 根因与纠正

Webpack 5.105.4 的 [only-dev-server 实现](https://github.com/webpack/webpack/blob/v5.105.4/hot/only-dev-server.js) 先 `hot.check()`，再在 Promise 回调中 `hot.apply(options)`。进入 ready 后若有新的异步 chunk 加载，runtime 会回到 prepare，外部 apply 调用因此拒绝。真实 Webpack watch 编译与 headless 浏览器回归在 ready 回调中加载 chunk，补丁前稳定复现相同错误、旧值和 ready 状态。

[补丁](../../../patches/webpack@5.105.4.patch) 把原有 apply 选项交给 `hot.check(options)`，让 runtime 等待 blocking promises 后内部应用，保留 ignore 选项、错误回调和继续检查更新的逻辑。没有放宽 idle gate、超时或引入页面刷新兜底。锁文件只新增此版本的 patch 身份，保留原来的依赖版本与 peer 图。

macOS 向仅剩僵尸成员的进程组发送信号会返回 EPERM。真实回归使父进程暂时不能 reap 子进程，验证 Z 状态和该错误。收尾仍只操作已捕获的本任务进程组；EPERM 后检查 PGID/状态，仅组已空或全是僵尸时允许完成。有活成员、状态不明或 ps 失败时继续失败，不能一概吞掉权限错误。ESRCH 和 Windows 的 taskkill 路径保持原有行为。

## 验证

- `pnpm install --frozen-lockfile --ignore-scripts` 通过；`CI=1 pnpm build:ci` 的 32 个包构建通过。
- `CI=1 pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/webpack-hmr.test.mjs scripts/ci/demo-matrix/process-group-signal.test.mjs scripts/ci/demo-matrix/process-stop.test.mjs scripts/ci/demo-matrix/browser.test.mjs scripts/ci/demo-matrix/process-diagnostic.test.mjs --update=none`：5 个文件、24 项通过，包括真实 Webpack、macOS 僵尸组和进程树停止回归，无跳过。
- `CI=1 pnpm e2e:demo:matrix subpackage-taro-webpack-react-tailwindcss-v4:h5 weapp-vite-tailwindcss-v4:weapp --update` 重新生成这两个目标的 static 基线，无语义 diff；随后去掉 `--update` 执行，production/initial/replace/add/restore 与收尾均通过，H5 刷新和计算样式验证通过。
- 定向 ESLint（`--no-ignore`）、`pnpm agents:check` 和 `git diff --check` 通过。

## 适用边界

本地证据来自 macOS Node 24；远端 Node 22、Windows 和 Linux 的新提交检查仍需 CI 验证，旧 head 的成功不能代替。未执行本地全仓/全端验收、IDE/设备操作或 npm 发布。

同一 PR 按用户要求将 repoctl 继续升级到 5.8.1，发布相关四文件 85 项回归通过，详情见[发布摘要记录](./native-release-note-visibility.md)。Git whitespace 检查仅对 `patches/*.patch` 允许合法的空白上下文前缀，其他源码检查保持原样。

这是仓库开发依赖与验收运行器的修复，不触发公开包版本提升。Webpack patch 仅随本仓库冻结安装生效；上游发布等价修复后，须先运行真实回归，再移除补丁、workspace 登记和锁文件身份。进程清理不扫描名称或强杀未知进程，活进程权限错误继续作为失败报告。

## 规则评估

不新增 AGENTS。现有根因复现、任务进程归属、依赖 patch 生命周期和静态基线要求已覆盖此类问题，新增持久回归与领域说明即可。
