---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1220
baseline: b6229e3beef802c43c00a7d1e5780e98fbdc22fe
regressions:
  - e2e/uni-app-vite-tailwindcss-v4.test.ts
  - e2e/multiplatform-build-output.test.ts
  - packages/weapp-tailwindcss/test/compiler/runtime-snapshot.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-runtime-affecting-signature.unit.test.ts
  - packages/weapp-tailwindcss/test/js/oxc-fast-path.test.ts
  - packages/weapp-tailwindcss/test/js/oxc-module-graph.test.ts
  - packages/weapp-tailwindcss/test/js/oxc-analysis-cache.test.ts
  - packages/postcss/test/vite-css-rules-selector-prefilter.test.ts
---

# uni-app CLI 编译器与 HBuilderX 5.26 对齐

## 症状

升级 HBuilderX 不会更新 CLI demo 的 npm 编译器。普通 `uni-app-vite-tailwindcss-v4` 使用 5.15 编译器，而 HBuilderX 运行基座已经是 5.26，iOS 会提示版本不匹配。

## 根因与纠正

将该 demo 的 21 个同系列 `@dcloudio/*` 依赖对齐到 `3.0.0-5020620260917001`，实际编译器版本为 5.26；包含此前混用旧版的 `uni-mp-vue`，保留 Vite 5.2.8 和 `weapp-tailwindcss` 生成链路。升级从 #1217 拆出独立交付，样式转换迁移不依赖此版本升级。

5.26 的独立分包插件会隔离模块图和运行时。本 demo 的微信生产产物从 36 个增至 39 个，新增独立分包 vendor 约 63 KB。这是实际新增的编译工作，不能通过移除独立分包、修改性能基线或放宽 5% 门槛消除。

CPU profile 显示，升级后的 JS 候选文本签名分析花费约 61 ms，其中约 48 ms 用于 Babel 解析；这部分完整 AST 随后不一定由 Oxc 转译链使用。签名分析现复用已有 Oxc 加载器，原生模块不可用、解析异常时仍回退 Babel。对构建图明确标为非候选的 JS，快照直接沿用源码哈希保守失效，不再为了候选文本比较建立 AST；JS 转译、关联模块失效和文件删除仍保留。

首次修复曾将 Terser worker 限为 2，保持 39 个产物逐字节一致，但远端冷构建仍回归 9.95%，HMR peak / steady 分别回归 15.81% / 11.89%。随后单 worker 对照也更慢，因此未作为最终方案。最终仅在 demo 的小程序生产构建显式选择 uni-app CLI 支持的 `esbuild` 压缩器；开发模式、H5 和 App 沿用框架配置，独立分包继续包含独立运行时。JS 压缩文本会变化，不能再宣称全部产物逐字节一致。

增量类集合变化时，内容未变的 vendor 仍需要按新 classSet 重新转译。Oxc 快路径改为缓存字面量的值和位置，容量上限 128 项、计费 2 MiB，超限源码只解析不缓存；完整 AST 不进入缓存。缓存键包含源码、语言和 sourceType，匹配与转义选项不进入解析事实，每次使用当前选项重新匹配。ESM 声明、忽略调用等仍回退 Babel；当前模块图不消费 CommonJS require 依赖，相关 chunk 可以使用 Oxc。

Taro Vite 的 HMR 报告还暴露 preflight/theme 合并中的重复 selector 解析。两种匹配都要求多个独立选择器，因此不含逗号的单一选择器可以直接排除；其余内容继续由 selector AST 精确检查，覆盖转义、伪类和属性内逗号。此预筛属于 PostCSS 包，不在 bundler 中增加 CSS 解析。

## 适用边界

拆分前与样式迁移组合验证时，frozen install、14 平台产物、微信 static 和普通 Vue3 iOS 原生热重载通过；iOS 版本弹窗消失。该 App 结果来自组合代码，不能冒充本独立分支的完整设备验收。

普通 Vue3 的 `app-service.js` 变化可能触发 HBuilderX 全量同步，iOS launcher 发送 `restart`。因此该场景需要单独记录原生热重载，不能算作保持状态的纯 HMR。#1217 已加入维护者确认的独立验收模式；本升级不修改生命周期断言。

三组独立 checkout 的串行对照（各 3 次构建、3 次 watch 更新）中，同为 5.15 时样式迁移前后构建/内存接近；从迁移后 5.15 升到 5.26，构建中位数 3708.59 → 3968.69 ms，构建峰值 RSS 中位数 1063.31 → 1185.11 MB，HMR steady 469.06 → 642.95 ms。远端也重复观察到回归。原始报告位于 #1217 工作树 `.tmp/pr1217-ci-before/compiler-matrix.json`，采样定义见该 PR 工程记录。

上述是优化前的证据，保留用于说明真实升级成本。后续基于已合并 #1227 的 `main` 继续修复，未放宽性能门槛，也未把升级后的编译器纳入基线。PR 的远端验收以最新 head 的检查结果为准。

本轮 macOS watch 对照中，5.15 和 5.26 均出现更新或回滚收不到后续事件的超时；轮询监听以及等待完整编译日志的独立探针也未解决。未将这些失败轮次用于证明 HMR 性能通过，亦不能据此归因于 5.26。HMR 性能需要由远端 Linux 的真实 watch 门禁继续验证。

## 验证

基于 `main` 的 `d7feb9051c5c8f91979f583e5ac885434b81b253` 提取原升级提交的 demo manifest 与锁文件，不包含样式转换迁移或原 PR 的历史工程记录。

- `pnpm install --frozen-lockfile` 通过。
- `CI=1 pnpm build:ci` 通过。
- `CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_PROJECT_FILTER='^uni-app-vite-tailwindcss-v4$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-vite-tailwindcss-v4.test.ts -u`：2 项通过，重新生成 13 个 static 快照，无受跟踪产物差异；随后以 `--update=none` 复核，2 项通过。
- `CI=1 E2E_MULTIPLATFORM_BUILD_CASE='^uni-app-vite-tailwindcss-v4 (mp-alipay|h5)$' pnpm e2e:multiplatform-build`：3 项通过，覆盖支付宝 `.acss` 产物、H5 构建和矩阵登记。

以上拆分时的日志保存在 #1217 工作树 `.tmp/compiler-526-split-*.log`。当时完整多端验收因浏览器认证失败未执行；重新执行完整多端验收仍须通过本轮环境预检。

本轮修复验证：

- `pnpm --filter weapp-tailwindcss exec vitest run test/compiler test/js test/bundlers/vite-bundle-state.unit.test.ts test/bundlers/vite-bundle-state-cache.unit.test.ts test/bundlers/vite-runtime-affecting-signature.unit.test.ts test/ci/architecture-contract.test.ts --update=none`：410 项通过，2 项既有条件跳过。
- `pnpm --filter weapp-tailwindcss build`：含类型声明构建通过。
- 继续使用上面的定向 static 命令重新生成并复核 13 个快照，产物基线无变化；支付宝与 H5 三项检查通过。
- 串行比较 `main` 5.15 与修复后 5.26，各运行三次构建：中位数 4003.38 → 4014.02 ms（+0.27%），插件中位数 981 → 1001 ms（+2.04%），构建峰值 RSS 中位数 1091.36 → 1031.23 MB（-5.51%）。只验证构建；`--hmr-runs 0` 的启动内存不作为 HMR 性能证据。
- 同一 5.26 编译器下，优化前后全部 39 个微信生产产物逐字节相同，包含独立分包 JS。

本轮原始对照与 profile 保存在 #1220 工作树 `.tmp/pr1220-final-build.json`、`.tmp/pr1220-profiles/`；矩阵命令为 `node benchmark/version-compare/scripts/run-matrix.mjs --versions-file .tmp/pr1220-perf-result/versions.json --build-runs 3 --hmr-runs 0 --timeout 60000 --poll-interval 30 --only demo-uni-app-vite-tailwindcss-v4__mp-weixin --out .tmp/pr1220-final-build.json`。两份隔离副本使用各自锁文件和依赖，基线不应用本次优化。

后续修复验证与限制：

- `CI=1 pnpm --filter @weapp-tailwindcss/postcss test`：97 个文件通过，947 项通过，3 项既有条件跳过。
- compiler、JS、运行时签名和架构边界定向回归：53 个文件通过，413 项通过，2 项既有条件跳过；缓存覆盖类集合增删、转义配置、解析模式、超限和淘汰。
- CSS 回填与模块图回归：4 个文件、55 项通过。两个公开包构建、源码 ESLint、`pnpm agents:check` 和 `git diff --check` 通过。
- 最终配置按上面的 static 命令重新生成并以 `--update=none` 复核，13 个快照无受跟踪差异；支付宝、H5 与矩阵登记共 3 项通过。
- 同一份 204063 字符的独立分包 vendor，预热一次、七次改变 classSet：原快路径中位数 13.39 ms，紧凑缓存后 0.55 ms，每轮输出保持原文。微基准只证明重复解析成本，不代表端到端 HMR 通过。
- `esbuild` 最终配置串行三次冷构建：基线 3895.78 ms，当前 3741.47 ms（约 -3.96%）；插件 975 → 1027 ms；峰值 RSS 中位数 1072.25 → 843.94 MB。原始报告 `.tmp/pr1220-esbuild-build.json` 保留全部样本，不能以总耗时改善代替独立插件门禁。
- 本地 watch 仍有基线/当前共同的超时。模板删除单测在本地批量运行中失败、单独运行通过，远端当前修复前的三个单测分片全部通过；尚不能把本地失败认定为环境问题，亦不修改超时或断言消除失败。

最终远端验收必须以最新提交的完整检查为准，保留原始失败报告；不重设性能基线、不放宽门槛、不删减独立分包功能。

## 规则评估

沿用现有编译器/基座对齐、static 基线、性能门槛与完整多端预检规则，不新增或放宽 AGENTS 规则。私有 demo 的依赖升级不单独生成公开包 change intent；核心包和 PostCSS 优化提供中文 patch intent。
