---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 1473cba657f4c114acb77b20185ce6ce0c9cb7ca
regressions:
  - e2e/react-native-image-evidence.test.ts
  - examples/react-native-expo/test/image-readiness.test.ts
  - examples/react-native-expo/test/semantic-phase.test.ts
  - e2e/react-native-static-entry-scope.test.ts
verification:
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

图片为固定 16×8 无色彩配置 PNG，左红右蓝，`resizeMode="stretch"`。probe 的 utility 和 reference 的手写样式都须为 44×44；无 class 的 control 为 80×40。三方必须分别收到实际 onLoad，记录当前 revision、案例、阶段、side、真实 URI 和解码尺寸。Web 同步读取 DOM 事件 target 的 naturalWidth/naturalHeight/currentSrc；Android/iOS 读取 nativeEvent.source，禁止从配置或布局宽高回填。

gate 在渲染前建立，保存缓存命中时早到的事件。回调身份保持稳定且不修改 React 状态，避免 RN Web effect 反复重载。重复事件、onError、取消或五秒加载预算失败均进入原有错误回执；onLoadEnd 不作为成功。每阶段卸载关闭旧 gate，旧回调不得解锁新实例。

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

## 适用边界

实现后的真实 Expo Web、Android/iOS 运行仍待本轮 fresh extended 预检放行后执行。合成 PNG、jsdom 事件和合同测试不计真实运行成功；总体结论保持 partial，served bundle/HMR 传输链、ScrollView、全注册组件夹具与其余 Web variant 等缺口继续登记。

## 规则评估

现有组件语义、当前安装身份、原始截图重放和预检要求足够约束此改动，不新增仓库级规则。Image 资源及配置随 fixture hash 变更，后续新增组件继续按独立生命周期和绝对 oracle 实施。
