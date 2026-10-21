---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 1473cba657f4c114acb77b20185ce6ce0c9cb7ca
regressions:
  - e2e/react-native-image-evidence.test.ts
  - examples/react-native-expo/test/image-readiness.test.ts
  - examples/react-native-expo/test/semantic-phase.test.ts
  - examples/react-native-expo/test/web-image-observation.test.ts
  - examples/react-native-expo/test/runtime-results.test.ts
  - e2e/react-native-static-entry-scope.test.ts
verification:
  - claim: Chromium 延迟 load、解码期间换源和失败投影先固化红回归，v2 本地回归通过
    kind: unit
    status: passed
    sha: d6544d24f11e685ba4a0fe459bc82c7a307b9638
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0；包含同批未提交 v2 实现；示例 11 文件 72 项，Image 与协议 2 文件 41 项，原生统一适配 23 项；类型检查通过；不代表新源码设备通过
    command: pnpm --filter @weapp-tailwindcss/example-react-native-expo test
  - claim: v2 static 基线禁止更新比较、三平台 Metro 导出和兼容回归通过
    kind: integration
    status: passed
    sha: d6544d24f11e685ba4a0fe459bc82c7a307b9638
    environment: 同批未提交 v2 实现；CI=1、--update=none；22 文件 303 项；static 更新仅两处 fixtureHash 与 verifiedAt，候选、raw CSS、manifest 和生成作用域不变
    command: pnpm e2e:react-native-compatibility --update=none
  - claim: Firefox、WebKit、Android、iOS 的历史完整三阶段及 Image 实际运行通过并独立重放
    kind: native
    status: passed
    sha: d6544d24f11e685ba4a0fe459bc82c7a307b9638
    environment: macOS arm64；fresh extended 预检 3ed80783-c124-487f-9aa4-2fd9e378f74f、本会话原生 Chrome computer use、verify 通过；run 40118bf8-11e9-4192-bcc9-e211e91a5c9f；每目标三阶段各 41 回执、82 帧，四目标共 492 回执、984 帧；含 Image 12 回执、24 帧；统一入口仍有 1260 注册能力 not-run，不计全面成功
    command: pnpm e2e:tailwind --preflight-report e2e/.artifacts/preflight/3ed80783-c124-487f-9aa4-2fd9e378f74f/report.json --target expo-chromium,expo-firefox,expo-webkit,react-native-android,react-native-ios
  - claim: Chromium 的 Image 阶段失败保留，不能由其它四目标的成功抵消
    kind: integration
    status: failed
    sha: d6544d24f11e685ba4a0fe459bc82c7a307b9638
    environment: 同一 fresh 预检与 run；Chromium 156.0.8078.4、headless；baseline 完成 38 回执后因延迟 load 事件 target 丢失而停止；不是样式尺寸失败
    command: pnpm e2e:tailwind --preflight-report e2e/.artifacts/preflight/3ed80783-c124-487f-9aa4-2fd9e378f74f/report.json --target expo-chromium,expo-firefox,expo-webkit,react-native-android,react-native-ios
  - claim: 原判定器缺少 Image 阶段的十三项红回归
    kind: unit
    status: failed
    sha: 1473cba657f4c114acb77b20185ce6ce0c9cb7ca
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0；同批未提交回归、生产代码尚未调整
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-image-evidence.test.ts --update=none
  - claim: 加载生命周期、组件挂载和示例回归四十四项通过
    kind: unit
    status: passed
    sha: 1473cba657f4c114acb77b20185ce6ce0c9cb7ca
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0；包含本记录同批未提交实现；jsdom 不代表设备
    command: pnpm --filter @weapp-tailwindcss/example-react-native-expo test
  - claim: Image 绝对判定、生产重放与缺失阶段拒绝十六项通过
    kind: unit
    status: passed
    sha: 1473cba657f4c114acb77b20185ce6ce0c9cb7ca
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0；包含本记录同批未提交实现；纯合成 PNG
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-image-evidence.test.ts --update=none
  - claim: Metro 三平台导出及二十二文件二百九十七项定向回归通过
    kind: integration
    status: passed
    sha: 1473cba657f4c114acb77b20185ce6ce0c9cb7ca
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0；包含本记录同批未提交实现；CI=1、--update=none；不计真实原生运行
    command: pnpm e2e:react-native-compatibility --update=none
---

# RN Image 加载与尺寸证据

## 症状

`sizing-size` 保留原 View 案例，增加独立 `image` 阶段，由真实 Image 消费同一个 `size-[44px]`。此范围只验证尺寸 utility、实际解码和内容，没有改变 `object-fit` 等已有编码拒绝，也不代表 Image 全部样式或 ScrollView 已通过。

## 根因与纠正

图片为固定 16×8 无色彩配置 PNG，左红右蓝，`resizeMode="stretch"`。probe 的 utility 和 reference 的手写样式都须为 44×44；无 class 的 control 为 80×40。三方必须分别收到实际 onLoad，记录当前 revision、案例、阶段、side、真实 URI 和解码尺寸。Android/iOS 读取 nativeEvent.source，禁止从配置或布局宽高回填。

首轮 Chromium 156 在 Image 阶段失败：RN Web 0.21.2 的 ImageLoader 捕获 DOM load Event，等待 decode Promise 完成后才转发；Chromium 派发结束时已把 target 置空。任务独占的后台 Chrome 155 最小复现亦观察到同步 target 为 IMG、decode 后 target 为 null，而同一图片仍为 16×8。Firefox、WebKit 保留 target，故不能依赖这个跨异步事件引用作为三引擎合同。

Web 改为先确认 RN 的可信 load 事件，再从该 side 当前挂载 Image ref 读取唯一 img，等待这同一图片的 decode，并读取 complete、naturalWidth/naturalHeight、currentSrc 和 src。解码前后核对宿主、图片、连接状态和两种 URI，拒绝 src 已改变但 currentSrc 暂存旧值的竞态。不会另建图片代替被测组件，也不通过配置回填尺寸。v2 加载证据记录 web-node、decode、complete 和可信事件；旧 v1 原件不能换上新 hash 后复用。

gate 在渲染前建立，保存缓存命中时早到的事件。回调身份保持稳定且不修改 React 状态，避免 RN Web effect 反复重载。重复事件、onError、取消或五秒加载预算失败均进入原有错误回执；onLoadEnd 不作为成功。每阶段卸载关闭旧 gate，旧回调不得解锁新实例。

后置 Image 失败也暴露报告投影问题：失败路径只更新当前案例，前序 38 回执的断言被静态结果覆盖，导致摘要先报首项 unverified。成功、失败改为共用逐阶段投影；缺任一预声明阶段或唯一回执仍为 unverified，失败保留原始原因和已完成断言。验证器先呈现明确失败，全部身份、完整阶段和原件门禁继续保留。

## 生产判定和回归

宿主保留原有十秒采集预算和连续两帧要求。geometry 检查三方绝对尺寸及相对 frame 的 16px 起点；pixel/control 在左右两区各取九组 3×3 色块，分别核对红蓝固定值。仅 probe/reference 相等不能通过。图片字节、组件配置和 phase 进入 fixture hash。

`validateNativeArtifacts` 重读每份 sidecar 和连续 PNG，重新调用同一个 Image 判定器。负向回归包括缺 side、重复 side、旧 revision/phase、错误 URI、解码尺寸、事件来源、伪造 loadend、双方同时错误尺寸、单色替图、删除原始加载事件，以及旧报告补当前 hash 但缺 image 阶段。

初始红回归于 `1473cba` 的未修改判定器运行：13 项失败，原因是尚无 Image phase。随后实现组件分派、加载生命周期和生产 oracle；合成 HMR fixture 同时更新加载事件的 revision，保留生产侧对旧身份的拒绝。

## 验证

本地命令：

```sh
pnpm --filter @weapp-tailwindcss/example-react-native-expo test
pnpm --filter @weapp-tailwindcss/example-react-native-expo exec tsc --noEmit
CI=1 pnpm e2e:react-native:static:update
CI=1 pnpm e2e:react-native-compatibility --update=none
```

static 基线审查仅改变 fixture hash 与生成时间，118 例候选、manifest、raw CSS、补全集合和生成作用域不变。持久比较测试会重新生成并禁止更新地检查这些字段。

v2 本地验证包含示例 11 文件 72 项、Image/协议 41 项、统一适配 23 项及兼容入口 22 文件 303 项；TypeScript 和受根配置管理的生产/e2e 文件 ESLint 通过。曾将示例测试与兼容入口依赖重建并行，导致构建窗口内找不到 source-scan dist；构建完成后按顺序重验示例通过，此编排错误单独保留，不登记为产品修复。新源码的真实五目标复验尚未执行，旧 d654 设备证据不替代它。

## 适用边界

源码 d6544d24 的四目标实际通过与 Chromium 失败已分别归档，不能转移给同批 v2 观测器修复。新修复仍须 fresh extended 预检、当前会话真实 computer use 和 verify 后重新运行。合成 PNG、jsdom 事件和合同测试不计真实运行成功；总体结论保持 partial，served bundle/HMR 传输链、ScrollView、全注册组件夹具与其余 Web variant 等缺口继续登记。

## 规则评估

现有组件语义、当前安装身份、原始截图重放和预检要求足够约束此改动，不新增仓库级规则。Image 资源及配置随 fixture hash 变更，后续新增组件继续按独立生命周期和绝对 oracle 实施。
