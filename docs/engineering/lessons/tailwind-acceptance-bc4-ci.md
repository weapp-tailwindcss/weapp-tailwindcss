---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
regressions:
  - packages/postcss/test/color-mix-alpha-semantics.test.ts
  - packages/postcss/test/modern-color-function-analysis.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/web-runtime-properties.test.ts
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
    reason: 网站正式禁止更新验证仍在执行；性能修复与新增夹具尚待整合、准确 head 验证及两轮独立 extended 预检
---

# bc4 全端验收的 CI 失败与证据边界

## 症状

本记录固定 PR head `bc4f4c546656a7e52f170433d7647cdb82227b23`。截至本轮审查，发现两项性能分片及其聚合门禁、两项 iOS 原生任务和六项 uni-app x H5 static 失败。控制工作流的 SHA、实际源码 checkout 和 PR head 分开核对，旧提交成功不能覆盖当前失败。

## 根因与纠正

### uni-app x H5 的六项 static 差异

`uni-app-x-vdom-tailwindcss-v4:h5` 与 `issue-1144-uni-app-x-web:h5` 在 Windows、macOS、Ubuntu 的实际源码 checkout 均为 bc4。六项同源失败发生在 `scripts/ci/demo-matrix/run.mjs` 的 production static 比较，尚未进入项目 dev、HMR 或 refresh。浏览器 setup 探针不代表项目页面通过。

实际产物保留基础 `rgba(236,253,245,.8)`，随后在现代 `@supports` 内保留 `color-mix(in oklab,var(--color-emerald-50,oklch(97.9% .021 166.113)) 80%,transparent)`。未知变量的 fallback 不能证明变量在运行时永久缺失，不能把整个表达式固定为 fallback 颜色。a7 的语义修复已正确保留这一分支，两份旧 H5 基线尚未同步。

该差异不支持回退未知变量保护或删除现代声明。限定修正两份 H5 static，并以原门槛禁止更新复验；小程序、原生基线不由此差异推导更新。完整项目运行仍需独立执行。

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

原始 ZIP 安全解压后，使用原 sidecar 坐标调用生产 `assessNativePair`：首帧几何、像素和 control 全部通过，像素 mismatch 为 0。对 baseline 与 TSX HMR 分别执行生产 report、artifact、encoding、phase-source validator，并重算 phase snapshot，与归档逐项相等。两阶段各 118 例（31 支持、87 预声明拒绝）、40 份回执；重新读取共 80 份 PNG/sidecar，未生成替代运行数据。

CSS HMR 只有 24 份回执，缺完成报告。完整 `validateNativeRuntimePhases` 正确拒绝：`React Native 阶段索引缺少完整协议或本轮身份`。离线结果和摘要保存在 `.tmp/ci-bc4-expo-ios-offline/`。两份完整阶段与通过首帧均不能代替三阶段成功。

宿主延迟根因仍未明。RN runner、fixture 与 workflow 相对固定基线未改，不足以据此把失败自动归为基础设施。旧 head 的一次复测授权不延伸至此 run，本轮没有重跑。

## 适用边界

Metro input 中的新 CSS 与稳定 publication 只证明输入，不能证明应用实际收到并应用了同一 bundle。两份完整阶段仍标记 `servedBundle: not-captured`。实际交付/HMR 链、Image/ScrollView、全量原生注册夹具、独立转换 oracle、剩余 Web variant 与微信几何等缺口继续单列未完成，验收保持 partial。

网站采集、来源安装与最终禁止更新验证应分别登记，不把新候选生成等同于正式回归通过。源码稳定后，57 阶段流程与独立 15 目标各自重新执行 extended prepare、当前会话真实 computer use 和 verify，分别领取一次性 lease。旧报告不能复用。

## 规则评估

不新增 AGENTS。保留准确 head、原始失败、生产证据重放、有限重试和禁止自动改判支持范围的现有边界；优先维护持久回归及限定基线。
