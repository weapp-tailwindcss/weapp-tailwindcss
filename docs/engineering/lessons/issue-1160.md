---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1160
baseline: "90693a36231a189a043a24359da0ac856972fbc5"
regressions:
  - packages/weapp-tailwindcss/test/uni-app-x/border-preflight.test.ts
  - e2e/issue-1160-static.test.ts
  - e2e/issue-1160-mini-static.test.ts
  - scripts/ci/demo-matrix/source-file-retry.test.mjs
---

# Issue #1160：uni-app x 单边边框默认值与组件样式顺序

## 症状

在最新 origin/main 上冻结安装并构建包后，使用既有
`uni-app-x-vdom-tailwindcss-v4` demo 的独立页面复现：
`border-t-[1px] border-solid border-[red]` 在 Android 上显示四边框，
未指定的三边比顶部更粗。原始 flex 布局保留，移除图标依赖以排除干扰。
原生 CSS 对照仅设置顶部宽度、样式和颜色，显示正常。

任务 worktree 为仓库同级 `weapp-tailwindcss-codex/issue-1160-uni-app-x-border`，
分支为 `codex/issue-1160-uni-app-x-border`。先执行 `git fetch origin`，
再从上述 SHA 创建 worktree，原 checkout 的三处改动未动。

## 根因与纠正

Tailwind 单边 utility 只设置该方向宽度，依赖 preflight 的零宽度默认值。
uni-app x 原生兼容层会移除不支持的通配符和 view/text 基础载体。
`border-solid` 又为四边设置样式，缺少宽度重置的三边使用运行时默认宽度，
因此显示为额外边框。保留的 `var(--tw-border-style)` 并不是本例根因：
真实设备在恢复零宽度默认值后即可正确显示。

修复在 SFC 模板转换边界添加独立 `weapp-tw-border` 基础类，
通过现有 PostCSS AST 和 `createInjectPreflight` 仅提取用户配置的
border / border-* 声明，放入独立非 scoped style。基础类排在元素原有 class 前，
默认作用于 view/text；显式 `cssPreflightRange: 'all'` 扩大范围，
不作用于 template/slot/block。关闭 preflight 或没有边框声明时不注入。
H5 保持已有 Web 链路。

微信隔离组件还暴露了另一处边界：全局元素重置不等于组件内部默认值。
最终产物的 `app.wxss → uvue.wxss → main.wxss` 导入链确实保留了全局重置，
只检查 app.wxss 曾误判为规则丢失；沿真实导入链检查后纠正了这个判断。
尝试保留 PostCSS 元素规则没有解决隔离组件，因此撤回了这部分改动。

组件 CSS 回放会去重并追加基础规则，可能将其排到原生 CSS / @apply 作者规则之后。
基础类不能只在模板阶段“看起来位于最前”。最终采用已有框架 CSS 转换入口，
用 PostCSS AST 在输出图内将这条明确的基础规则移至作者规则之前，
保留前导 @charset / @import 和其他规则的相对顺序。
这避免了每个单边 utility 清零其他三边，也避免破坏多方向组合及显式覆盖。
不读取输出文件修补产物，不新增公共 API。

## 验证

日期：2026-09-07，macOS。Node 24.18.0，pnpm 11.25.0，
Tailwind CSS 4.3.3，weapp-tailwindcss 5.5.1 本地构建。
demo 解析本 worktree 的 `packages/weapp-tailwindcss/dist/vite.cjs`，
消费本地 workspace postcss 包。冻结安装未改锁文件。

| 平台 | 实际工具与产物目录 | 结果 |
| --- | --- | --- |
| Android | HBuilderX 5.24.2026081301，VDOM，Android 11，emulator-5554；unpackage/dist/dev/app-android | 修复前四边框，修复后全部 12 个探针正确；有前后截图和编译结构记录 |
| H5 | uni CLI 编译器 5.22，Chromium 152；dist/dev/h5、dist/build/h5 | 原有行为正确；最终 12 个 DOM 计算样式探针通过，未注入原生基础类 |
| 微信 | HBuilderX 5.24 VDOM、微信开发者工具 Stable 2.02.2608060；unpackage/dist/dev/mp-weixin | 隔离组件修复前失败，修复后四方向、组合、作者规则和 @apply 正确；有 WXML 结构及截图 |
| iOS | HBuilderX 5.24 VDOM，iPhone 17 Pro / iOS 26.5 模拟器；unpackage/dist/dev/app-ios | 单边、组合、覆盖及作者对照运行截图通过 |
| Harmony | HBuilderX 5.24 VDOM，DevEco Pura 90 模拟器，HarmonyOS 6.1.1 / API 24；unpackage/dist/dev/app-harmony | 启动本地模拟器后完成真实运行截图，全部探针正确 |

原生端使用 UVUE 原生渲染，不将它描述为 WebView CSS 兼容测试。
环境中的 Android System WebView 是 91.0.4472.114，但它不是本例原生视图的渲染器。
各 App 编译使用样式隔离策略 1.0，demo 开启组件局部样式。
每次切换原生平台前停止本任务的上一条 launch。

Android 和 H5 在同一轮运行中把 Top 探针从 1px 改为 4px，再恢复为 1px，
同步变更文字标识，保留截图。Android 确认 HBuilderX 增量同步及页面重新渲染，
H5 确认 DOM、生成 class 与计算宽度一致。最终源码和 static 均为 1px。

本地命令（从仓库根目录执行）：

```sh
pnpm install --frozen-lockfile
pnpm build:pkgs
pnpm --filter @weapp-tailwindcss/postcss build
pnpm --filter weapp-tailwindcss build
pnpm exec cross-env CI=1 pnpm --filter @weapp-tailwindcss/postcss test --update=none --coverage.enabled=false
pnpm exec cross-env CI=1 pnpm exec vitest run --project=weapp-tailwindcss test/uni-app-x test/uni-app-x.test.ts test/presets/uni-app-x.test.ts test/bundlers/vite-plugin.uni-app-x.unit.test.ts --update=none --coverage.enabled=false
pnpm exec cross-env E2E_PROJECT_FILTER=uni-app-x-vdom-tailwindcss-v4 E2E_ISSUE_1160_MINI=1 pnpm e2e:static:u e2e/issue-1160-static.test.ts e2e/issue-1160-mini-static.test.ts
pnpm exec cross-env CI=1 E2E_PROJECT_FILTER=uni-app-x-vdom-tailwindcss-v4 E2E_ISSUE_1160_MINI=1 pnpm e2e:static e2e/issue-1160-static.test.ts e2e/issue-1160-mini-static.test.ts
pnpm exec cross-env CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/e2e-matrix.test.ts --update=none
pnpm release status
pnpm agents:check
git diff --check
```

定向核心测试 195 通过，PostCSS 682 通过 / 3 跳过，矩阵 34 通过。
static 两项通过，基线更新后再次禁止更新重跑通过。
H5 基线记录生产 JS class 与 CSS 声明关系；
微信基线每次重新调用 HBuilderX 编译，读取真实组件 WXML / WXSS，
断言基础零宽度先于作者规则和 utility，全部 12 个 ID 均被覆盖。
`E2E_ISSUE_1160_MINI=1` 仅在安装 HBuilderX 的本地环境启用；
未设置时明确跳过，不将跳过计为微信构建通过。
基线不包含构建哈希、机器路径或设备 ID。

失败与限制：`pnpm typecheck` 有基线类型错误。
使用 TypeScript compiler host 将修改文件替换为基线内容作对照，
结果为基线 438 条、当前 438 条、新增 0 条诊断；
没有为让检查变绿而改动无关类型。构建仍有既有工具链警告，
不能描述为全仓无错误、无警告。支付宝尝试被 HBuilderX 明确拒绝：
“是 uni-app x 项目，暂不支持”，没有运行验收结论。
额外执行 `pnpm exec tsc -p e2e/tsconfig.json --noEmit --pretty false`，
E2E 目录仍有既有类型诊断；修正新增用例的依赖类型后，两个新增 static 文件均无诊断。

本地原始证据位于忽略目录 `e2e/.artifacts/issue-1160/`：

- `android-before.png`、`android-final.png`：原问题前后截图。
- `android-hmr-4px.png`、`android-hmr-restored.png`、`h5-hmr-4px.png`：增量验证。
- `weixin-current.png`、`weixin-final.png`：微信隔离组件前后截图。
- `h5-final.png`、`h5-probes.txt`：H5 最终 DOM/class/计算样式。
- `ios-final.png`、`harmony-final.jpeg`：其他原生平台最终运行截图。
- `*-final.log`、`*-structure.txt`：实际编译版本、路径和结构。
- `static-update.log`、`static-verify.log`、`core-tests.log`、`postcss-tests.log`、`typecheck-comparison.json`：本地检查。

注意：早期 `weixin-after.png` 与 `weixin-fixed.png` 是失败调查截图，
后者仍错误覆盖了 Native / Apply 的顶部边框；只有 `weixin-final.png` 为验收证据。

## 适用边界

本次复现与验收使用既有 VDOM demo，没有扩展为 Vapor 专项，
也没有将 v3/v4 单元兼容测试等同于 v3 全平台设备测试。
Windows/Linux 没有实机运行；新增产品代码不包含文件系统路径推导。
原生截图确认实际页面与各方向边框，未声称获取原生 CSSOM 计算样式。
Harmony 模拟器由本任务启动并在结束后停止。

仅为实际修改的 weapp-tailwindcss 包添加中文 patch change intent，
经仓库入口 `pnpm release status` 检查 change intent 与发布计划。Refs #1160。
后续按用户要求提交并创建 PR，继续跟进 CI/CD；不关闭 Issue，不自动合并。

PR #1163 提交后补跑全量核心测试，3412 项通过 / 35 跳过，
另有一项源码行数门禁失败：新增选项使 vite.ts 达到 508 行。
将边框选项组装迁入已有 border-preflight 模块后，行数门禁与
uni-app x 回归共 168 项通过；不提高行数阈值，也不改变边框行为。
随后全量核心复跑为 3413 项通过 / 35 跳过。

CI 的 Windows / Node 24 Issue #1144 HMR 在 add 阶段遇到
`rename temporary -> index.uvue` 的 `EPERM`；initial 和 replace 已通过。
原子替换原先只执行一次 rename，没有处理 Windows 读取句柄的短暂占用。
在同一文件替换边界为 Windows 的 EPERM/EACCES/EBUSY 增加最多 20 次、
每次 100ms 的重试；保留原文件与同一份完整临时文件，最终失败仍抛出原错误并清理临时文件。
没有退回截断写入，也没有扩大 HMR 验收超时或重试整个测试。

`CI=1 pnpm test:demo:matrix` 为 35 项通过，包含真实 watcher/Rollup 验证，
以及占用恢复、持续错误、非 Windows 错误和非重试错误的文件完整性验证。
`CI=1 pnpm e2e:demo:matrix issue-1144-uni-app-x-web:h5` 在本机通过
既有 static 基线、initial/replace/add/restore 与刷新，源码已恢复；定向 ESLint 通过。
另一个 Windows Mpx 微信任务在首次 HMR 时 watch 进程以 0 提前退出，
没有编译错误；同任务 ali/swan/tt 通过，本地 `CI=1 pnpm e2e:demo:matrix mpx-tailwindcss-v4:wx`
也通过，尚不能将 Windows 提前退出归因于文件占用修复，继续以远端复跑核实。

## 规则评估

不新增 AGENTS。现有规则已要求检查真实产物关系、组件隔离、
先复现后修复和更新 static。本次将“回放不能把基础规则排到作者规则之后”
固化为单元测试和真实微信产物回归；未将临时猜测扩散为新的平台规则。
