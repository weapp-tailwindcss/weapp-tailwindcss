---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1268
baseline: c292efbdc5cb0c1260dadec671a2001229d1f6cf
regressions:
  - scripts/ci/demo-matrix/weapp-vite-engine-compat.test.mjs
  - scripts/ci/demo-matrix/weapp-vite-runtime-contract.test.mjs
  - scripts/ci/demo-matrix/endpoint.test.mjs
  - e2e/gulp-build.test.ts
---

# 依赖升级后的 HMR 补丁与开发服务地址

## 症状

PR #1268 的首轮 PR Gate（run `37018172852`）出现三类失败：Linux 开发启动报 `experimental.devMode only supports the esm format`；Ubuntu core smoke 的 Gulp 编译没有完成；macOS 的 `style-injector-taro-vite-react:h5` 在浏览器连接阶段超时。Release Gate（run `37018172873`）也停在 Gulp 构建。

Taro 日志明确记录请求端口 49227 被占用，Vite 继续尝试并实际监听 49230。检查器仍轮询 49227，未进入 HMR 阶段。日志没有说明占用者身份，不能归因为某个残留进程或网络协议。

## 根因与纠正

合并 main `148cebd6ce3584f5b2c930dd63639a0c3a5d47ee`，复用已经落地的 [Gulp ESM 入口修复](gulp-esm-build-entry.md)。原失败日志只能证明任务未完成；ESM/CJS 依赖图错误的详细原因来自该上游修复记录。

weapp-vite 已升级到 7.4.0，临时补丁仍登记在 7.3.0，因而没有应用。重新生成 `patches/weapp-vite@7.4.0.patch`，保持原生 DevEngine 使用 ESM，在 `renderChunk` 转换宿主 CJS，并把 Babel 映射交回 bundler 组合。7.4.0 新增的 sourcemap 配置继续生效。限定 `weapp-vite>rolldown` 为 1.2.12，使框架与 Vite 使用同一原生引擎；tsdown 仍使用自己的 1.2.11。

Rolldown 1.2.12 把公共 helper 内联到 runtime 中，契约校验同时检查 helper 文件和 runtime 源码，仍拒绝真正缺失的 `DevRuntime`、`Module`、`__exportAll`。对应上游修复：[weapp-vite 4413698](https://github.com/weapp-vite/weapp-vite/commit/44136980377f30d4eb354ae90b3e64f33eebde8f)。上游包含这些修复的版本发布后，应升级、重跑相同回归，再删除本补丁及锁文件登记，核实是否仍需 Rolldown override。

开发端口推迟到生产构建结束后分配。catalog 明确声明 Taro bundler；Taro Vite H5 从当前开发子进程的完整 `Local:` 日志行获取监听地址，验证 loopback、无凭据及同源路由后访问，记录请求端口与实际 URL。完整行约束避免将分块日志里的半个端口误判为完整地址。其余构建器继续使用既有端口协议。页面检查仍验证本轮 DOM、CSS 和计算样式，不把 URL 可访问当作验收通过。

## 验证

本轮本地环境：macOS arm64、Node 24.18.0、pnpm 12.6.0。worktree 使用独立 virtual store；`pnpm install --frozen-lockfile --ignore-scripts` 通过。锁文件保留本轮无关依赖的既有解析。

以下 pnpm 命令在本地链接环境中统一设置 `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false`；测试另设 `CI=1`：

- `pnpm --filter '@weapp-tailwindcss-demo/weapp-vite-tailwindcss-v4^...' --filter '@weapp-tailwindcss-demo/taro-vite-react-tailwindcss-v4^...' run build`：16 个依赖包构建通过。
- `pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts --update=none scripts/ci/demo-matrix/weapp-vite-engine-compat.test.mjs scripts/ci/demo-matrix/weapp-vite-runtime-contract.test.mjs scripts/ci/demo-matrix/endpoint.test.mjs`：21 项通过。包含真实 Vite 子进程被占端口后换端口、原占用者与目标服务内容区分、源码映射追踪原始行，以及内联/独立/缺失 runtime helper。
- `pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts --update=none scripts/ci/demo-matrix/matrix.test.mjs scripts/ci/demo-matrix/browser-navigation.test.mjs`：11 项通过。
- `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/gulp-build.test.ts e2e/gulp-tailwindcss-v4.test.ts --update=none`：2 项通过，真实构建及既有 static 基线一致。
- `pnpm e2e:demo:matrix weapp-vite-tailwindcss-v4:weapp style-injector-taro-vite-react:h5`：两项通过，覆盖 production、initial、replace、add、restore；Taro 另覆盖浏览器 refresh。静态基线无差异。证据在 `e2e/.artifacts/demo-matrix/`；自有服务和 headless 浏览器均由 finally 清理，测试探针已恢复。
- 修改脚本的 ESLint（显式关闭 `format/prettier`）及 `git diff --check` 通过。

## 适用边界

本地执行的是受影响构建器和 CI 编排的定向验证，不代表全仓、IDE、真机或全端验收。首轮失败日志保存在忽略目录 `apps/weapp-tailwindcss-promo-video/out/ci-1268/`；当前提交的远端结果另以 GitHub Actions 实际运行状态为准。视频成片未因 CI 工程修复重新渲染。

## 规则评估

沿用第三方补丁版本登记、bundler 生命周期、源码映射、进程归属和有界等待规则，不新增 AGENTS 条目。未跳过检查、放宽样式断言或修改性能阈值；未改变公开包 API，也不新增发布 intent。
