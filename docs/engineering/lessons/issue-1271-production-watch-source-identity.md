---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1271
baseline: cb407cab3d3633d13d1d2de1ac660464bb6e0752
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-css-asset-source.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-css-emission.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-watch-css-output.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-runtime-refresh.integration.test.ts
---

# #1271 生产 watch 的源码来源修复

2026-10-09，在四 Issue 验证之后继续修复连续生产 watch 中已经稳定复现的作者样式引用失败。独立分支为 `codex/issue-1271-production-watch`；本地修复包仍标记 5.6.0，不能把版本字段当作 npm 5.6.0 已修复的证据。本轮没有发布、推送、评论或关闭 Issue。

用户授权通过项回复并关闭，但目前没有满足完整验收标准的 Issue。原始四项的发布包、主线和历史版本结果见[四 Issue 验证报告](four-issues-root-cause-verification-20261009.md)，本记录补充新的责任定位及修复结果。

| 项目 | npm 5.6.0／原 main | 本修复分支 | 关闭条件尚缺的证据 |
| --- | --- | --- | --- |
| #1271 | 原始边框及 immutable 升级通过，生产 watch 部分失败 | 作者相对 reference 连续回放已修复；Vite 6 两模式通过，Vite 5 Options manifest 仍失败 | 原固定 Vite 5 工具链的 manifest 正确性；本地修复尚未进入发布包 |
| #1214 | 构建适配和 static/watch 通过 | 没有新增产品补丁 | 微信原生布局矩形；本轮已有 IDE 的 isLogin 探针超时 |
| #1208 | 当前 Alpha 5.31 连续更新通过，旧 5.5.2 也通过 | 没有为未复现问题制造补丁 | 原 HBuilderX 5.24 工程／环境的失败对照 |
| #1245 性能 | 108／216 模块热点改善；19 页整体编译阻塞 | 没有新增性能补丁 | 微信／Android 三组有效整体编译样本；原 108 页业务工程尚未验证 |
| #1245 导入循环 | 主线序列回归通过，真实微信阻塞 | 没有新增导入图补丁 | 同一微信进程 12 轮及旧 5.5.10 失败对照 |

## 症状

原 main 与 npm 5.6.0 的连续生产 watch 在第三轮报：

```text
[plugin:weapp-tailwindcss:adaptor:post]
Can't resolve '../../main.css' in '<project-root>'
```

引用来自 `pages/index/index.uvue` 的原始 style：`@reference "../../main.css"; .text { @apply text-sm font-bold; }`。首轮编译能够解析，随后缓存回放将它按项目根解析。单页 Options 工程也可复现，说明不需要分包或复杂业务逻辑触发。

另外，完整 Options 工程第二轮 manifest 开始保留已经不属于本轮 bundle 的 `uni-app.es.*.js`。作者样式解析失败和 manifest 残留是两个独立问题，不能用一个补丁解释全部失败。

## 根因与纠正

### 来源身份必须在资产边界解析为源码绝对路径

Vite CSS asset 的 `originalFileName(s)` 可以是相对于 Vite `root` 的源码路径。此前 [resolveAssetSourceFile](../../../packages/weapp-tailwindcss/src/bundlers/vite/generate-bundle/css-assets.ts) 原样返回相对值；[CSS 入口处理](../../../packages/weapp-tailwindcss/src/bundlers/vite/generate-bundle/css-entry-processing.ts) 随后将其写入 remembered CSS 的 `sourceFile`。

增量扫描取得当前 SFC 的原始 style 后，缓存中的源码身份仍是 `pages/index/index.uvue`。它既无法与扫描层的绝对路径可靠匹配，也不能作为生成器／PostCSS `from` 的正确来源基准。这是首次偏离源码关系的边界。

修复在取得 asset 来源时传入已经由 Vite 提供的 `rootDir`，使用共享 `sourcePathApi(root, source).resolve(root, source)` 解析真实源码身份。绝对来源保留其所属位置；没有来源元数据时保留产物身份，不猜测源码路径。

实现没有硬编码项目目录、读取输出目录、追加 border 补丁或在 generateBundle 临时读取源码。源码内容仍由既有扫描与 CSS memory 生命周期管理。

新增[持久来源回归](../../../packages/weapp-tailwindcss/test/bundlers/vite-css-asset-source.test.ts)覆盖 POSIX、Windows 反斜杠、不同盘符、根目录、相对 root 和无来源元数据；真实 Tailwind 4 引擎与 CSS memory 在作者 `bg-brand → text-brand → bg-brand` 三次替换／恢复时验证原始相对 reference、最终属性及旧属性移除。

### Vite 5 manifest 的跨轮状态属于上游

去掉 weapp-tailwindcss，使用普通 Vite、共享模块、manualChunks 和 build watch，也能复现 Vite 5.4.21 第二轮保留旧 `_shared-*.js`，第三轮保留两个旧条目。对照使用当前 bundle 的资产列表；仅检查磁盘会因普通 Vite 保留历史文件而漏报。

Vite 5 的 manifest 对象在插件创建时初始化，buildStart 仅重置输出计数，匿名 chunk 的 hash key 因此跨轮积累。相同最小工程在 Vite 6.4.3、7.3.6 各三轮没有旧条目。证据为 `vite-manifest-control.mjs` 与 `vite-manifest-control.json`。

本轮没有在 weapp-tailwindcss 中过滤上游 manifest，也没有修改公开 API 或项目依赖来掩盖原工具链的失败。临时消费项目的 Vite 6 override 仅作工具链对照，不能将其通过结果替代 Vite 5 的验收。

### 受影响 CSS 发射模块的类型边界

主包类型检查同时暴露基线 [framework-css-emission](../../../packages/weapp-tailwindcss/src/bundlers/vite/shared/framework-css-emission.ts) 的 14 项类型错误。修正 EmittedAsset source 类型谓词、exactOptionalPropertyTypes、TransformResult、hash 捕获读取及 CSS metadata 的 Set／array 边界，保持既有发射流程。

[CSS emission 回归](../../../packages/weapp-tailwindcss/test/bundlers/vite-framework-css-emission.test.ts)新增两种 metadata 容器的引用同步验收。没有借此扩大 CSS 处理语义。

## 验证

### 修复前失败，修复后通过

将自己拥有的 `css-assets.ts` 暂时替换成基线 HEAD 内容，运行最终来源回归，再在 finally 恢复修复：9 项中 6 失败、3 通过，真实 memory 回放也无法更新来源。记录为 `source-identity-pristine-before.log`。

修复后定向 15 文件、153 项通过；新增 metadata 两项之后，来源与 emission 两文件在 `WEAPP_TAILWINDCSS_COMPILER=legacy` 和 `graph` 下分别 16 项通过。不同运行重叠，不相加。主包 build、typecheck、architecture:check 与指定五文件 eslint（显式 --no-ignore）通过。

核心可复验命令从仓库根运行，测试均固定 `CI=1`、`--update=none`：

```sh
CI=1 WEAPP_TAILWINDCSS_COMPILER=legacy pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-css-asset-source.test.ts test/bundlers/vite-framework-css-emission.test.ts --update=none
CI=1 WEAPP_TAILWINDCSS_COMPILER=graph pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-css-asset-source.test.ts test/bundlers/vite-framework-css-emission.test.ts --update=none
pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false
pnpm --filter weapp-tailwindcss run build
pnpm architecture:check
```

完整 15 文件 argv、所有失败诊断与成功回执保存在 `commands.jsonl`；没有用修复前 typecheck 或初次 lint 失败冒充通过。没有新增持久 demo／输出 fixture，不涉及 static 基线更新。

### 最终 tarball 的真实生产 watch

主包和全部 workspace 间接依赖打包后，临时消费项目通过 file tarball overrides 安装，没有用 workspace 链接充当发布包。最终主包 tarball SHA-256 为 `93255d772cb5a8584ca3e80219317c84aee28d6e7f241b1f92df5f0693ef72f2`；独立消费项目中的 719 个 dist 文件逐一与 tarball 相同。

固定 Node 24.18.0、pnpm 12.9.1、Tailwind 4.3.3、Vue 3.5.43 与 DCloud `3.0.0-alpha-5020220260725001`。标准对照为 Vite 5.4.21，另一个对照仅将 Vite 全局 override 为 6.4.3；两者锁、真实解析路径、安装命令分别保存。

消费工程使用 `build: { watch: {}, manifest: true }`，在该临时工程执行其 `build:h5` 脚本，完整命令及 cwd 见回执。不用会强制 development 的 CLI `--watch`。每模式同一编译进程五轮，writeBundle 仅打印完成回执；逐轮核对本轮 marker、背景、默认及显式边框、CSS hash、manifest、页面错误和失败请求。

| 最终修复包 | Options | setup | 结果解释 |
| --- | --- | --- | --- |
| Vite 5 单页最小工程 | 5 轮通过 | 不使用无效空 setup 对照 | reference 不再第三轮失败 |
| Vite 5 完整工程 | 样式五轮正确，manifest 验收失败 | 5 轮通过 | Options manifest 每轮新增旧共享 chunk 条目；保持 failed 状态 |
| Vite 6 完整工程 | 5 轮通过 | 5 轮通过 | marker、背景、0／1／2／0／0px 边框、引用和请求均通过 |

最终报告为 `1271-watch-final-minimal-report.json`、`1271-watch-final-vite5-report.json`、`1271-watch-final-vite6-verified-report.json`。每轮保留产物、CSS SHA-256、PNG、PID、耗时、请求与日志。Vite 5 的诊断允许继续采集独立样式行为，但最终仍断言 manifest 失败，没有把五轮采集写成整体验收通过。

身份审计发现，同一 Node 进程顺序安装 Vite 5／6 时，createRequire 的解析缓存使第一份 Vite 6 identity 指向旧路径。因此另以全新 Node 进程复验 Vite 6，真实路径明确为 `vite@6.4.3/.../dist/node/index.js`，两模式仍各五轮通过。早先文件保留为诊断，最终身份以 `1271-final-vite6-verified-identity.json` 和对应锁为准。

headless Chromium 均显式 `headless:true`，释放 context、browser、watch 服务与 HTTP server。原生 Chrome 通过 `cua.getApp('com.google.Chrome')` 新建一个任务标签，打开最终 Vite 6 Options、点击 test 导航、打开 setup 并刷新；可访问性树确认 `watch-main-options-4`／`watch-main-setup-4`，四张本轮截图及请求保留。关闭任务标签后回到用户原 syncthing 页面。截图只作交互证据，数值边框判断来自 headless 探针。

## 适用边界

完整四项的原始 npm／main 验证沿用先前报告的证据，本次没有重复宣称取得新的微信／Android 运行结果。本轮安全只读连接已有微信服务，isLogin 不可用或超时；没有启动、重启、重新登录或清除 IDE 会话。

#1245 的 Android 失败进一步确认：Pinia 3.0.4 正确安装了其声明的 `@vue/devtools-api@7.7.10`，依赖在 Pinia 的 pnpm 相邻路径存在，工程顶层未提升。错误更接近 UTS／pnpm 解析边界，尚未确定完整责任；不能将其写成“包未安装”或在插件里硬编码补偿。原工程配置与凭据保持，不补造三组失败计时。

#1208 的原 HBuilderX 5.24 工程和安装路径仍待提供；已知当前 stable 5.26、Alpha 5.31 不能代替历史失败环境。#1214 只验证构建静态折叠，微信原生动态 calc 的限制没有改变。原 108 页业务工程、Windows 真实运行、iOS／Harmony 均尚未验证。本轮仅做定向验证，没有绕过全端预检运行全面测试。

本轮证据在忽略目录 `e2e/.artifacts/issue-1271-production-watch/`，`index.md` 与 `summary.json` 导航结论；`metadata.json` 给出 worktree、基线和临时消费项目路径，`final-package-hashes.json`、`final-installed-dist-integrity.json` 给出包身份。上轮证据目录为原 checkout 的 `e2e/.artifacts/four-issues-20261009-CTgVwf/`，没有覆盖原始失败日志。

## 规则评估

不新增 AGENTS 规则。已有来源身份、构建图、上游责任和运行验收边界足以约束本次修复；通过持久回归固化资产元数据的来源解析更直接。中文 patch intent 仅记录本次主包修复，不修改版本、不发布。

独立修复 worktree 与临时失败工程保留用于审查和复验；本任务创建的浏览器标签、headless 实例、编译和服务均已收尾，用户原 checkout 保持干净。最终工作树与进程核对、agents:check、diff 检查和提交身份见证据索引。
