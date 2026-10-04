---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 7bd913cb2b2294b4ec0c270f7d7cc72ffc3fe855
regressions:
  - packages/weapp-tailwindcss/test/native-resolve.test.ts
  - packages/weapp-tailwindcss/test/native-distribution.test.ts
---

# 原生平台包必须进入同一发布图

## 症状

原生 scaffold 可以在开发工作树运行 WXML binding，但主包 tarball 不包含 `native/bindings`。只验证本地 `.node` 可加载，不能证明用户安装后能使用原生内核，也不能证明 Windows、GNU 与 musl 产物可运行。

## 根因与纠正

新增八个 `packages-native/*` 可选平台包，每个平台携带 JS/WXML 与 CSS 两套 binding。消费者通过明确的包入口加载，平台包没有安装脚本。解析不到可选包时可尝试本地开发产物；已解析到 binary 后发生执行错误不能被另一个开发产物掩盖。

平台包版本跟随主包固定组，PostCSS 保留独立版本。即使只改 CSS 内核，也必须为平台固定组添加 change intent；PostCSS 与主包打包时依赖平台包的精确版本。发布工作流保留 Node 24、OIDC 与 provenance，通过 repoctl 编排发布。

复用的 native workflow 在八个实际目标环境执行 Rust test/clippy/build，再用 Node 24 和 22.18.0 执行真实 ABI 与 tarball 验证。GNU 在 glibc 2.28 镜像编译；musl 在 Alpine 编译。Release 与 Release Gate 只下载本 workflow run 的产物，核对两个内核的源摘要、版本与 SHA-256 后进入既有发布流程。

## 验证

本地 Node 24.18.0、pnpm 12.6.0、macOS arm64：

- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/native-resolve.test.ts test/native-distribution.test.ts --update=none --coverage.enabled=false`：21 项通过。
- `CI=1 pnpm --filter weapp-tailwindcss test:native:package`：隔离 tarball 解析、离线可选依赖安装以及 JS/WXML/CSS 真实 Node-API 调用通过。
- `pnpm install --frozen-lockfile --ignore-scripts --offline`：通过。锁文件仅添加八个新 importer 和两个消费者的可选依赖，保留原有第三方依赖版本。
- `actionlint .github/workflows/native.yml .github/workflows/release.yml .github/workflows/release-gate.yml`：通过。
- 定向 ESLint 与 `pnpm agents:check`：通过。

tarball 验证使用主集成工作树构建的 JS/WXML binding，以及 CSS 实现工作树构建的 CSS binding。二者只复制到本任务忽略的 macOS 平台目录用于真实 ABI 验证，没有伪造同提交的完整发布产物集合。完整集成分支必须重新构建和运行平台 CI。

本次核验的 JS/WXML binary SHA-256 为 `c810ac38b4ada2b302e6216edf0a06cefc1b79adea46f6df9dc13683be5b652c`，CSS binary SHA-256 为 `e0b02643567d0413167793eaed25ce81b219aa2e75a69772f1e92a0c146218f1`。这两个 hash 只记录本次本地测试输入，不作为发布 artifact 白名单。

## 适用边界

尚未执行远端八平台矩阵、最低 Node 22.18.0 或实际 npm 发布。新增平台包的首次 trusted publisher 配置需由 npm 包所有者完成。本机 tarball 验证不证明完整消费者构建提速，也不替代全仓或多端验收。

## 规则评估

新增 `packages-native/AGENTS.md`，因为该目录具有独立发布职责；根规则仅增加目录路由，并补全 native scaffold 的规则索引。通过可执行负向回归覆盖缺失平台、binary 篡改、旧源码、libc、版本、导出及 lifecycle scripts，不扩展无关全局规则。
