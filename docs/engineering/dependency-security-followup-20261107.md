# 2026-11-07 传递依赖安全补丁

基线为 `main` 的 `305d5418e6ae3e409572ce819cc6e8092323b845`。本次是[全仓依赖评估](dependency-upgrade-20261107.md)之后的小范围修补，原 inventory 的固定 refs 和结论不变。

## 成对审计事实

2026-11-07 08:43–08:44 UTC 对升级前 `a73127455ed42f766a5d0bb3399e3f2bfec11984` 与当前基线重新采样 pnpm 的 `audit --json`。根项目原始 advisory 条目为 **372 → 210**：critical **42 → 7**、high **157 → 87**、moderate **140 → 96**、low **33 → 20**。两次退出码均为 1，说明仍存在风险；这些数值尚未包含本次三个 override 的效果。

本轮原件及身份差异保存在集成工作树的 `.tmp/dependency-audit-pair-20261107/`：`before/root.stdout.json`、`after/root.stdout.json`、`paired-diff.json`、`advisory-disposition.tsv` 和带 SHA256 的 `artifact-manifest.json`。这是新的成对采样，不是复用历史同名计数，也不能据此宣称安全审计全部通过。

## 范围与安全依据

只添加三个带父包精确版本的 override，不改变其它消费者的配套版本。

| 消费路径 | 原解析 | 修补版本 | 安全依据 |
| --- | --- | --- | --- |
| `website > @icebreakers/deploy > cos-nodejs-sdk-v5 > request@2.88.2 > form-data` | `2.3.3` | `2.5.6` | [boundary 随机性](https://github.com/advisories/GHSA-fjxv-7rqg-78g4)、[字段名及文件名 CRLF 注入](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx) |
| `oxfmt@0.35.0 > tinypool` | `2.1.0` | `2.1.2` | [worker 选项继承](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3)、[run 选项继承](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) |
| `@docusaurus/core@3.10.2 > tinypool` | `1.1.1` | `2.1.2` | 同上；跨主版本兼容边界见下文 |

已有 `tinypool@2.2.0` 保留，`form-data@3.0.5` / `4.0.6` 保留。没有使用全局 override。

## 兼容性核对

- **form-data**：[官方 `2.5.6` 元数据](https://registry.npmjs.org/form-data/2.5.6)仍声明 Node `>= 0.12`、CommonJS 入口和 `FormData` 构造函数。`request@2.88.2` 使用的 `append`、`on('error')`、`getHeaders`、异步 `getLength`、`pipe` 均保留。`request` 声明的 `~2.3.2` 不能自动获得安全回补，因此需显式 override。`2.5.4` 将 boundary 改为 `crypto.randomBytes(12)`；[`2.5.6` 修补](https://github.com/form-data/form-data/commit/b62031603c2d7c329b2a369b49466790f0ba6314)把字段名和文件名的 CR、LF、双引号分别编码为 `%0D`、`%0A`、`%22`，是本次预期的安全行为变化。
- **Tinypool**：[`2.0.0` 的唯一主版本破坏项](https://github.com/tinylibs/tinypool/releases/tag/v2.0.0)是移除 Node 18。`2.1.2` 声明 `^20.0.0 || >=22.0.0`，仓库现有 Node engines 已满足。`1.1.1` / `2.1.2` 的 ESM default 入口、构造、`run`、`destroy` 与 worker 回收调用保留；`oxfmt` 已使用 2.x。
- **Docusaurus 私有协议**：除公开 API 外，已逐项核对官方 tarball 的 `dist/index.js` 与 `dist/entry/worker.js`。两版均传递 `workerData: [tinypoolPrivateData, options.workerData]`，worker 入口均先写入 `process.__tinypool_state__.workerId`，再加载消费者 handler。因此 `@docusaurus/core` 的 `workerData?.[1]?.params` 和 `process.__tinypool_state__.workerId` 形状及初始化时序保留。加载 CommonJS worker 的 `getHandler` 实现也逐字节相同（SHA256 `ac4e5e0ab782dc88fdc03fd83df4c6a4f12d20b517ecaa4d546c1ad9c94b931e`）。实际 worker 的协议回归通过，真实多线程 SSG build 单独记录。
- **安全边界**：[`2.1.1` 修补](https://github.com/tinylibs/tinypool/pull/134/files)使用无原型内部选项，避免继承 `env` / `execArgv`；[`2.1.2` 修补](https://github.com/tinylibs/tinypool/pull/135/files)进一步在构造、`run`、`recycleWorkers` 边界移除继承选项。正常自有选项继续生效。

退出条件：相关上游消费者正式版本自行声明安全依赖后，逐项移除对应 override，并重新核对实际解析版本及运行回归。

## 本次已完成的验证

- 在独立工作树使用 Node `24.22.1`、pnpm `12.18.0` 执行 `pnpm install --lockfile-only --ignore-scripts`，退出码 0；未创建 `node_modules`。
- 锁文件仅由 pnpm 生成。文本 diff 限于三个 override、对应版本/完整性记录、消费者解析边及 `form-data@2.5.6` 所需的已有安全依赖，没有其它版本漂移。
- 安装解析仍提示既有 peer 和 deprecated 问题；本次锁生成不构成 peer 问题消除或运行验收证明。

## 集成运行验收

集成工作树使用 Node `24.22.1`、pnpm `12.18.0`，依赖目录独立；新根锁 SHA256 为 `a72ba40a91d33b097f421de1b99cd5f6461864eabc3e3912cb19eb362e3b959a`。

- `pnpm install --frozen-lockfile` 成功，锁未改写。通过 `request`、`oxfmt` 和 `@docusaurus/core` 的真实模块路径核对解析版本，未依赖根目录的同名包替代消费者。
- `node .tmp/security-followup-smoke.mjs` 成功。从 `request` 实际解析的 `form-data` 构造 multipart：固定 `Math.random` 后 boundary 仍不同；loopback HTTP 往返覆盖字符串、Buffer、文件流、headers、异步 length 和 pipe，报文长度及内容正确；字段名及文件名的 CRLF 未成为独立头部。
- 同一 smoke 从 oxfmt 和 Docusaurus 实际解析的 Tinypool 执行普通 worker，覆盖 `worker_threads` / `child_process` 共四组。正常参数、结果、销毁通过；thread 模式的 `workerData[1].params` 与 `workerId` 协议正确。局部原型上的继承 `env` marker 未进入 worker，`run` 的继承 `filename` / `name` 未覆盖正常 handler；未修改全局原型或使用可执行 payload。
- `pnpm --filter @weapp-tailwindcss/website build` 成功，两个 locale 均生成静态站点。另用临时配置开启 `future.faster.ssgWorkerThreads` 及它要求的 `future.v4.removeLegacyPostBuildHeadAttribute`，配合 `DOCUSAURUS_SSG_WORKER_THREAD_COUNT=2`、`DOCUSAURUS_PERF_LOGGER=true` 执行 `pnpm --filter @weapp-tailwindcss/website exec docusaurus build --config <临时配置>`，成功完成两个 locale；日志记录 `Create SSG thread pool - 2 threads` 和 worker 1/2 的真实渲染任务。原网站配置未改变。注意源码注释中的 `DOCUSAURUS_SSG_WORKER_THREADS` 并非 3.10.2 实际读取的变量。
- `pnpm release status` 成功，仍只有 Tailwind 的既有中文 intent；本次未新增公共包 intent。
- 修改文件的定向 ESLint（含 `--no-ignore`）、`git diff --check` / staged diff 检查均成功；`pnpm agents:check` 为 71 份规则、466 份文档、1,268 个命令入口、0 错误。

2026-11-07 09:19 UTC 对新锁执行根 pnpm 的 `audit --json`（exit 1），原始条目 **210 → 206**，去重 GHSA+包名 **207 → 203**，新增 0。四个目标 advisory 全部消失，严重度为 low 20、moderate 96、high 86、critical 4。原件、准确 cwd/时间/锁哈希及运行日志在 `.tmp/dependency-security-followup/`，不能将本次有限修补写成安全全通过。

| 剩余 critical | 消费边界 | 后续条件 |
| --- | --- | --- |
| `swiper@11.1.15`，GHSA-hmx5-qpq5-p643 | Taro H5 组件内部配套；修补要求 12.1.2+ | 等上游配套升级，或单独完成 Swiper 12 组件 API、CSS 和 H5 行为迁移 |
| `tar@6.2.1`，GHSA-23hp-3jrh-7fpw | Expo CLI / cacache；修补要求 7.5.19+ | 随兼容的 Expo/RN 工具链迁移，不能以全局 major override 代替验证 |
| `decompress@4.2.1`，GHSA-mp2f-45pm-3cg9 / GHSA-hrh2-vp3x-79xf | Taro CLI 的 download-git-repo / download | 上游尚无 patched version，需替换下载解压链路或等待框架修复 |

## Release 验收的轮询边界修复

`305d5418` 的 main Release 在 13,186 项测试通过后，唯一失败是基准的回滚生命周期用例：真实磁盘写入可能耗尽 100ms 预算，旧 `waitFor` 直接跳过首次产物和进程探针，误报 timeout，遗漏后续收尾阶段的进程退出证据。

轮询现至少观察一次当前状态，再用单调时钟决定是否继续等待；每次 sleep 受剩余预算限制。未延长原 timeout 或放宽退出断言。新增确定性回归把写入耗时推进 200ms，旧实现重现同一失败，新实现保留 shutdown / probe 退出原因和日志；另覆盖零/负预算、探针抛错、探针耗尽预算、系统日期跳变及剩余等待上限。

集成验证：`CI=1 pnpm exec vitest run --project=version-compare --coverage.enabled=false --update=none`，53 个文件、397 项测试通过。此为定向单测，不替代仍受本轮预检限制的本地全端验收。

不运行可能委托 Prettier 的 `oxfmt` 格式化命令。本次只修改私有构建/部署工具链的传递依赖锁定，不修改公共包的直接依赖或脚手架输出，因此不新增 changeset。
