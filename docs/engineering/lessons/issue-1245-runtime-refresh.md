---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1245
baseline: d311e401cff76c6baed972288ac7da94c9b4ea8d
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-runtime-refresh.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-runtime-invalidation.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-runtime-refresh.integration.test.ts
  - packages/engine/test/v4.design-system-refresh.test.ts
---

# Issue #1245：uni-app x 重复扫描与运行时失效

## 症状

Issue 使用 weapp-tailwindcss 5.5.7、Tailwind CSS 4.3.3、HBuilderX 5.26、uni-app x VDOM 和样式隔离 2.0，项目有 108 个页面。第二次启动的截图显示微信 ready 耗时约 61 秒变为 164 秒，Android 约 54 秒变为 126 秒。截图的 ready 包含框架及 IDE 阶段，不能直接用作插件自身计时。Issue 未提供原项目。

## 根因与纠正

SFC transform 对 serve/build 无条件调用 ensureRuntimeClassSet(true)，导致每个模块清除缓存、重建 runtime、extract，并再次执行 v4 生成器源码扫描。回归在原始实现上观察到 108 个转换加构建基线触发 109 次刷新；并发初始化还会重复提取。

修复将失效和求值分离：早于 Web SFC HMR 的 pre 钩子与 watchChange 只登记失效，下一次读取串行准备基线并合并同版本请求。新版本到达时旧任务不得回写；失败不缓存，关闭会话释放状态。SFC 无论是否启用局部样式，都补充经过生成器验证的当前模块候选。

补充配置热更新回归发现引擎 design system 的缓存只看 CSS 和目录，忽略了 @config 的间接依赖。现在记录加载器报告的实际依赖并检查内容指纹；候选有效性缓存用 WeakMap 绑定 design system 对象，避免新配置继续消费旧的真假判断。

## 验证

安装独立依赖：`pnpm install --frozen-lockfile --ignore-scripts`；构建依赖：`pnpm --filter 'weapp-tailwindcss^...' run build`。全部命令在本任务 worktree 运行，未修改主 checkout。

- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-runtime test/bundlers/vite-plugin test/bundlers/vite-hmr test/bundlers/vite-source test/bundlers/vite-framework test/uni-app-x test/tailwindcss/runtime test/context/refresh.test.ts --update=none`：48 文件通过、723 用例通过、3 个原有用例跳过。
- `CI=1 pnpm --filter @weapp-tailwindcss/engine exec vitest run --update=none`：18 文件、187 用例通过。
- 以上包含顺序／并发 108 模块、异步刷新期间再次失效、失败重试、会话关闭、独立实例隔离、显式强制刷新、跨平台请求路径，以及真实 Tailwind 的新增／替换／删除、文件删除／重建、多入口、主题、@source、@config 间接依赖更新。
- `pnpm --filter weapp-tailwindcss build`、`pnpm --filter @weapp-tailwindcss/engine build`、`pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.build.json --noEmit --noCheck false --pretty false`、`pnpm --filter @weapp-tailwindcss/engine typecheck` 均通过。修改源码与基准脚本 ESLint 通过。
- `pnpm architecture:check`、`pnpm agents:check`、`git diff --check` 均通过；`pnpm release status` 已识别两包中文 patch intent，未执行版本更新或发布。

### 性能复现

脚本：`packages/weapp-tailwindcss/benchmark/uni-app-x-runtime.mts`。参数为源码 checkout 根目录，TSX_TSCONFIG_PATH 指向同一 checkout 的主包 tsconfig；省略参数默认当前 worktree。使用真实 Tailwind 4.3.3、每页含独立任意值类的临时项目，关闭局部样式与来源追踪以隔离刷新热点，仍执行真实模块候选验证。每个规模预热 1 次、测量 3 次取中位数。基线为 d311e401c，修复版为本次工作树。

```sh
TSX_TSCONFIG_PATH=packages/weapp-tailwindcss/tsconfig.json pnpm exec node --import tsx packages/weapp-tailwindcss/benchmark/uni-app-x-runtime.mts
```

| 模块数 | 基线中位耗时 ms | 修复中位耗时 ms | 基线 extract 次数 | 修复 extract 次数 |
| --- | ---: | ---: | ---: | ---: |
| 12 | 134.34 | 25.34 | 13 | 1 |
| 54 | 918.21 | 53.53 | 55 | 1 |
| 108 | 2681.28 | 81.61 | 109 | 1 |
| 216 | 8784.61 | 165.35 | 217 | 1 |

各规模修复前后的输出 SHA-256 一致。整个基准进程累计峰值 RSS：基线 618752 KiB，修复 406320 KiB；这是进程峰值，非单次转换的独占内存。原始日志保存在忽略目录 e2e/.artifacts/issue-1245/，包含 baseline-benchmark.log、fixed-benchmark-final.log、targeted-tests-final.log、engine-tests.log。

### 前轮全端门禁阻塞

`pnpm e2e:preflight prepare` 的本轮 run 为 `a00d7852-356a-40d9-b537-ac7addb07ab6`。报告位于 `e2e/.artifacts/preflight/a00d7852-356a-40d9-b537-ac7addb07ab6/report.json` 和同目录 `report.md`。

- 通过：Node/pnpm、微信真实 DevTools 连接与交互、HBuilderX CLI/host/平台组件、Android、Harmony、Web 脚本探针。
- 阻塞：iOS 有两个已启动设备，探针报错“需要唯一明确的目标设备”。只读诊断确认分别为 iPhone 18 Pro（iOS 27.0）和 iPhone 17 Pro（iOS 26.5）。没有猜选、关闭或重置用户设备。
- 当时未执行：当前 AI 会话 computer use、VDOM demo 的 static 基线重新生成，以及微信／Android／Web／iOS／Harmony 实际项目构建与连续更新验收。脚本探针通过不代表产品验收通过。
- 恢复：用户指定目标后设置 `E2E_HBUILDERX_IOS_DEVICE_ID`，重新执行 prepare，完成本轮原生 Chrome 交互证据与 verify 后再继续。旧报告不能复用。
- 本轮两端定向验证结果见下节；其余平台仍需重新通过全端门禁，不能复用该报告。

代码通过独立 worktree 提交 PR，并继续跟进远端 CI/CD；不执行发布或修改 AGENTS。远端 CI 结果与本地多端门禁分别记录，状态保留 partial，直到上述实际项目验收完成。

### 用户指定的微信与 Android 定向验收

用户随后明确要求仅验证微信小程序和 Android 的修复后 demo。依据多端手册的单项回归入口，串行运行这两个平台，不把本轮结果视为全端门禁通过。验收对象为提交 `9f1fa972a22a86e6338c13c5d63e281c50ca1629` 的 uni-app x VDOM demo，HBuilderX stable 5.26.2026091802，样式隔离 2.0；Android 为唯一在线设备 emulator-5554。

| 内容 | 微信 | Android |
| --- | --- | --- |
| HBuilderX 构建与产物断言 | 通过 | 通过初始产物断言 |
| 实际页面样式与截图 | 通过，含主题探针 | 初始 marker 和样式探针通过 |
| 连续更新 | bg-red、bg-emerald、bg-sky 三轮通过 | 首轮触发 App Launch，纯 HMR 失败 |
| static 基线 | 17 项重新生成后与版本库一致，不更新模式复验通过 | 不以微信 static 结果替代 Android 运行时结果 |

执行命令：

```sh
pnpm --filter @weapp-tailwindcss/debug-uni-app-x build
CI=1 E2E_HBUILDERX_CASE=uni-app-x-vdom-tailwindcss-v4 E2E_HBUILDERX_MP_PLATFORM=mp-weixin pnpm e2e:hbuilderx:local:mp --update=none
CI=1 DEMO_VISUAL_FILTER='^uni-app-x-vdom-tailwindcss-v4$' DEMO_VISUAL_STYLE_ISOLATION_VARIANT=style-isolation-v2 pnpm exec tsx scripts/demo-visual-e2e-report.ts --weapp-only --fail-on-incomplete
CI=1 DEMO_VISUAL_FILTER='^uni-app-x-vdom-tailwindcss-v4$' DEMO_VISUAL_STYLE_ISOLATION_VARIANT=style-isolation-v2 E2E_HBUILDERX_ANDROID_DEVICE_ID=emulator-5554 pnpm exec tsx scripts/demo-visual-e2e-report.ts --android-only --fail-on-incomplete
CI=1 E2E_PROJECT_FILTER=uni-app-x-vdom-tailwindcss-v4 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -u -c e2e/vitest.e2e.config.ts e2e/uni-app-x-vdom-tailwindcss-v4.test.ts
CI=1 E2E_PROJECT_FILTER=uni-app-x-vdom-tailwindcss-v4 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run --update=none -c e2e/vitest.e2e.config.ts e2e/uni-app-x-vdom-tailwindcss-v4.test.ts
```

微信单端命令只执行目标用例，另外四个平台用例按过滤条件跳过。微信连续更新在同一个 HBuilderX watch 会话中发生，开发者工具重新编译显示每轮增量产物，验证 marker、可达样式及截图；不能据此宣称页面状态始终保持。首次构建曾因独立 worktree 缺少 debug-uni-app-x 的 dist 失败，补构建该本地依赖后通过；错误分类器的“CLI 与实例不匹配”提示不符合底层 missing package entry 报错，未据此操作 IDE 实例。

Android 在 `append-mt-200-to-existing-node` 步骤生成了新产物，但日志出现 `App Launch`，原有严格断言报错：`纯 HMR 验收失败：restarted；增量重启或重装不能计作保持运行状态的更新`。为区分是否由本次优化引入，在独立的 d311e401cff76c6baed972288ac7da94c9b4ea8d 基线 worktree 安装相同依赖并构建，使用相同设备、HBuilderX、隔离模式和原有用例再执行一次；同一步骤同样失败。证明重启现象在修复前已存在，尚不足以确定其最终归属。未改为 native-reload、未跳过首轮，也未宣称后续 HMR 步骤通过。

证据位于 `e2e/.artifacts/issue-1245/`：wechat-build-ready.log、wechat-visual-hmr.log、wechat-report.json、wechat-static-update.log、wechat-static-check.log、android-report-failed.json、android-fixed-hbuilderx.log、android-baseline-report-failed.json、android-baseline-hbuilderx.log。截图位于 `e2e/.artifacts/demo-visual/full/screenshots/uni-app-x-vdom-tailwindcss-v4/` 下对应平台的 style-isolation-v2 目录。测试结束已恢复两个 worktree 的 demo 源码，关闭本轮拥有的运行进程。

### CI 后续修复

PR #1246 的首轮 PR quality and unit tests (1) 在 source-line-limit.test.ts 失败：框架插件装配文件增至 519 行。将新增失效／释放插件装配移到 runtime-class-set/lifecycle.ts，保持钩子相对顺序与行为；不放宽 500 行门槛。包含行数门禁与运行时／uni-app x 回归的 4 个测试文件、33 个用例在本地通过。后续远端结果按最新 PR head 继续跟进。

## 适用边界

数据只证明插件转换热点的改善，不代表真实 HBuilderX 全量打包同比提速。暂未获得 Issue 原项目；微信和 Android 的实测结果见上述单端记录。Web、iOS、Harmony 本轮没有实际项目验收证据，不能用两端定向结果宣称全端通过。

## 规则评估

不新增 AGENTS 规则。现有生命周期、精确类名、性能回归与多端门禁约束已经覆盖本次问题，补可执行回归和复盘即可。
