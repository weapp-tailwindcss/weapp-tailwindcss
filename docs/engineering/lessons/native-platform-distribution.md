---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 7bd913cb2b2294b4ec0c270f7d7cc72ffc3fe855
regressions:
  - packages/weapp-tailwindcss/test/native-resolve.test.ts
  - packages/weapp-tailwindcss/test/native-distribution.test.ts
  - packages/weapp-tailwindcss/test/native-release.test.ts
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
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

后续发布边界审计发现：PostCSS 支持 Node 20.19.0，而共享平台包最初复制了 core 更高的 engines 下限。平台包现覆盖两个消费者的范围，新增范围包含关系回归；CI 的八个平台再增加独立 CSS Node 20.19.0 tarball/离线安装/ABI 验证。本地用 SHA-256 验证后的官方 Node 20.19.0 darwin arm64 二进制运行 `native/test/package.mjs --css-only`，真实 CSS ABI 与离线安装通过；core 的 Node 要求没有降低。新增回归后 distribution 定向测试 11 项通过。

进一步核对 repoctl 5.5.7 的实际编排发现，预发布顺序为 `beforeVersion → verify → pnpm version -r → afterVersion → commit → beforePublish → publish`。工作流原先在版本修改前构建并验证 native artifact，随后预发布修改 manifest，却没有更新 artifact metadata，导致新版本 tarball 携带旧版本元数据。稳定版准备流程会在 Release PR 再次构建，因此不能据此推断预发布也安全。

修复将版本迁移放进 repoctl hooks：`beforeVersion` 核验两个内核、八个平台及下载/暂存副本，保存忽略目录内的完整已验证元数据；`afterVersion` 重新核验源码摘要、target、suffix、binary hash、旧元数据和新平台 manifest 的一致性，全部通过后只更新版本字段。它拒绝缺少前置证据、源码变化、binary 或元数据篡改；成功后消费前置证据。`beforePublish` 再执行默认的完整版本校验，避免将允许旧版本的迁移校验用于普通发布。

本次基于 `403fd3ccb585ac2bb6b1b3020b713f4abdae6a5f` 验证：

- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/native-release.test.ts test/native-distribution.test.ts test/ci/workflows.test.ts --update=none --coverage.enabled=false`：3 文件、74 项通过。用真实 repoctl 函数与模拟进程边界验证预发布调用顺序，不调用真实发布、Git 写入或 registry。
- 回归覆盖仅修改版本、缺失或已消费证据、两套 binary、副本和源摘要篡改，以及最后一个目标失败时尚未重写前面目标的元数据。
- 修正 `release:verify` 的工作流测试断言，保留新增的 native artifact 验证入口。
- 新增/修改的脚本、配置与分发测试通过 ESLint（测试显式 `--no-ignore`）；被仓库默认忽略的既有 `workflows.test.ts` 强制检查仍有 62 项历史格式诊断，基线与修改后数量一致，本次新增 hook 断言没有新增诊断。

官方 runner 清单确认 `macos-latest` 为 ARM64，`macos-15-intel` 为 x64，`windows-11-arm` 与 `ubuntu-24.04-arm` 均存在。该静态核验不等同于已执行八平台矩阵。

## 适用边界

尚未执行远端八平台矩阵、最低 Node 22.18.0 或实际 npm 发布。新增平台包的首次 trusted publisher 配置需由 npm 包所有者完成。本机 tarball 验证不证明完整消费者构建提速，也不替代全仓或多端验收。

## 规则评估

新增 `packages-native/AGENTS.md`，因为该目录具有独立发布职责；根规则仅增加目录路由，并补全 native scaffold 的规则索引。通过可执行负向回归覆盖缺失平台、binary 篡改、旧源码、libc、版本、导出及 lifecycle scripts，不扩展无关全局规则。
