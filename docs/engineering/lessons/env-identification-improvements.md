---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1294
baseline: 61d79ffca1ac440e220c52ea597ef238136ff05d
regressions:
  - packages/env/test/platform.test.ts
  - packages/env/test/package-command.test.ts
  - packages/env/test/script-command.test.ts
  - packages/env/test/report.test.ts
  - packages/weapp-tailwindcss/test/framework.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-app-type.unit.test.ts
  - packages/weapp-tailwindcss/test/ci/architecture-graph.test.ts
  - packages/weapp-tailwindcss/test/ci/client-boundaries.test.ts
  - packages/weapp-tailwindcss/test/ci/env-workflow.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-uni-scheduler.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-uni-build-lifecycle.unit.test.ts
---

# 环境识别的命令边界、平台身份与可解释报告

## 症状

`@weapp-tailwindcss/env@0.1.0` 的 MPX 映射使用普通对象索引。`constructor` 与 `__proto__` 会返回继承属性，使声明为字符串的结果实际成为函数或对象（[Issue #1294](https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1294)）。`ali/dd` 虽能映射成 uni 平台，却没有被 MPX resolver 分类为小程序（[Issue #1295](https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1295)）。

框架脚本匹配使用词边界正则，把 `eslint weapp-vite.config.ts` 和 `node scripts/taro-smoke.js` 当作框架信号，覆盖真实依赖对应的宿主（[Issue #1296](https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1296)）。平台拼写需要由消费方重复归一，识别结果也没有可追踪的证据（[Issue #1297](https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1297)、[Issue #1298](https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1298)）。

## 根因与纠正

平台别名改为共享 `Map` 数据，拒绝原型链属性命中。MPX resolver 复用同一组别名分类，通用 resolver 继续不猜测 MPX 专属 `ali/dd`。独立的 `resolvePlatformIdentity` 保留原值和 trim/lowercase 结果，精确归一已知身份；`mp-custom/web-custom` 等前缀只保留旧分类语义，不成为已知身份。`app` 与 `app-plus` 保持独立，不把身份识别变为编译 target 或 CSS policy。

脚本识别拆为内部命令解析模块，不执行脚本。只有直接命令、明确的常见包装器和命令链提供证据；文件参数、输出、展开内容和未知包装参数不提供证据。Windows executable 路径、`.cmd`、caret 与 CRLF 有定向回归。Scoped package spec 不按路径 basename 推断命令，重定向中的 `&` 不划分命令。

普通检测与报告共用惰性的内部匹配规则。普通检测取首个结果，报告聚合首次命中阶段的候选与证据；优先命中的 manifest、显式 package、初始 marker、最近目录的配置会遮蔽后续阶段。报告不为解释结果扫描上层冲突，也不偷偷读取进程环境。uni-app 变体作为同家族细化，不互相报告冲突。

主包 `framework` 显式再导出两个 API 及类型，保留 Vite package boundary 和既有 resolver 形状。包外消费断言锁定函数返回、身份上下文参数、证据与候选类型，覆盖 `.mts/.cts` NodeNext；生产源码仍只依赖 Node 内置模块。

## 验证

基线为 frontmatter 的最新 `origin/main`，分支为 `codex/env-identification-improvements`，全部写入在独立 worktree 完成。本地为 macOS arm64、Node 24.18.0、pnpm 12.9.1，日期 2026-10-14。结果针对该基线上的实现与测试改动，原 checkout 未修改。

平台回归在修改前出现 4 项失败；脚本 package 回归在修改前出现 2 项失败、1 项通过。独立审查补充 scoped spec、重定向、CRLF 与别名短路回归，修正前 9 项失败，修正后通过。普通检测保留别名短路，报告才聚合别名；证据复用匹配时读取的值。

执行的定向命令（普通单测均 `CI=1`、`--update=none`）：

```sh
corepack pnpm install --frozen-lockfile --filter weapp-tailwindcss... --filter @weapp-tailwindcss/env --ignore-scripts
corepack pnpm install --frozen-lockfile --filter @weapp-tailwindcss/cli --ignore-scripts
corepack pnpm --filter weapp-tailwindcss... run build
corepack pnpm --filter @weapp-tailwindcss/cli run build
corepack pnpm --filter @weapp-tailwindcss/env build
corepack pnpm --filter @weapp-tailwindcss/env exec cross-env CI=1 vitest run --update=none
corepack pnpm --filter weapp-tailwindcss exec cross-env CI=1 vitest run test/framework.test.ts test/bundlers/framework-selector.test.ts test/bundlers/vite-app-type.unit.test.ts test/utils/hbuilderx.test.ts test/utils/uni-platform.test.ts test/context-cache.test.ts test/runtime-branch-platform.unit.test.ts test/ci/architecture-package.test.ts test/ci/architecture-graph.test.ts test/ci/client-boundaries.test.ts test/ci/ensure-built-env.test.ts test/ci/env-workflow.test.ts --update=none
corepack pnpm --filter @weapp-tailwindcss/env typecheck
corepack pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false
corepack pnpm --filter weapp-tailwindcss tsd
corepack pnpm --filter @weapp-tailwindcss/env test:package
corepack pnpm exec eslint --no-ignore packages/env/src/{detect-env,index,package,platform,project,matching,script-command,types}.ts packages/env/test/{platform,script-command,package-command,report}.test.ts packages/env/scripts/verify-package.mjs packages/weapp-tailwindcss/src/framework/index.ts packages/weapp-tailwindcss/test/framework.test.ts
corepack pnpm architecture:check
corepack pnpm docs:packages:check
corepack pnpm agents:check
corepack pnpm release status
git diff --check
```

- env 7 文件 218 项、主包 12 文件 98 项定向测试通过，共 316 项，无 skip。
- 主包依赖闭包及 CLI 构建通过，env 同步生成 ESM/CJS 与 `.d.ts/.d.cts`。env、主包类型检查与主包 tsd 通过。
- workspace 外实际 tarball 消费验证两个新 API、旧入口、快照、原型键、平台别名和 NodeNext 声明；临时目录通过 `os.tmpdir()` 创建并在 finally 清理。
- 架构检查覆盖 37 包、1399 源文件；32 个发布包双语 README 检查、定向 lint、规则检查与 diff 检查通过。
- 中文 minor intent 通过 `pnpm change` 生成，覆盖 env 与主包；未手改版本或执行发布。

首次主包类型检查与 env 重建并行，碰到构建清理产物的窗口而失败；调整为 env 构建完成后执行，检查通过。首次架构发布入口测试缺少 CLI dist，补充冻结安装与 CLI 构建后通过。缺产物失败不归因为产品缺陷，不放宽测试。

## PR CI 的 polling watch 竞态

用户要求持续处理 CI 并合并后，在 head `17bbc11c7897d96be98ef70e2afc0118a90f3302` 的 [PR Gate run 38506883860](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38506883860) 中，macOS `uni-app-vite-tailwindcss-v4:mp-weixin` 的 [job 115666440345](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38506883860/job/115666440345) 报错：Iconify content settled 时 WXML 缺少本轮消费者。

日志记录 content 源码在 03:43:30.897 写入，首次构建在 03:43:36.243 完成，下一次构建在 03:43:36.447 开始；03:43:40.817 就执行 settled 断言，早于第二次构建结束。相关 watch 工具与基线相同，不属于 env API 的平台兼容问题。

旧轮询会重叠扫描，并将原子写入器的 `.文件名.pid.UUID.tmp` 纳入快照；该文件出现或消失能额外排队全量构建。内存复现确认单次真实源码 mutation 可以产生两次后续构建，但 CI 没有记录变化文件，不能断定临时文件是该次额外构建的唯一原因。稳定等待只观察前次 DONE 与产物 mtime，且入口时缺失的 WXML 会被降为可选，因此可以读到下一次全量构建清理或重写中的输出。

修复把初始构建、轮询和构建后快照放进同一单飞调度器。仅排除本仓库原子写入器拥有的临时文件；普通隐藏源码与 `.tmp` 文件仍参与检测，ENOENT 不留下幽灵条目，权限错误向上传播。构建期间的实际源码变更由后置快照触发串行追赶；队列未排空、失败或停止都不发成功 idle。

wrapper 在实际构建前发 generation/start，成功退出并确认源码稳定后才发对应 idle。session 在初始扫描前进入 managed 状态，分别为 stdout/stderr 使用 UTF-8 完整行缓冲；旧 DONE、旧 generation idle 与新 plugin/mtime 信号都不能代替本轮 idle。readiness、warmup、baseline 和 settled 检查保留构建状态边界，异步读取后复核 generation。默认 WXML/JS 的必需性不依赖入口时是否存在；可选 CSS 出现后锁存存在要求，仍按当前表达式解析 hash 文件，style-only override 保持其范围。停止时向 owned build 子进程传递信号，测试 runner 仍负责整棵 owned 进程树的清理。

新增失败回归先确认“下一轮 active 时旧成功仍放行”，修复后通过。独立审查另复现“旧 idle 被新 plugin 信号盖过”，增加本轮 idle 时间边界及回归。确定性测试覆盖初始/轮询单飞、追赶、回退、删除、重命名、停止、失败、完整行解析、必需产物暂缺、style-only override、扫描中的 generation 变化和可选 CSS 消失。

定向验证命令与范围：

```sh
corepack pnpm install --frozen-lockfile --filter @weapp-tailwindcss/runtime... --filter @weapp-tailwindcss/merge... --filter @weapp-tailwindcss/variants... --filter @weapp-tailwindcss/scripts --filter ./demo/uni-app-vite-tailwindcss-v4 --ignore-scripts
corepack pnpm --filter @weapp-tailwindcss/runtime build
corepack pnpm --filter weapp-tailwindcss exec cross-env CI=1 vitest run test/watch-hmr-uni-scheduler.unit.test.ts test/watch-hmr-uni-build-lifecycle.unit.test.ts test/watch-hmr-regression.unit.test.ts test/watch-hmr-wait-deadline.unit.test.ts test/watch-hmr-style-rollback.unit.test.ts test/watch-hmr-iconify-evidence.unit.test.ts test/watch-hmr-runner.unit.test.ts test/watch-hmr-runner-cleanup.unit.test.ts test/watch-hmr-environment.unit.test.ts --update=none
corepack pnpm --filter @weapp-tailwindcss/scripts test:watch-hmr -- --case uni-app-vite-tailwindcss-v4:mp-weixin --timeout 420000 --poll 40 --max-hot-update-ms 420000 --max-plugin-process-ms 500 --report <临时目录>/watch-local-after.json --skip-build --quiet-sass
corepack pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false
corepack pnpm exec eslint --no-ignore scripts/uni-e2e-watch.mjs scripts/uni-e2e-watch/*.mjs tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/{compile-state,session,types}.ts tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/shared.ts packages/weapp-tailwindcss/test/watch-hmr-uni-*.unit.test.ts
corepack pnpm agents:check
git diff --check
```

九文件子集通过 195 项；审查追加两项后再运行 lifecycle 文件，7 项通过，合计覆盖 197 项。真实 macOS watch case 完整通过，包含模板、脚本、content、样式、分包、用户示例回退与 Iconify 消费链；源码 finally 恢复，owned 进程退出。首次本地尝试缺少 runtime 依赖闭包产物，补充冻结安装及构建后验证通过，未更改锁文件或降低断言。主包类型检查、新源码与新测试定向 ESLint、规则检查及 diff 检查通过。

私有 scripts 的全项目严格类型检查存在既有错误：使用同一 TypeScript CompilerHost 比较当前代码与 `17bbc11` 原始源码，均为 211 项，无新增诊断。大型既有 `watch-hmr-regression.unit.test.ts` 强制 lint 均为 24 项原错误，ESLint 原始/当前文本诊断比较无新增；没有把这些检查写成通过，也没有借本次修复放宽配置。真实 watch 运行覆盖 polling 调度与 managed 边界，最终追加的 native fallback idle 条件由确定性回归覆盖。

该修复只调整私有验收工具，不改变 demo、样式产物基线、公开包版本或 CI 门槛。没有执行全端 IDE/设备验收；新 head 的远端矩阵仍需独立核验，旧 head 的绿色结果不作为最终合并凭据。

## 合并前的 main 同步

head `b66dc84e26a23ef62f4cabf6aecb512a073d3424` 的远端检查最终为 215 项成功、27 项按范围跳过，无待执行或失败项；其中此前失败的 macOS 微信 polling watch 用例完整通过。最终合并核对时，main 已前进到 `1580162e783e447ff8929847550750f2461425b5`，新增 Uni manifest 注释解析与 Taro/MPX 环境快照入口，PR 因交叉修改发生冲突。因此先正常合并 main，再独立验证新 head，旧 head 的绿色结果不作为最终合并凭据。

冲突按接口并集合并：普通检测与报告共用 manifest 解析回调，package.json 保持严格 JSON；公开导出、双语文档、两侧的 ESM/CJS 与 NodeNext 消费断言全部保留。包外消费新增带注释 manifest 的报告证据与 MPX 快照分类，workspace 主包根入口核对四个新 API 的函数身份。

自动文本合并还暴露语义问题：新的 `resolveMpxPlatformFromEnv` 直接调用通用分类器，丢失 MPX 上下文。新回归修复前出现 `ali/dd` 及大小写变体 4 项失败，其余 47 项通过；改为复用内部 MPX 分类器，避免通过带默认参数的单值入口引入进程环境回退。回归覆盖七个别名、冻结快照和 current mode 优先级；报告覆盖注释 manifest、绝对证据路径、普通检测一致性及损坏配置回退。

合并后本地 env 9 文件 268 项、主包 12 文件 98 项测试通过，共 366 项，无 skip。重新执行前述冻结过滤安装、主包依赖闭包与 CLI 构建、env/主包类型检查、主包 tsd、env 包外消费、定向 ESLint、32 个发布包双语 README 检查、规则检查及 diff 检查；架构检查覆盖 37 包、1400 个源码文件。release status 仅核对已有 intent，不落盘版本或发布。独立只读审查未发现剩余阻断项。

## 适用边界

本轮为环境识别与公开包契约的定向验收，没有执行全仓测试、设备、IDE 或浏览器 E2E。Linux/Windows 的真实执行及 Node 22 留给既有 Linux/macOS/Windows × Node 22/24 env CI；本地跨平台路径证据来自 POSIX、Windows 盘符、反斜杠、UNC 与相对目录 fixtures，不能换算为原生矩阵通过。

脚本解析支持明确的常见命令语法；复杂 shell、未知包装器和任意 package spec 保守忽略，不推断它们执行了哪个框架。没有修改 demo、样式产物或 issue 复现页，无需更新 static 基线。

## 规则评估

现有 env 包规则已经明确依赖、快照、搜索与包外消费边界，本次用持久回归固定这些约束，不新增 AGENTS 规则或更改 CI 门槛。事实识别留在 env，构建器与生成策略留在消费方。
