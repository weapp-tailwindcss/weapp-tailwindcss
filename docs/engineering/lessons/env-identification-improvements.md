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

## 适用边界

本轮为环境识别与公开包契约的定向验收，没有执行全仓测试、设备、IDE 或浏览器 E2E。Linux/Windows 的真实执行及 Node 22 留给既有 Linux/macOS/Windows × Node 22/24 env CI；本地跨平台路径证据来自 POSIX、Windows 盘符、反斜杠、UNC 与相对目录 fixtures，不能换算为原生矩阵通过。

脚本解析支持明确的常见命令语法；复杂 shell、未知包装器和任意 package spec 保守忽略，不推断它们执行了哪个框架。没有修改 demo、样式产物或 issue 复现页，无需更新 static 基线。

## 规则评估

现有 env 包规则已经明确依赖、快照、搜索与包外消费边界，本次用持久回归固定这些约束，不新增 AGENTS 规则或更改 CI 门槛。事实识别留在 env，构建器与生成策略留在消费方。
