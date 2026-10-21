---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
regressions:
  - packages/postcss/test/color-mix-alpha-semantics.test.ts
  - packages/postcss/test/modern-color-function-analysis.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/web-runtime-properties.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-processed-css-source.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-css-finalizer.unit.test.ts
  - scripts/ci/demo-matrix/color-contract.test.mjs
  - e2e/react-native-artifact-evidence.test.ts
  - e2e/react-native-phase-evidence.test.ts
  - e2e/lynx-failure-evidence.test.ts
verification:
  - claim: 当前 Mpx 与 Taro Vite 的原性能门禁仍失败
    kind: ci
    status: failed
    sha: bc4f4c546656a7e52f170433d7647cdb82227b23
    environment: GitHub Actions，准确 merge checkout 736a6f494f24d1fb186c9ee3221170a06adaabfd，固定基线三轮对照
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39564594524
  - claim: 两个 uni-app x H5 项目的三系统检查停在 production static 比较
    kind: ci
    status: failed
    sha: bc4f4c546656a7e52f170433d7647cdb82227b23
    environment: GitHub Actions，Windows、macOS、Ubuntu，Node 24，实际源码 checkout 为 PR head
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39564594932
  - claim: Lynx iOS 尚未完成应用启动，不能计运行成功
    kind: ci
    status: failed
    sha: bc4f4c546656a7e52f170433d7647cdb82227b23
    environment: GitHub Actions，iPhone 16 Pro / iOS 18.5，准确 merge checkout 736a6f494f24d1fb186c9ee3221170a06adaabfd
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39564594834/job/119104637950
  - claim: Expo iOS 的 CSS HMR 缺少第二帧，完整阶段门禁拒绝
    kind: ci
    status: failed
    sha: bc4f4c546656a7e52f170433d7647cdb82227b23
    environment: GitHub Actions，iOS 18.5，准确 merge checkout 736a6f494f24d1fb186c9ee3221170a06adaabfd
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39564594658/job/119105170208
  - claim: 原始 Expo PNG、两份完整阶段及来源经过生产 validator 离线重放
    kind: integration
    status: passed
    sha: bc4f4c546656a7e52f170433d7647cdb82227b23
    environment: macOS arm64，Node 24.18.0、pnpm 12.14.0，重读完整 CI ZIP，不启动设备或补造回执
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39564594658/artifacts/12330119852
  - claim: 当前源码的完整本地全端验收尚未完成
    kind: integration
    status: pending
    sha: bc4f4c546656a7e52f170433d7647cdb82227b23
    environment: 本地扩展 57 阶段及独立 Tailwind 15 目标
    reason: 网站专项已通过；整合后的性能、其余 CI 失败及两轮独立 extended 预检仍待完成
  - claim: 四个项目在限定同步 static 后通过生产与完整开发增量流程
    kind: integration
    status: passed
    sha: d8575ffc6325fc93bd0c0bda60902a27ccd5f56c
    environment: macOS arm64，Node 24.18.0、pnpm 12.14.0；四份本轮更新的 static 尚未提交，后台 Chromium，所有项目六阶段
    command: CI=1 pnpm e2e:demo:matrix uni-app-x-vdom-tailwindcss-v4:h5 issue-1144-uni-app-x-web:h5 web/react-rsbuild-tailwindcss-v4:web web/vue-rsbuild-tailwindcss-v4:web
  - claim: bc4 网站正式三浏览器禁止更新回归通过
    kind: integration
    status: passed
    sha: bc4f4c546656a7e52f170433d7647cdb82227b23
    environment: macOS arm64，Node 24.18.0、pnpm 12.14.0；原 5 像素阈值、零重试，1989 通过、636 既有条件跳过
    command: CI=1 pnpm --filter @weapp-tailwindcss/website e2e:local
---

# bc4 全端验收的 CI 失败与证据边界

## 症状

本记录固定 PR head `bc4f4c546656a7e52f170433d7647cdb82227b23`。最终 284 项检查为 225 成功、30 跳过、28 失败、1 取消，无排队或运行。失败含两项性能分片及其聚合门禁、两项 iOS 原生任务、六项 uni-app x H5、六项 React Rsbuild、三项 Vue Rsbuild、六项 Nuxt static 及两个上游失败汇总。另一个 Taro macOS 检查在已分配宿主的 setup-pnpm 阶段超过 30 分钟后取消，未进入 build、browser 或 matrix。没有重跑旧 head。控制工作流的 SHA、实际源码 checkout 和 PR head 分开核对，旧提交成功不能覆盖当前失败。

## 根因与纠正

### uni-app x H5 的六项 static 差异

`uni-app-x-vdom-tailwindcss-v4:h5` 与 `issue-1144-uni-app-x-web:h5` 在 Windows、macOS、Ubuntu 的实际源码 checkout 均为 bc4。六项同源失败发生在 `scripts/ci/demo-matrix/run.mjs` 的 production static 比较，尚未进入项目 dev、HMR 或 refresh。浏览器 setup 探针不代表项目页面通过。

实际产物保留基础 `rgba(236,253,245,.8)`，随后在现代 `@supports` 内保留 `color-mix(in oklab,var(--color-emerald-50,oklch(97.9% .021 166.113)) 80%,transparent)`。未知变量的 fallback 不能证明变量在运行时永久缺失，不能把整个表达式固定为 fallback 颜色。a7 的语义修复已正确保留这一分支，两份旧 H5 基线尚未同步。

该差异不支持回退未知变量保护或删除现代声明。限定修正两份 H5 static，并以原门槛禁止更新复验；小程序、原生基线不由此差异推导更新。完整项目运行仍需独立执行。

### Rsbuild Web 保留框架压缩结果

React 与 Vue 的 Web static 都仅移除了重复的 `--spacing: 0.25rem` 表示，保留框架产出的唯一 `.25rem`，九个 utility 均保留。Tailwind 原始主题使用 `0.25rem`，框架压缩后使用 `.25rem`；注册表不是最终框架资产，不能为了匹配旧快照重新补回它。Webpack 两个任务入口的回归分别检查两轮当前来源注释、映射、唯一 spacing 及 `var(--spacing)` 的实际消费。

最初两次夹具回归失败是测试模型错误：只有 webpack 来源注释和作者 `@layer`，缺少真实产物中的 Tailwind banner，导致进入待生成来源分支。补齐真实生成标识后 27 项通过；这两次失败没有作为产品红例或修改生产代码的理由。该单测不能替代 Rsbuild 的真实生命周期，因此另执行完整项目回归。

在整合源码 d8575ffc 的干净工作树先运行四项目 `--build-only`，四项均以准确预期差异失败，原日志保留在 `.tmp/static-d857-before.log`。随后单独限定四项目 `--build-only --update`，只增加两条现代颜色值、移除两条重复 spacing 值，审查后以 `CI=1` 完整不更新复验。四项目各自 production、initial、replace、add、restore、refresh 全部通过，报告在 `.tmp/static-d857-none/report.json`，后台浏览器和开发服务按 runner 的 finally 关闭，源码恢复。没有更新小程序或原生基线，也没有放宽比较器。

### Nuxt 的最终产物与独立颜色参考

Nuxt 的后续 CI 同样停在 static：九个 utility 均在，保留 rgba、`#62748e` 和 `0.25rem`，旧基线还登记了额外十六进制、变量及 `.25rem` 表示。本地在 d8575ffc 独立复现。Nuxt 显式采用 `legacy-web`，实际 entry 与两份 error CSS 的基础及现代 supports 声明都保留 `.8`，未出现后置不透明变量覆盖。Generic Web 的资产保留分支早于本 PR，旧变量基线来自 #1310；没有逐提交构建证据，不把差异归因于本次 Rsbuild 修复。

先强化 Vite finalizer 持久回归：注册表故意保留旧变量、十六进制和数值表示，框架资产使用最终 rgba、`0.25rem` 及后置作者覆盖，断言严格采用框架正文。24 项通过。再使用 d8575ffc 归档的三份真实生产 CSS，在三个后台浏览器分别与手写 rgba / 十六进制参考比较，覆盖初始、同特异性后置规则、移除后恢复，共 27 次颜色、透明度、尺寸及 display 观察全部相等。这是实际生产 CSS 的浏览器验证，不是 Nuxt 生产应用运行。脚本、报告及 PNG 在本任务 `.tmp/nuxt-production-color-review/`，另有同级 `.mjs`。初次脚本把全部 CSS 误计为三份，实际另有不含 utility 的 pages CSS；在启动浏览器前失败，纠正为扫描四份、验证三份 utility CSS，未当成产品失败。

矩阵原先只记录颜色，新增 Nuxt 独立参考并在每轮实际渲染后断言，错误颜色、背景变为不透明、缺证和替换参考均拒绝。首轮把 Canvas 结果直接与原始 RGBA 字节比较，暴露了采集模型错误：计算样式是正确的 `rgba(236,253,245,.8)`，透明底 Canvas 预乘/反预乘量化得到绿色 252。该失败在 `.tmp/static-2f612-nuxt-none/` 保留；未改产品 CSS，也未增加容差。改为在同一浏览器分别绘制实际颜色和独立 CSS 参考，严格比较四个字节，参考字符串必须与登记值相同，且两份采样都完整。

单独限定 Nuxt `--build-only --update` 后，`CI=1 pnpm e2e:demo:matrix web/nuxt-vite-tailwindcss-v4:web` 完整通过 production、initial、replace、add、restore、refresh，颜色与透明度每轮检查。准确来源为 2f61269d 加本轮 finalizer/颜色证据改动及一份 static；最终报告 `.tmp/static-2f612-nuxt-none-canvas/report.json`。只同步这一份 Web 基线，不更新其他平台或改变支持预期。

`CI=1 pnpm test:demo:matrix` 为 52 文件、397 项通过。随后补充稀疏采样数组拒绝回归，定向颜色合同为 9 项通过；没有把两次计数相加冒充一次全套执行。脚本与测试的定向 ESLint、`git diff --check`、`pnpm agents:check` 均通过。正常矩阵采样是稠密 Canvas 数组；稀疏数组保护不改变其渲染判定。

### 固定性能对照

Mpx build plugin 中位 914→976ms（+6.7834%），RSS peak 1087.445→1224.375MiB（+12.5919%），steady 1015.004→1162.109MiB（+14.4931%）。Taro Vite HMR plugin 稳态 P95 为 1751→1869ms（+6.7390%，+118ms）。保留原 5% 门禁失败，不把 GC 时序差异直接认定为泄漏或噪声。

Mpx 工件 `12329244941` 的完整 ZIP SHA256 为 `ec6bed37170efe412f3a6b7d8aba84df96aa3d23b5286db152265dd1af232b49`，Taro Vite 工件 `12330755011` 为 `b8447ceff7b447e131ba9e75f9c012680d568a84339ef48160ae06f07ea59370`。原始样本与 RSS/GC 诊断保存在本任务 `.tmp/ci-bc4-performance/`。

后续颜色 AST 复用优化见[缓存边界记录](css-hmr-cache-boundaries.md)，其单测通过不能宣称新性能门禁通过。新源码必须按相同基线、配置和固定三轮样本重新测量；不扩大重跑次数或改变阈值。

### Lynx iOS 启动失败

`simctl launch` 在 60,072.76ms 超时并收到 SIGTERM，尚未进入语义报告。35 项 runtime 证据均缺失。同期宿主负载高与可用内存少是观察，具体因果尚未证明，不能宣称产品 CSS 失败或已经排除产品问题。

工件 `12330318982` 为 1,512,619 字节、20 个 ZIP 项，完整 SHA256 为 `aea513edd68a9679695a9d7a0f8868a179ca3986ecfd9b75bef17dac79c3b581`。没有重跑或放宽启动预算。

### Expo iOS 的 CSS HMR 第二帧缺失

失败位于 revision `rn-hmr-updated-f59e0b` 的 `variant-dark/dynamic-array`，不是旧 head 的 layout-aspect。首帧 capture 9509.68ms，read 9510.44ms，decode 9635.03ms，assessment 9761.89ms；第二帧从 9863.53ms 开始，外层在 10003.73ms 超时，只完成一帧。五次后续请求是既有客户端上报重试，均 500，不构成额外成功样本。

工件 `12330119852` 为 8,205,461 字节、358 个 ZIP 项，完整 SHA256 为 `f5956b93f3fb6785e25555b1a6a945dc23f8f7f6773c680da85ee377b416b141`。失败首帧 PNG 为 131,337 字节，SHA256 为 `420070bf6478ba6e46688d2b938fcde58aa97dcd51aa17ca3d37e5efbca014d5`，与原 diagnostic 一致。

## 验证

辅助树 `ca401c2de4066be3f120dc1b6fda849c9a921195` 加本记录及未提交断言，使用真实 generator → WebCompat → uni-app x Vite transform 固定未知颜色分支。`CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/uni-app-x/web-runtime-properties.test.ts --testNamePattern '保留未知主题颜色' --maxWorkers=1 --update=none` 为 2 项通过；4 项因本次名称过滤未执行，不计通过。新断言明确验证 rgba、mix 的文档顺序及关闭 WebCompat 时的原条件，不把小程序 handler 当成 Web 生成分支。

`CI=1 pnpm exec vitest run --config e2e/vitest.e2e.config.ts e2e/lynx-failure-evidence.test.ts e2e/react-native-artifact-evidence.test.ts e2e/react-native-phase-evidence.test.ts --maxWorkers=1 --update=none` 为 3 文件、68 项通过，仅验证证据拒绝和重放合同。定向 ESLint 使用 `--no-ignore` 通过；初次未带该参数仅给出文件被忽略警告，未当成有效 lint。

整合到 d8575ffc 后，`CI=1 pnpm build:pkgs` 为 36 项成功、无缓存。完整运行 `test/uni-app-x/web-runtime-properties.test.ts`、`test/bundlers/webpack-processed-css-source.test.ts` 和 `test/bundlers/vite-css-finalizer.unit.test.ts` 为 3 文件、57 项通过，包含之前名称过滤没有执行的四项。`e2e/color-mix-alpha-browser.test.ts` 分别以 `LYNX_THEME_BROWSER=chromium`、`firefox`、`webkit` 执行，各 2 项、合计 6 项通过，保留动态切换/恢复及任意动态权重的不等价反例。所有浏览器 headless，并在 finally 关闭；这些定向语义验证不代替真实 Lynx 或微信宿主。

原始 ZIP 安全解压后，使用原 sidecar 坐标调用生产 `assessNativePair`：首帧几何、像素和 control 全部通过，像素 mismatch 为 0。对 baseline 与 TSX HMR 分别执行生产 report、artifact、encoding、phase-source validator，并重算 phase snapshot，与归档逐项相等。两阶段各 118 例（31 支持、87 预声明拒绝）、40 份回执；重新读取共 80 份 PNG/sidecar，未生成替代运行数据。

CSS HMR 只有 24 份回执，缺完成报告。完整 `validateNativeRuntimePhases` 正确拒绝：`React Native 阶段索引缺少完整协议或本轮身份`。离线结果和摘要保存在 `.tmp/ci-bc4-expo-ios-offline/`。两份完整阶段与通过首帧均不能代替三阶段成功。

宿主延迟根因仍未明。RN runner、fixture 与 workflow 相对固定基线未改，不足以据此把失败自动归为基础设施。旧 head 的一次复测授权不延伸至此 run，本轮没有重跑。

## 适用边界

Metro input 中的新 CSS 与稳定 publication 只证明输入，不能证明应用实际收到并应用了同一 bundle。两份完整阶段仍标记 `servedBundle: not-captured`。实际交付/HMR 链、Image/ScrollView、全量原生注册夹具、独立转换 oracle、剩余 Web variant 与微信几何等缺口继续单列未完成，验收保持 partial。

网站采集、来源安装与最终禁止更新验证分别登记。干净 bc4 的正式 `e2e:local` 已完成：2,625 项中 1,989 通过、636 按既有移动 Firefox/WebKit 条件跳过、零失败；详见[网站来源记录](website-visual-bc4-provenance.md)。此专项不补写旧全面流程的未执行阶段。源码稳定后，57 阶段流程与独立 15 目标各自重新执行 extended prepare、当前会话真实 computer use 和 verify，分别领取一次性 lease。旧报告不能复用。

## 规则评估

不新增 AGENTS。保留准确 head、原始失败、生产证据重放、有限重试和禁止自动改判支持范围的现有边界；优先维护持久回归及限定基线。
