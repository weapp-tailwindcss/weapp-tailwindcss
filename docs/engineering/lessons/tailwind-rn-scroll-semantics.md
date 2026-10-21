---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: c0fce85fd52f554cccec41c472fe40fc639c69ea
regressions:
  - e2e/react-native-scroll-evidence.test.ts
  - e2e/react-native-scroll-sequence.test.ts
  - e2e/react-native-scroll-diagnostics.test.ts
  - examples/react-native-expo/test/scroll-readiness.test.ts
  - examples/react-native-expo/test/semantic-phase.test.ts
verification:
  - claim: ScrollView完整协议、离线篡改、三平台Metro导出与static禁止更新比较通过
    kind: integration
    status: passed
    sha: c0fce85fd52f554cccec41c472fe40fc639c69ea
    environment: macOS arm64、Node24.18.0、pnpm12.14.0；同批未提交实现，已构建依赖包；CI=1执行兼容入口完整Vitest清单，25文件349项通过；示例81项和tsc通过；不是设备证据
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-scroll-diagnostics.test.ts e2e/react-native-phase-evidence.test.ts --update=none
  - claim: 新源码ScrollView五目标真实运行尚待fresh预检
    kind: native
    status: pending
    reason: 本批ScrollView实现尚未完成独立extended预检和设备运行，前轮Image证据不能转移到新源码
    sha: c0fce85fd52f554cccec41c472fe40fc639c69ea
    environment: 不复用前轮Image预检和设备结果；全面验收partial
    command: pnpm e2e:preflight prepare --extended
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

这些回归和合成PNG只验证协议与判定器，不代表设备已运行。当前提交的五目标真实ScrollView结果需要重新完成extended预检、当前会话原生Chrome交互及verify后记录。前轮Image的真实五目标证据不能转移到本轮源码。全面验收保持partial，served bundle/HMR接收应用链及全注册能力等缺口继续保留。

## 规则评估

沿用最近e2e和Expo规则，不增加新AGENTS。事件/几何/像素与负向证据保持独立；全端设备调度继续必须使用本轮extended预检和当前会话原生Chrome交互。
