# 独立诊断产品准备

准备模块只处理 `watch`、`taro`、`runtime` 固定目标，源码 repo 用作只读 driver 与 Git 来源。`run.mjs` 在准备完成后调用对应独立工作负载，不提供正式预算验收。

CI 显式选择 `source_diagnostics`，并提供独立的 `baseline_ref`、`current_ref` 完整产品 SHA；工作流 SHA 只表示 driver。Node 固定 22.23.4，先用不依赖安装的 `run.mjs --initialize` 建立工件，再冻结安装 driver。原正式 scope/check 不运行且不会被同名诊断满足；任何首败、收尾失败或缺证均非零退出，`always()` 上传本轮已有证据。

```js
const prepared = await prepareSourceDiagnostics({
  sourceRepository: driverRoot,
  driverCommit: exactDriverHead,
  products: [
    { role: 'base', sourceCommit: exactBaseSha },
    { role: 'current', sourceCommit: exactCurrentSha },
  ],
  kind: 'runtime',
  outputDirectory: newExternalDirectory,
  evidenceDirectory: newUploadEvidenceDirectory,
  pnpmEntry: actualPnpmEntry,
})
```

`pnpmEntry` 兼容旧参数 `pnpmNodeEntry`，默认读取 `npm_execpath`。Node `.js/.cjs/.mjs` 入口通过当前 Node 执行；已 realpath 的 native executable 直接派生。两者均 `shell:false`，并逐侧核对 `pnpm --version` 与精确 packageManager。包管理器固定 128 MiB 上限，使用 64 KiB descriptor 流式哈希，不进入 RSS 的 product 关键输入清单。Node 必须满足每侧 engines。

输出目录必须不存在且位于 sourceRepository 外，父目录已存在。布局为 `products/{base,current}`、`archives/{role}.tar`、`evidence/driver/**`、`evidence/roles/{role}/**` 和 `evidence/preparation.json`。可显式提供独立 `evidenceDirectory`，使安装/构建日志直接写入 CI 上传目录；它不能与产品准备目录重叠。仅上传返回的 evidenceDirectory；不上传产品、node_modules 或巨大 tar。归档 path/hash 和完整 archive/source manifests 留作独立复核。

每侧来源先验证完整 40 位 SHA、commit/tree 和 `ls-tree`（仅 SHA1）；Git 全程禁用 replace refs。通过 `git archive` 导出，复用 driver 的 tar@7.5.22 依赖，列举与提取 entry 清单相等、归档前后哈希一致，所有实际文件按 Git blob、类型、执行位和 SHA256 复核。gitlink（`160000 commit`）单独保存逻辑路径、mode 与 gitCommit；仅接受归档中的唯一空目录，不初始化子仓库、不读取目标 commit，也不导出其文件。安装/构建及 before/after 仍检查这些目录归属且为空，未知 mode/type 组合继续失败。export-ignore/subst 导致 tree 不完整或内容变化会失败。目录必须任务独占静止；不声明恶意并发写入下的原子快照保证。

每侧执行固定 `pnpm install --frozen-lockfile`、`pnpm run build:pkgs`，安装后先检查依赖物理归属，构建后重新验证全部 tracked 源与 lock。固定关键输入：watch 的六份 benchmark 源/fixture、根 Vite require 入口；Taro 的真实 runner 与 @tarojs/cli bin；runtime 的 weapp-vite 实际业务 bin。均包含核心/PostCSS 真实 package/入口/完整 dist、配置与命令 shim 归属。HMR 项目 source 不作为 checkpoint immutable 清单；全部源码仍保存在 sourceManifest。

`roles[i]` 包含 role/root/sourceCommit/sourceTree/lockSha256/trackedManifestSha256/driverCommit/driverTree/commands/inputs/sourceManifest/sourceArchive/receipt/preparationReceiptSha256。preparationReceiptSha256 是完整 role preparation.json 字节 SHA；trackedManifestSha256 是完整 source-manifest.json 字节 SHA。receipt 文件自身不包含自身哈希。sourceManifest 顶层为 schemaVersion/role/sourceCommit/sourceTree/objectFormat/files，files 包含 logical/mode/gitBlob/bytes/sha256/可选 symlinkTarget；同级 gitlinks 独立保存 logical/mode/gitCommit，不伪造 blob 或内容摘要。driver 完整清单与 archive manifest 同样保存 gitlinks。inputs.files 为物理文件去重的完整关键输入集合，全部标记 immutableDuringWorkload=true。

导出 `verifyPreparedRole(role,{phase})` 和 `verifyDriverReceipt`。before/after 全量复核 tracked 源、归档、关键输入、实际 package/bin/dist 集合及干净 driver；checkpoint 只校验不可变关键输入与准备回执，避免把合法 HMR 暂时变更误判为来源失败。HMR controller 必须独立记录原文、写入和恢复，再在恢复后执行 after。checkpoint 不重复哈希大 manager 工具，工具回执在准备和 before/after 验证。

默认执行器使用 POSIX 自建进程组，并在主进程 close 后继续确认无后代；保留首败和 secondary/cleanup 错误。Windows native 准备在 owned job 关闭机制完成前明确失败，Linux/macOS fixture 不能当成 Windows 证据。输入协议/输出归属无效且尚未创建安全 evidence 目录时直接抛错；安全目录建立后，准备失败落阶段 index、角色回执和已有原始日志。后续角色记为 unstarted，CLI 非零退出。

fixture 可注入 execute 模拟 pnpm，但仍使用真实 Git/tar。任何注入结果带 executionProvider=injected；默认验证拒绝，测试须显式 allowInjected=true。fixture 包含两个来源、Node/native manager 入口、借用依赖、安装首败、tracked 改写、driver dirty、checkpoint/恢复、关键 dist 篡改、Git replace、tar 列举后变化、跨平台逻辑路径和读取上限。fixture 通过不能替代真实安装/build、CPU/RSS 与平台链路的结果。

`watch` 保留两侧原始三轮、30 秒总预算、15 秒 nextBuild 与 golden 断言，保存内存 bundle、每轮完整 dist 和静态消费闭包；失败后仍执行另一侧并非零退出。`taro` 每侧一次真实 runner CPU，未对齐业务 span 的归因为 unknown。`runtime` 固定每侧 build3/HMR3、一个会话与八 checkpoint，完整结果合取 matrix、controller/profile、真实 worker 与 RSS 树关联、资源关闭及源码恢复；仅 matrix 成功不表示证据完整。带插桩的时间和 RSS 均不能用于正式预算。
