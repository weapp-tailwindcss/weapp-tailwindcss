---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: c0fce85fd52f554cccec41c472fe40fc639c69ea
regressions:
  - e2e/react-native-scroll-evidence.test.ts
  - e2e/react-native-scroll-sequence.test.ts
  - e2e/react-native-scroll-diagnostics.test.ts
  - e2e/react-native-layout-precision.test.ts
  - examples/react-native-expo/test/scroll-readiness.test.ts
  - examples/react-native-expo/test/report-layout.test.ts
  - examples/react-native-expo/test/semantic-phase.test.ts
verification:
  - claim: ScrollView完整协议、离线篡改、三平台Metro导出与static禁止更新比较通过
    kind: integration
    status: passed
    sha: c0fce85fd52f554cccec41c472fe40fc639c69ea
    environment: macOS arm64、Node24.18.0、pnpm12.14.0；同批未提交实现，已构建依赖包；CI=1执行兼容入口完整Vitest清单，25文件349项通过；示例81项和tsc通过；不是设备证据
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-scroll-diagnostics.test.ts e2e/react-native-phase-evidence.test.ts --update=none
  - claim: e893源码ScrollView双原生在初始内容高度校验失败
    kind: native
    status: failed
    reason: Android和iOS真实onContentSizeChange包含Float32端点差，严格整数比较拒绝；失败未补成成功报告
    sha: e893060d2be447af35edf5c31b8e032f6cfea09e
    environment: fresh extended预检fa1cd8f6、本会话原生Chrome交互和verify通过；run1e0a3ec9的Expo三引擎三阶段原件独立重放通过，双原生在scroll-initial失败；全部保持partial
    command: pnpm e2e:tailwind --preflight-report e2e/.artifacts/preflight/fa1cd8f6-1ac0-4362-9411-731eed8f8074/report.json --target expo-chromium,expo-firefox,expo-webkit,react-native-android,react-native-ios
  - claim: e57源码五目标ScrollView三阶段真实采集与独立生产重放通过
    kind: native
    status: passed
    sha: e57a24f7bba2835328af8d5ba4b8183dbc429dd3
    environment: fresh extended预检d429f4f1、本会话原生Chrome交互与verify通过；run55be121d的Expo三引擎及Android/iOS三阶段共660回执1320帧，含ScrollView45回执90帧；全部cleanup settled；各1260注册能力not-run，统一入口exit1，全面验收partial
    command: pnpm e2e:tailwind --preflight-report e2e/.artifacts/preflight/d429f4f1-dc37-4467-a302-511a959ac10d/report.json --target expo-chromium,expo-firefox,expo-webkit,react-native-android,react-native-ios
---

# ScrollView 尺寸、程序化滚动与失败原件

## 症状

已有尺寸案例只验证View和Image，不能证明ScrollView真实内容、裁剪及滚动恢复。新回归还发现初始事件序号、超时首错、安装失败投递和Android内容坐标边界缺口。

## 适用边界

`sizing-size` 复用 `size-[44px]`，独立验证 View、Image 和 ScrollView；ScrollView 包含 `scroll-initial → scroll-offset → scroll-restored` 三个阶段。仅声明 `ScrollView.style` 尺寸和程序化 `scrollTo` 可运行，不将此结论转移到触摸事件、scroll utility 或 `interaction-scroll`，后者保留原拒绝预期。

三侧 probe/reference/control 使用同次挂载，独立 mountId 在三步保持不变，内部同时检查 ScrollView、native viewport 和首条内容 ref 的真实对象身份。probe/reference 44×44，control 80×40，内容为三条48高的固定色带，总高144。先观察实际 layout/contentSize，再执行 `scrollTo(0,48,false)` 和 `scrollTo(0,0,false)`；两个动作都必须等命令之后的新 onScroll，不能用旧事件或配置尺寸回填。

判定同时核绝对尺寸、首条位移0/-48/0、红/蓝/红像素、viewport外灰色裁剪以及独立control。每步继续要求10秒内两次连续通过的真实宿主截图，保留原几何/像素/control门槛。

## 根因与纠正

初始已有事件也必须有正整数序号；超时锁定为session首错，迟到事件不能重试覆盖。安装异常进入同一失败投递通道，保留之前default/Image等已完成阶段。Android在统一坐标边界，按同侧真实无障碍树delta同时平移target和首条内容，不修改原窗口证据或事件数值。

跨phase核验成功采集后才推进账本：禁止缺步、乱序、重复、重挂载、旧事件、改变安装身份或改写历史。离线validator重读canonical `.png.json`、所有PNG帧和同一三步序列；失败 `.pair.json` 或诊断不能充当成功回执。

客户端失败在同次report携带同步冻结的部分事件账本，宿主先落盘再发布失败report，`/error`仅作兜底。被拒transition保存收到的原始窗口坐标pair。独立 `diagnostics/<宿主序号>.json` 不接受客户端路径；写入受owner、pending、revision与drain管理。写盘失败同时保留原始语义错误和写盘错误。诊断不初始化安装身份，不消耗截图预算，不补齐receipt，成功报告显式拒绝failureDiagnostic。

## 验证

- 新像素与事件oracle最初19项失败；初始序号另5项、首次超时、安装错误、缺事件和Android非零inset分别固化红回归后修复。
- 示例12文件81项通过，TypeScript `tsc --noEmit`通过。
- 已构建所需包，再以 `CI=1`、`--update=none` 运行 `e2e:react-native-compatibility` 的完整Vitest清单：25文件349项通过，包含真实Metro Web/Android/iOS导出、全部phase原件重放及篡改反例。
- `CI=1 pnpm e2e:react-native:static:update` 重新生成Expo static。审查仅两处fixtureHash与生成时间变化，generatedClassSet、rawCss、manifest及声明结果不变；正常回归禁止更新。
- 命令及原日志：`.tmp/scroll-oracle-red.log`、`scroll-sequence-red.log`、`scroll-timeout-red.log`、`scroll-install-red.log`、`scroll-android-red.log`、`scroll-compatibility-final.log`、`scroll-example-final.log`、`scroll-types-final.log`。

### e893 的五目标实际运行与失败

源码 `e893060d2be447af35edf5c31b8e032f6cfea09e` 完成本轮 extended 预检 `fa1cd8f6-1ac0-4362-9411-731eed8f8074`、当前会话原生 Chrome 交互与 verify，统一入口消费该报告，run 为 `1e0a3ec9-a8d7-4f47-886a-f61bb9b2c990`。

- Expo Chromium 156.0.8078.4、Firefox 157.0、WebKit 27.2 的 baseline、TSX HMR、CSS HMR 全部完成。每端每阶段118例（31支持、87预声明拒绝）、44回执、88帧，三端合计396回执、792帧。三个目标分别在独立进程调用生产 `validateReactNativeReport` 和 `validateNativeRuntimePhases`，重读所有PNG、sidecar、事件序列、编码和源码通过。
- Android和iOS都在 `sizing-size/scroll-initial` 被严格内容高度检查拒绝。各保留此前39对、78帧及本次原始失败诊断，没有最终成功report，不能计为ScrollView运行时通过。宿主cleanup均为settled。
- 三个Expo目标各有1260注册能力缺少独立运行时夹具；双原生失败。统一入口exit1符合实际范围，不代表全面通过。
- 更早预检 `277c41a3-ce3d-4f58-acb8-bfa7f0cb325a` 因computer use工具原始输出标识不一致被verify拒绝，已正式block关闭服务，未调度目标；没有修改失败记录放行。

### 原生 Float32 内容高度

双原生的probe实际高度为 `144.00001525878906`，control为 `143.99996948242188`，偏差分别为 `2^-16` 和 `-2^-15` dp。RN 0.81.5 的 `ScrollView._handleContentOnLayout` 直接透传内容View的layout尺寸，Fabric发送浮点布局；Yoga `PixelGrid.cpp` 分别保存float32绝对端点，再相减得到尺寸。因而不能要求这个事件按JavaScript精确整数相等。

先用原件数值固化Android/iOS两个失败回归。当前受控夹具使用固定端点包络 `B = viewport.height + expectedHeight`，表示比较界为 `ulp32(B) + ulp32(expectedHeight) / 2`，同时要求与预声明高度落在同一个物理像素格。不使用待验证的contentSize或Android平移后的坐标扩大预算。完整原数值继续归档。这是当前夹具的表示比较合同，并非一般Yoga前向误差证明；没有取得内部未舍入端点、逐位还原所有数值或求得最小误差界。

报告模式下明确禁用App外层滚动，三侧首条内容加固定阶段offset后的起点必须位于 `[0, viewport.height]`。最终在线采集和离线重算都要求viewport宽高及密度为正有限值，换算后为正安全整数像素且不超过实际PNG。Android截图可以包含额外系统inset；底部超出受控包络时保守拒绝。缺少PNG的事件预检不能充当最终成功证据。新增反例先出现11项失败，覆盖inset跨幂边界改变预算、伪大viewport及非法尺寸，再修正判定。

Web继续精确比较。原0.5dp几何、RGB ±2、双帧、内容位移、裁剪、独立control、挂载及事件身份门禁都保持；超过表示界的下一Float32、包络跨1024、±0.001dp、±一个物理像素及非有限值均有拒绝回归。比较合同进入fixtureHash，旧原件不会被新合同自动放行。static重新生成后仅两处fixtureHash及生成时间变化，rawCss、manifest和声明结果不变。新hash为 `bc36a113e871843b9e21e1b63a7d9df9f7e401955bdeb6d729e9680a75c934dd`。

同head的hosted run `39695314502` 也在此处失败：iOS三侧高度与本地完全相同；Android为144/144/143.99996948242188。两份完整artifact的SHA256分别为 `99e2d36739c517f1a338199bdfd5a150e824433668635ec22a1bd164ad75e4a3`（12391422958）和 `adf8062cb7ec75a8e7570a3541eaa8a65cd9965a88894619e5af25a763df4d61`（12391543016），均与GitHub digest一致并绑定e893。两端cleanup为settled，没有重跑碰运气。

修正后以 `CI=1 pnpm e2e:react-native-compatibility --update=none` 验证26文件386项通过，包含三平台Metro导出及正常static禁止更新比较。Expo示例13文件83项、`tsc --noEmit`、变更代码lint（示例测试显式 `--no-ignore`）通过。日志为 `.tmp/scroll-envelope-{compatibility,example-final,types,lint,example-lint}.log`。这些是本地定向回归，尚不代表修正后的原生运行成功。

### e57 修正后的五目标实际运行

源码 `e57a24f7bba2835328af8d5ba4b8183dbc429dd3` 重新完成extended预检 `d429f4f1-dc37-4467-a302-511a959ac10d`、当前会话原生Chrome交互和verify。统一入口消费该报告，run为 `55be121d-939b-4ec9-bfb3-1985999ca36e`。报告已finished，服务退出；临时Chrome页已关闭，HMR源码恢复，工作树无遗留改动。

| 目标 | 实际宿主 | 三阶段回执/帧 | ScrollView回执/帧 | 独立生产重放 |
| --- | --- | --- | --- | --- |
| Expo Chromium | 156.0.8078.4，headless | 132 / 264 | 9 / 18 | 通过 |
| Expo Firefox | 157.0，headless | 132 / 264 | 9 / 18 | 通过 |
| Expo WebKit | 27.2，headless | 132 / 264 | 9 / 18 | 通过 |
| RN Android | sdk_gphone_arm64，Android 11/API30，2.75倍密度 | 132 / 264 | 9 / 18 | 通过 |
| RN iOS | iPhone 17 Pro模拟器，iOS26.5，3倍密度 | 132 / 264 | 9 / 18 | 通过 |

baseline、TSX HMR、CSS HMR每阶段均118例、44回执、88帧。31项报告supported中26项具有运行时语义证据，另外5项仅编码支持；87项为预声明拒绝。每阶段ScrollView三步顺序完整；五目标共660回执、1320帧，其中ScrollView45回执、90帧。全部 `capture-cleanup.json` 为 `settled/pending:false`。

采集全部结束后，每目标使用独立进程调用原生产 `validateReactNativeReport` 和 `validateNativeRuntimePhases`，重新读取所有阶段PNG、sidecar、编码与源码；五个进程均exit0。原报告、phase-index及完整目标目录摘要、环境和计数保存在 [证据摘要](tailwind-rn-scroll-evidence.json)。原件位于 `e2e/.artifacts/tailwind/55be121d-939b-4ec9-bfb3-1985999ca36e/`；摘要不能替代未随Git保存的完整PNG/原件。运行日志为 `.tmp/scroll-envelope-runtime.log`，独立重放日志为 `.tmp/scroll-envelope-replay-<target>.log`。

五目标各1260项注册能力仍缺独立运行时语义夹具；统一报告均保留 `not-run/attempted:true`，入口exit1，没有被本次有限夹具成功改为全面通过。`servedBundle`仍为`not-captured`，实际bundle及HMR接收/应用链继续独立登记。旧e893双原生失败保留；本次成功只绑定e57，不转移给后续head。下一轮全面调度仍须重新预检。

## 规则评估

沿用最近e2e和Expo规则，不增加新AGENTS。事件/几何/像素与负向证据保持独立；全端设备调度继续必须使用本轮extended预检和当前会话原生Chrome交互。
