---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: eda194ed02f56a6849fe6f5fe4c773cb21ec4524
regressions:
  - scripts/ci/demo-matrix/weapp-vite-engine-compat.test.mjs
  - scripts/ci/demo-matrix/weapp-vite-runtime-contract.test.mjs
  - e2e/dev-startup-matrix.test.ts
---

# weapp-vite 升级后的补丁与运行时身份

## 症状

[本轮 CI](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37039410438) 的 portable demo 枚举在导入 `statefulHmrCommonjs.mjs` 时失败，Linux 开发启动报 `INVALID_OPTION`：DevEngine 的 `experimental.devMode` 只支持 ESM，但收到 CJS。两项均在本地定向复现；首次本地启动还因新 worktree 未构建核心包而失败，补齐依赖构建后才复现与 CI 相同的格式错误。

## 根因与纠正

基线升级将框架切换为 weapp-vite 7.4.0，但 `patchedDependencies` 仍只登记 7.3.0。旧兼容模块未进入新安装，实际适配器也恢复为不受支持的 CJS 输入。此外，7.4.0 自身解析 Rolldown 1.2.11，Vite 的 DevEngine 则解析 1.2.12；运行时源码和引擎身份不一致。1.2.12 内联 `__exportAll`，旧契约只检查独立 helper 文件，又会将有效运行时误判为缺失。

迁移补丁到精确的 7.4.0 发布包，原生引擎使用 ESM，在同一产物图的最后一个 `renderChunk` 阶段转换为宿主 CJS。保留 7.4.0 的 sourcemap 选项，返回 Babel 映射供 bundler 合成；运行时契约同时检查源码和独立 helper，缺少必要类或 helper 仍失败。局部 `weapp-vite>rolldown` 覆盖固定为 1.2.12，tsdown 的独立版本不变。

迁移内容与持久回归逐文件核对了仓库已有提交 `f59baa4277fa0ac4cd7456042e0b76f1b096728c`，未纳入其其他改动。[上游修复](https://github.com/weapp-vite/weapp-vite/commit/44136980377f30d4eb354ae90b3e64f33eebde8f) 已包含相同输出与运行时边界，但查询时 npm latest 仍为 7.4.0。

重新解析锁文件时，pnpm 顺带更新了根 automator、Web Vite 和浏览器数据版本。仅保留两个框架消费项目、补丁登记、局部覆盖及 13 个必要 peer snapshot；所有新节点与原节点的差异仅为补丁身份和 Rolldown peer。独立遍历 84 个 importer、6,674 个节点没有缺失边，其余 package 元数据、catalog、同名 snapshot 和根 automator 1.2.22 保持原值。

## 验证

- 修复前：引擎兼容套件因缺少补丁模块无法收集；新增运行时回归三项中两项失败；单项目启动复现同一 `INVALID_OPTION`。
- `CI=1 pnpm --filter weapp-tailwindcss... run build`：目标及依赖的 12 个包构建通过。
- `CI=1 pnpm install --frozen-lockfile --offline`：锁文件直接使用，不再解析；复用 13 个缓存包，零下载。
- `CI=1 pnpm test:demo:matrix weapp-vite-engine-compat.test.mjs weapp-vite-runtime-contract.test.mjs version-contract.test.mjs`：三文件、24 项通过，使用脚本内的 `--update=none`。覆盖真实拆包执行、动态导入、live exports、POSIX/Windows/相对 chunk 名称、源码映射回溯、引擎身份和真实运行时契约。
- `CI=1 E2E_DEV_STARTUP_CASE=weapp-vite-tailwindcss-v4 pnpm e2e:dev:smoke --update=none`：两项通过。
- `CI=1 pnpm e2e:demo:matrix weapp-vite-tailwindcss-v4:weapp`：production、initial、replace、add、restore 全部通过。生产语义与既有 static 基线一致，没有更新快照；日志确认 `stateful-experimental`，首次修改等待开发服务就绪，三次修改在同一个进程验证。源码由 finally 恢复，测试服务已停止。
- 原始产物与日志保留在本 worktree 的 `e2e/.artifacts/demo-matrix/weapp-vite-tailwindcss-v4-weapp/`；新增回归与配置的 ESLint 通过。
- 收尾发现框架留下资产监听租约及 `project.private.config.json` 的 `watchOptions`。核对租约原文与测试前提交一致、当前配置与租约安装值一致后，恢复本轮配置并删除该租约；未操作账号存储。这是本轮人工收尾，不能声称框架已自动清理该租约。

该残留随后独立复现并修复，根因、自动恢复证据及补丁移除条件见[开发服务退出的资源归属复盘](weapp-vite-shutdown-ownership.md)。

## 适用边界

本次是 macOS 上的框架产物、启动与监听回归，不代表 Windows/Linux 重验、IDE 页面、真实设备或性能门禁通过。完整扩展矩阵仍受本轮全端预检阻塞，不能以这些定向结果放行。

补丁仅用于本仓库冻结安装，不随 weapp-tailwindcss 发布包交付。包含上述上游提交的正式版本发布后，升级并通过兼容、运行时、源码映射、真实启动及 HMR 回归，再删除临时补丁和锁文件登记，重新评估局部 Rolldown override。

## 规则评估

不新增 AGENTS 规则。新增安装版本与补丁登记的持久回归，复用既有关于精确补丁、构建图、源码映射和升级后验证的边界；不以修改宿主模块格式或跳过失败用例恢复绿灯。
