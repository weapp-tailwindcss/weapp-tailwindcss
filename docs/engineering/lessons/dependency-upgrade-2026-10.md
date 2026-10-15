---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 5c9fc0dcb2e00c44742cd026e4f720b4ba647b13
regressions:
  - e2e/canonical-template-build-smoke.test.ts
  - e2e/template-contract.test.ts
  - e2e/template-framework-versions.test.ts
  - e2e/issue-uview-plus-cssentries.test.ts
  - e2e/wechat-session-boundary.test.ts
  - packages/test-helper/test/dependency-update-scope.test.ts
verification:
  - claim: 升级后的三个规范模板完成冻结安装与真实构建
    kind: integration
    status: passed
    sha: 5c9fc0dcb2e00c44742cd026e4f720b4ba647b13
    environment: macOS，Node 26.10.0，pnpm 12.9.1，包含本轮未提交依赖改动
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/canonical-template-build-smoke.test.ts e2e/issue-uview-plus-cssentries.test.ts e2e/template-contract.test.ts e2e/template-framework-versions.test.ts e2e/template-workspace-config.test.ts e2e/wechat-session-boundary.test.ts --update=none
  - claim: Vite 8 的两个 Web demo 完成构建、增量更新与刷新验证
    kind: integration
    status: passed
    sha: 5c9fc0dcb2e00c44742cd026e4f720b4ba647b13
    environment: macOS，Node 26.10.0，pnpm 12.9.1，Playwright Chromium，包含本轮未提交依赖改动
    command: CI=1 pnpm e2e:demo:matrix web/react-vite-tailwindcss-v4:web web/vue-vite-tailwindcss-v4:web
  - claim: 全端与原生设备验收尚未执行
    kind: native
    status: pending
    sha: 5c9fc0dcb2e00c44742cd026e4f720b4ba647b13
    environment: 微信 IDE、HBuilderX、iOS、Android、Harmony，包含本轮未提交依赖改动
    reason: 本轮仅执行有界依赖回归，未启动全面测试预检及设备验收
  - claim: Storybook 站点仍在既有 MDX 配置处构建失败
    kind: integration
    status: failed
    sha: 5c9fc0dcb2e00c44742cd026e4f720b4ba647b13
    environment: macOS，Node 26.10.0，pnpm 12.9.1，Storybook 10.6.2，包含本轮未提交依赖改动
    command: CI=1 STORYBOOK_DISABLE_TELEMETRY=1 pnpm --filter @weapp-tailwindcss/ui run storybook:build --disable-telemetry
    reason: Introduction.mdx 原始 JSX 未经文档插件转换；独立干净基线的 10.6.1 复现同一错误
---

# 2026 年 10 月依赖升级评估与验证

## 症状

用户要求获取最新代码并评估、升级全部依赖。2026-10-15 将原 checkout 的 main 快进 70 个提交至上述基线，随后在独立分支 `codex/upgrade-dependencies-20261015` 实施升级。

扫描仓库及七个独立模板的 1,690 个外部依赖声明，向 npm 官方 registry 查询了 439 个不同包。评估包含最新稳定版、声明范围、Node engines、peer、框架冻结策略和现有补丁；不会将不兼容主版本直接写入全部项目。

## 根因与纠正

### 升级范围

最终更新 176 条有效版本声明，另有六个模板各新增和移除一条 escape 依赖。合计 188 条有效声明变化，分布于 56 个 manifest；catalog 复用使实际只修改 15 个 manifest 和 30 条 catalog 配置。根与模板共有 155 条直接依赖实际解析版本变化，escape 增删另计。

| 依赖组 | 本轮目标版本 |
| --- | --- |
| Babel 8 | core/parser/traverse 8.0.7，generator/types 最低范围 8.0.6 |
| Oxc | parser/types 0.154.0，对齐 walker 的类型依赖 |
| SWC、PostCSS | 1.16.18、8.5.30 |
| CSS 单位转换 | pxtrans 1.0.7、rem-to-responsive-pixel 7.0.8、rule-unit-converter 0.2.6 |
| Vitest、coverage-v8、UI | 统一为 5.0.4 |
| repoctl、commitlint | 5.10.3、21.2.3 |
| Turbo、Playwright、Wrangler | 2.11.8、1.64.1、4.151.0 |
| Vite 8、Rsbuild | 8.3.4、2.2.13 |
| Storybook、Lynx rspeedy | 10.6.2、0.18.1 |
| demo | uview-plus 3.8.130、Less 4.9.1、图标及浏览器映射等 |
| 七个独立模板 | weapp-tailwindcss ^5.6.2、merge ^2.2.7；使用 runtime 的六个模板为 ^0.1.11 |

同时更新兼容范围内的 lint 配置、类型、traverse、express、fast-check、uuid、文档插件和模板工具依赖。完整版本差异以 manifest、`pnpm-workspace.yaml` 和八份锁文件为准；已有 Prettier 依赖仅更新版本，未执行其格式化命令。

Vite 8 升级明确限定为根 `vite8` alias 和 React/Vue 两个 Web Vite demo。Vite 4/5/6/7 的实际版本不变；weapp-vite 7.4.0 仍解析 Vite 8.3.1 / Rolldown 1.2.12。根的九个补丁文件及其版本、哈希和 snapshot 关联均保持一致。

### 模板 escape 解析失败

首次规范模板构建出现以下错误：

```text
Rollup failed to resolve import "@weapp-tailwindcss/escape"
from .../node_modules/@weapp-tailwindcss/runtime/dist/index.mjs
```

escape 0.0.2 的发布文件和 exports 完整。runtime 0.1.11 与 merge 2.2.7 已改用新包 `@weapp-tailwindcss/escape`；旧模板仍显式依赖 `@weapp-core/escape`。DCloud 的 `preserveSymlinks: true` 使 runtime 保持顶层软链接路径，随后无法访问 pnpm 虚拟存储中的间接依赖。Vite 5.2.8 的真实 resolver 复现了这一差异：保留软链接时 escape 为 null，使用真实路径时解析成功。

六个模板将无源码直接引用的旧 escape 依赖替换为 `@weapp-tailwindcss/escape: ^0.0.2`，重新生成独立锁文件。沿用 DCloud 的解析配置，未修改构建器或产品源码。已有[规范模板真实构建回归](../../../e2e/canonical-template-build-smoke.test.ts)在相同安装、构建入口由失败转为通过。

weapp-vite 模板升级发布包后，产物删除 Tailwind 版本注释并改变紧随其后的缩进。审查确认选择器和样式值相同后，仅更新 `e2e/__snapshots__/canonical-templates/weapp-vite-tailwindcss-v4/app.wxss`，再以禁止更新模式复验。

### Storybook 既有失败

Storybook 10.6.2 的站点构建失败：`stories/Introduction.mdx (3:0): Expression expected`，错误位于 `<Meta>`。现有 `.storybook/main.ts` 的 addons 为空，没有注册负责 MDX 编译的 addon-docs。

另建准确基线的干净 worktree，使用同一 Node/pnpm 版本完成 frozen install 与 18 个 UI 依赖包构建，再运行同一 Storybook 构建命令。基线 Storybook/react-vite 10.6.1、Vite 7.3.6 同样在转换 9 个模块后于该位置失败。官方两版相关 preset 的 MDX 注册职责也相同，确认该失败在升级前已经存在。

保留 10.6.2 补丁更新，将站点构建列为失败。UI 包构建通过不等于 Storybook 站点可用；MDX 配置与旧 blocks 导入的迁移留作独立修复。基线诊断工作树在保存日志后归档，未向其写入产品修补。

### 暂缓升级

| 依赖组 | 决策与后续条件 |
| --- | --- |
| pnpm 12.9.1 | 保持根与七个模板统一工具链；12.11.2 未发现已知不兼容，但本轮未迁移和验证工具链协议 |
| TypeScript 6.0.3 | 暂缓 TS 7；当前 typescript-eslint 要求 <6.1.0，并涉及编译器 API 迁移 |
| tsdown 0.23.0 | 0.23.1 改变 Rolldown 闭包，需另验声明、多入口和 source map |
| Rollup 4.63.5、Webpack 5.105.4 | 现有精确补丁覆盖 watcher、缓存与 HMR，升级前需迁移或证明可移除补丁 |
| Mpx CLI 2.2.30、weapp-vite 7.4.0 | 保持对应补丁；新版本需联验插件、引擎身份、watch 与运行时契约 |
| Taro、DCloud、Vue、React | 保持各项目冻结组合；latest 标签不能替代编译器、Vite、Webpack 与 Babel 的配套迁移 |
| React Native、Expo | 保持各示例已有组合；迁移需 React、Metro、原生工程和设备验证 |
| 微信 IDE CLI、automator | 保持现有协议版本；升级必须有真实 IDE 连接与会话保护验收 |
| lint-staged 17.6.0、undici 8.12.1 | 分别要求 Node >=22.22.1 / >=22.19.0，高于仓库承诺的 22.18.0 下限 |
| config-inspector 3.4.1 | 试升 3.5.0 引入 devframe/agentic peer 冲突，已还原声明和实际锁定版本 |
| boxen、del、pixelmatch、dotenv 等新主版本 | 暂缓 API、输出或 engines 迁移，保留当前兼容代际 |
| 精确固定的 Remotion、TypeDoc 插件、字体 | 保持现有版本，分别需要视频渲染、文档输出和字体基线验证 |

这些保留项包含已确认不兼容和尚未充分验证两类原因，不能统一解释为上游存在缺陷。

## 验证

所有正常 Vitest 命令均设置 `CI=1`、`--update=none`。下列结果来自基线加未提交升级改动，不代表原基线提交自身包含升级。

| 已执行范围 | 结果 |
| --- | --- |
| 根 frozen install；三个规范模板 frozen install + build | 通过 |
| Mpx、Taro Webpack、uni-app Webpack 模板 frozen install + build | 通过 |
| HBuilderX 模板 frozen install | 通过；未执行 IDE 构建 |
| core 及依赖、Lynx、postcss-calc 构建 | 通过 |
| React Native、UI 包构建 | 通过 |
| Docusaurus 文档站生产构建 | 通过 |
| Storybook 站点生产构建 | 失败；10.6.1 干净基线复现同一 MDX 错误 |
| core JS/Babel | 534 通过，2 项原有跳过 |
| PostCSS 解析、构建边界与颜色 | 19 通过 |
| PostCSS 单位转换 | 23 通过 |
| Lynx、postcss-calc | 8、216 通过；calc 有 3 项原有跳过 |
| 升级脚本、代理与范围治理 | 56 通过 |
| weapp-vite 引擎、运行时、版本契约 | 24 通过 |
| 模板构建、模板契约、uview 双平台 CSS、微信会话边界 | 42 通过 |
| React Native Babel | 4 通过 |
| React/Vue Vite 8 Web demo | 两项真实浏览器构建、首次加载、替换、新增、恢复和最终刷新通过 |
| 六个其他受影响 demo case，涉及五个项目 | static 更新与不更新复验均通过；仅 build-only，未验 HMR/设备 |

上述定向 Vitest 去重后为 926 项通过、5 项既有跳过。构建、浏览器矩阵与只读检查单独计，不纳入断言总数。

主要复现命令：

```sh
pnpm install --frozen-lockfile
pnpm install --dir templates/uni-app-hbuilderx-tailwindcss-v4 --frozen-lockfile
CI=1 pnpm --filter weapp-tailwindcss... --filter @weapp-tailwindcss/lynx --filter @weapp-tailwindcss/postcss-calc run build
CI=1 pnpm --filter @weapp-tailwindcss/ui --filter @weapp-tailwindcss/react-native run build
CI=1 pnpm --filter @weapp-tailwindcss/website build
pnpm install --dir templates/mpx-tailwindcss-v4 --frozen-lockfile
CI=1 pnpm --dir templates/mpx-tailwindcss-v4 run build
pnpm install --dir templates/taro-webpack-tailwindcss-v4 --frozen-lockfile
CI=1 pnpm --dir templates/taro-webpack-tailwindcss-v4 run build:weapp
pnpm install --dir templates/uni-app-webpack-tailwindcss-v4 --frozen-lockfile
CI=1 pnpm --dir templates/uni-app-webpack-tailwindcss-v4 run build:mp-weixin
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/js test/babel --update=none
CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/color-parser-bundle.test.ts test/rolldown-build-contract.test.ts test/tsdown-config.test.ts test/color-mix-compat.test.ts test/css-rule-matcher.test.ts --update=none
CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/unit-conversion.test.ts test/unit-duplicate-replacement.test.ts test/configured-css-units.test.ts test/units-to-px.test.ts test/units-to-px-plugin.test.ts --update=none
CI=1 pnpm --filter @weapp-tailwindcss/lynx exec vitest run --update=none
CI=1 pnpm --filter @weapp-tailwindcss/postcss-calc exec vitest run --update=none
CI=1 pnpm --filter @weapp-tailwindcss/react-native exec vitest run test/babel.test.ts --update=none
CI=1 pnpm exec vitest run -c packages/test-helper/vitest.config.ts packages/test-helper/test/update-packages packages/test-helper/test/pnpm-smart-proxy.test.ts packages/test-helper/test/dependency-update-scope.test.ts --update=none
CI=1 pnpm test:demo:matrix weapp-vite-engine-compat.test.mjs weapp-vite-runtime-contract.test.mjs version-contract.test.mjs
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/canonical-template-build-smoke.test.ts e2e/issue-uview-plus-cssentries.test.ts e2e/template-contract.test.ts e2e/template-framework-versions.test.ts e2e/template-workspace-config.test.ts e2e/wechat-session-boundary.test.ts --update=none
CI=1 pnpm e2e:demo:matrix web/react-vite-tailwindcss-v4:web web/vue-vite-tailwindcss-v4:web
```

static 重新生成和不更新复验使用同一组六个 case：

```sh
CI=1 pnpm e2e:demo:matrix --build-only --update style-injector-uni-app:mp-weixin style-injector-uni-app:h5 issue-uview-plus-cssentries:mp-weixin uni-app-vite-tailwindcss-v4:mp-weixin web/react-rsbuild-tailwindcss-v4:web web/vue-rsbuild-tailwindcss-v4:web
CI=1 pnpm e2e:demo:matrix --build-only style-injector-uni-app:mp-weixin style-injector-uni-app:h5 issue-uview-plus-cssentries:mp-weixin uni-app-vite-tailwindcss-v4:mp-weixin web/react-rsbuild-tailwindcss-v4:web web/vue-rsbuild-tailwindcss-v4:web
CI=1 pnpm e2e:demo:matrix --build-only --update web/react-vite-tailwindcss-v4:web web/vue-vite-tailwindcss-v4:web
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-uview-plus-cssentries.test.ts -u
CI=1 E2E_CANONICAL_TEMPLATE_CASE=weapp-vite-tailwindcss-v4 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/canonical-template-build-smoke.test.ts -u
```

八个 demo case（七个项目）的 static 基线及 uview 快照重生成后均无内容差异；唯一受跟踪快照变化为前述规范模板注释。运行器恢复了自身临时探针，未保留 demo 源码修改。

### 审计与锁文件

使用 pnpm 的 `audit --json` 对比，由 348 降至 337 个漏洞依赖命中：低危 23→20、中危 131→126、高危 148→145、严重 46→46。严重问题仍涉及 Taro、Expo、旧框架和文档部署的间接依赖。本轮未用不兼容全局 override 强行消除告警；审计非零退出不能记为安全检查通过。

使用 pnpm 的 `peers check --lockfile-only --json`，bad 条目由 179 降至 174，missing/conflicts 均为 0。归一后消除 6 条；新增显示 1 条 subpackage uni 的 Vite 5.2.8 要求与实际 5.4.21 不匹配，基线锁已经存在同样版本组合。RN 的 Babel 7/8 不匹配也已存在，本轮只是 8.0.6→8.0.7。最终没有发现新引入的版本不兼容，但仍有既存 peer 警告。

根 96 个 importer 的 1,621 条显式依赖与七个模板的 249 条显式依赖均核对过 specifier 和版本范围。八份 YAML 锁文件合法，工具链为 pnpm 12.9.1，九个 patch 的哈希、目标与产物关联一致。

`pnpm templates:check-pnpm`、`pnpm architecture:check`、`pnpm agents:check`、`git diff --check` 均通过。`pnpm release status` 已识别本轮中文 patch intent；其输出也包含基线原有 intent 的合并计划，本轮没有执行版本提升或发布。

原始 registry、audit、peer JSON、测试日志和 HMR 截图位于本工作树忽略目录 `.tmp/dependency-upgrade/`。持久回归与可复现命令由本文及测试文件保存，不依赖日志随仓库分发。

## 适用边界

本轮验证系统为 macOS，Node 26.10.0，pnpm 12.9.1。候选直接依赖已核对仓库 Node 22.18.0 / 24.11.0 下限；未在这些 Node 版本及 Windows/Linux 实际执行。

未运行全仓测试或全端预检，未执行微信 IDE、HBuilderX、iOS/Android/Harmony 的设备验收，也未等待远端 CI/CD。六个 build-only case 只能证明构建和静态产物；真实浏览器 HMR 结论仅适用于两个 Vite 8 demo。微信会话边界通过属于代码契约验证，不等价于真实 IDE 登录与设备测试通过。

Storybook 既有失败、保留版本的框架迁移、安全告警修复和原生全端验收需要分别安排，因此本文状态为 `partial`。

## 规则评估

不新增 AGENTS 规则。现有框架冻结、补丁治理、真实模板构建、static 基线、跨平台与会话边界已经覆盖本轮风险；沿用现有真实构建回归验证 escape 迁移，避免添加仅复述版本号的测试。
