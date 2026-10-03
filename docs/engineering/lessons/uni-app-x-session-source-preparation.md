---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: fd81fee3c9fc342446a669b91d89092d3959a54f
regressions:
  - packages/engine/test/v4.session-preparation.test.ts
  - packages/engine/test/v4.session-preparation-lifecycle.test.ts
  - packages/engine/test/v4.session-preparation-dependencies.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/local-cascade-session.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/local-cascade-source.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/native-generation-session.test.ts
---

# 局部规则排序应复用生成会话的 design system

## 症状

[局部 utility 级联修复](uni-app-x-local-utility-cascade.md)使顺序对齐了 Tailwind，但在 raw generation 外独立加载 design system 排序，随后原生生成会话又加载一次。主任务的真实 watch 观察到耗时升高；本次先以真实引擎和 spy 固化重复调用，不把耗时观察直接归因为单一热点。

改动前，主包小程序和 Web 两项回归的局部顺序、标记清理及候选校验均正确，唯独 `loadTailwindV4DesignSystem` 实际调用为 2，期望为 1。engine 的校验先于生成、生成先于校验两种顺序也分别稳定复现 2 次加载。上述 4 项红灯先于生产代码修改。

## 根因与纠正

排序与生成分别拥有加载生命周期，来源 CSS 相同也不能共用一次会话初始化。简单打开进程级缓存不能代替会话所有权：不同扫描模式会去掉 `@source` 和 import 的 `source(...)`，而导入 CSS、间接配置模块、候选删除与失效各有不同生命周期。

engine 提供可选的非语义 `prepareSource` 回调，只返回 CSS 字符串，保留其他来源元数据。会话先确定扫描模式的实际来源，再以同一 revision 内完全相同的 CSS 为键共享 design system。回调与候选校验复用该实例，编译器消费准备后的 CSS；候选删除只重建累积编译器，复用已经准备的 CSS 和 design system，不再次变换可变 AST。失效清理会话缓存，revision 检查拒绝旧异步结果；加载、准备或编译失败后可重试，旧 promise 的拒绝不会删除新 revision 的缓存。

主包仍在目标兼容来源上接线，完整来源缓存 key 不被裁剪。平台、appType 和裸任意值配置参与 native pool 的准备身份，闭包复制可变配置。局部 AST 排序继续由 PostCSS 提供，engine 不依赖局部标记、PostCSS 包或平台语义；legacy fallback 也使用相同准备回调。该回调不得修改主题、utility、variant、配置、插件、导入或来源指令，否则不能复用准备前的 design system。

## 验证

- `CI=1 pnpm --filter @weapp-tailwindcss/engine exec vitest run test/v4.session-preparation.test.ts test/v4.session-preparation-lifecycle.test.ts test/v4.session-preparation-dependencies.test.ts test/v4.generation-session.test.ts test/v4.design-system-refresh.test.ts test/v4.generation-scan-race.test.ts test/v4.engine.test.ts test/style-generator.test.ts --update=none`：8 文件、58 项通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/uni-app-x test/tailwindcss/native-generation-session.test.ts test/tailwindcss/v4-generator.test.ts test/tailwindcss/v4-engine.test.ts test/tailwindcss/generator-order-parity.test.ts test/tailwindcss/v4-scan-source-boundaries.test.ts test/bundlers/generator-css.unit.test.ts test/compiler/tailwind-generation-invalidation.integration.test.ts test/ci/architecture-contract.test.ts test/ci/generation-ownership.test.ts --update=none`：28 文件、500 项通过。
- 原 4 项重复加载回归全部转绿：首次加载从 2 次减少到 1 次；主包连续新增与删除候选后仍为 1 次。engine 验证删除后 prepareSource 仍只执行 1 次，compiler 由 1 次增至 2 次，输出正确删除旧候选。
- 新回归覆盖扫描模式 false → true → false 的实际来源隔离、源码切换后的排名与有效候选刷新、导入 CSS 与间接 CJS 配置依赖、依赖归属、三阶段失败重试、异步准备期间的 invalidate/dispose，以及旧加载失败后保留新缓存。
- engine 与主包构建、engine typecheck、主包 `tsconfig.typecheck.json` 检查通过；修改的源码和测试显式执行 `eslint --no-ignore`，全部通过。主包构建保留既有 mixed exports 提示。
- 构建产物的 ESM/CJS × 根入口/v4 入口共 4 条真实导入与 prepareSource 生成验证通过；声明构建包含新选项类型。`pnpm architecture:check`、`pnpm agents:check` 和 `git diff --check` 通过；`pnpm release status` 识别本次 engine、主包中文 patch intent。没有版本写入或发布。

有界微基准使用 128 条局部规则（64 对 RGB/HEX），真实公开 generator，weapp/uni-app-x、scanSources=false、bareArbitraryValues=true；每个会话依次以 3 → 5 → 1 个候选生成，分别记录初始、新增、删除耗时。每版在独立进程中预热 1 轮、采样 3 轮；每轮新建会话并加入不同 revision 注释，避免进程级来源缓存混入跨 revision 复用。来源解析和实例创建位于计时外，下面为原始毫秒数：

| 版本/样本 | 初始 | 新增 | 删除 | 总计 |
| --- | ---: | ---: | ---: | ---: |
| 基线/预热 | 167.818 | 18.912 | 19.358 | 206.088 |
| 基线/1 | 22.966 | 13.891 | 15.365 | 52.222 |
| 基线/2 | 20.522 | 14.905 | 21.571 | 56.998 |
| 基线/3 | 25.098 | 13.309 | 15.465 | 53.872 |
| 当前/预热 | 159.404 | 18.493 | 19.123 | 197.020 |
| 当前/1 | 21.608 | 12.852 | 14.928 | 49.388 |
| 当前/2 | 17.543 | 11.806 | 13.917 | 43.266 |
| 当前/3 | 17.081 | 13.615 | 18.692 | 49.388 |

3 个正式样本的初始/新增/删除中位数由 22.966/13.891/15.465 ms 变为 17.543/12.852/14.928 ms，整轮中位数为 53.872 → 49.388 ms。包含预热的 12 份 CSS 逐一比较 SHA-256，全部相同。基线使用主任务 `b749e46d2f03c8a2eba7ef14e9cbc8d97e1813d9` 的现成构建，已核对 engine 和 v4-generator 源码相对本记录 baseline 无差异；当前版使用本次构建。脚本及完整哈希保存于本任务忽略目录 `.tmp/local-source-preparation-bench.mjs` 和 `.tmp/local-source-preparation-bench.json`，通过 `node .tmp/local-source-preparation-bench.mjs <基线checkout> <当前checkout>` 运行。

主任务整合到 `26d7c72a3` 后重新构建 engine 与主包，构建及仓库正式 `pnpm typecheck` 通过。限定 `uni-app-vite-vue3-hbuilderx-tailwindcss-v4`、`uni-app-x-vdom-tailwindcss-v4` 和 `issue-1144-static` 三个 static 入口，以当前 Alpha 只编译路径重新生成 24 份快照，Git 内容无变化；随后 `CI=1`、`E2E_SKIP_OPEN_AUTOMATOR=1`、`--update=none` 复验 3 文件、4 项通过（35.10 秒）。原始日志为 `.tmp/uni-session-preparation-build.log`、`.tmp/typecheck-session-preparation.log`、`.tmp/uni-session-static-update.log` 和 `.tmp/uni-session-static-verify.log`。真实 watch 仍需新预检后验证。

## 适用边界

确定性的加载/准备次数回归证明了重复工作减少；这组 3 样本微基准仅测定向生成，不能证明真实 watch 的 500 ms 门槛已经通过。子任务未操作设备或浏览器；主任务整合后的 static 验证已完成，不能把 558 项定向测试记作全仓通过。局部排序仍仅遵守当前 design system 的候选首节点排名，不扩张为任意多节点交错层叠等价的保证。

主任务在 `bbb5c5973` 的新预检轮次 `efbec914-eb36-474e-9c79-52d6f22bfb56` 完成微信 IDE 3 项及上述模板/脚本 watch 场景后，在独立 `text-xs` 基线证据失败处停止。以原始日志中带 `[watch] [weapp-tailwindcss:hmr]` 前缀的数据取样、排除 initial 与错误尾部的日志重放，21 次非初始 plugin total 中位数为 970 ms，范围 453–3426 ms，20 次超过 500 ms；generateBundle 中位数 609 ms，其中 entries.plan 为 212.3 ms、tasks.css 为 336.5 ms。首次样本保存在该轮 `wechat-followup/first-performance-samples.json`，预算未调整。该结果证明本次复用尚不足以通过实际性能门禁，不能把单个尖峰直接归因于 design system。

## 规则评估

不新增 AGENTS。现有生成生命周期、精确来源、PostCSS 职责、依赖失效及真实性能证据规则足够；通过公共回调契约、真实引擎回归和模块边界检查约束复用条件。
