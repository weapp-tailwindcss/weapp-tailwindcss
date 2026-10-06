---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 887e12fe224815ebb4767b56370cf04dbaf8dc2c
regressions:
  - examples/react-lynx/src/components/CaseCard.test.ts
  - examples/react-lynx/src/compatibility/native-color-scheme.test.ts
  - examples/react-lynx/src/compatibility/native-reporter.test.ts
  - e2e/lynx-rspeedy.test.ts
  - e2e/lynx-color-scheme.test.ts
  - e2e/lynx-evidence.test.ts
  - e2e/lynx-pixel-evidence.test.ts
---

## 症状

`variant-dark` 的 `.dark` 包裹层没有激活实际生成的 `prefers-color-scheme: dark` 媒体条件。utility 放在 view 上，而子 text 的默认样式已经是白色。即使截图相同，也不能由这个场景得出 Lynx 不支持深色文字的结论。

新增浏览器回归先复现浅色 probe 错误地呈现白色，再把 utility 放到真实 text 上，使用深色文字 control。修改只涉及 Lynx 示例与验收设施，没有改变共享 catalog 或公开包行为。

## 根因与纠正

- 固定 160px 画布内的两组文字使用相同内容、字体和背景，仅 probe 直接消费 utility。外部留白避免祖先圆角裁剪画布。浏览器运行浅色、深色、恢复浅色三阶段，并删除 utility 验证必要性。
- 两端宿主显式固定已有的全 UI 线程策略和初始浅色。切换颜色模式后经过引擎队列屏障，异步回主线程，再确认请求身份并刷新。不能依赖 `onPageUpdate`，纯颜色变化不一定触发布局；不能等待文字变白，否则真实不支持会被误判为超时。
- Java／Objective-C 的原生会话只接受一个 pending 请求，绑定 run、request 与所属视图。超时、销毁和迟到回调不能确认下一请求。JS 锁覆盖四帧写入以及 finally 恢复；失败不提交报告，恢复错误与原始错误一并保留。
- Reporter 原先依赖进程内的静态 view/store。旧模块排队中的调用会在执行时读到新的全局对象，甚至让旧请求失败污染新存储。现在通过 SDK 的模块参数注入每个视图独占的 `ReporterBinding`；旧模块始终只访问自身存储和弱视图，控制器销毁只失效自身绑定。报告写入、模式切换和销毁统一在主线程串行；iOS 重复加载入口也先失效旧绑定。
- 采集端和验收端共用 `light-probe`、`light-control`、`dark-probe`、`dark-control` 四帧清单。四张 PNG 均保留本轮写入回执，报告另带三份切换／恢复回执。旧两帧报告不能进入实时验收。
- 宿主解码原图，要求浅色和 control 都是同位置深色字形，深色 probe 的实心笔画变白且背景不变。文字抗锯齿随前景颜色改变，不能将浅色图推算的 alpha 直接用于白字；边缘验证颜色方向与形状，实心笔画验证白色。整图变白、移动字形、错色和缺字均不能证明支持。
- 定向运行还暴露 Rspeedy 测试把构建、encoder 日志和解码状态放在前两个测试里。过滤掉这两个测试后，后续用例读取旧文件及空日志，误把 encoder 删除的属性判为保留。共享准备移入 `beforeAll`，任意定向用例都先构建、解码本轮产物。

## 验证

- `CI=1 pnpm e2e:lynx`：112 个示例测试、142 个构建／证据测试通过。构建、真实浏览器媒体切换、删除 utility、像素反例、完整报告入口均有持久回归。浏览器显式 headless，并在 finally 关闭。
- `CI=1 pnpm exec tsx e2e/lynx/test-evidence-store.ts android` 与 `ios`：原生存储、队列屏障、超时、重复模式、迟到回调、恢复和视图生命周期测试通过。持久用例为 `e2e/lynx/fixtures/evidence-store/ColorSchemeSessionTest.java` 与同目录的 `color-scheme.test.m`。iOS helper 使用 Foundation 编译运行，不替代 UIKit 设备验收。
- Android 对更新后的宿主执行 `:app:compileDebugJavaWithJavac`，固定 Lynx 4.0.1 编译通过。iOS 更新的五个 `.m` 文件以真实 Lynx／LynxServiceAPI 4.0.1 头文件和 iOS Simulator SDK 语法编译通过；这不是完整 App 链接或模拟器运行结果。
- `CI=1 pnpm e2e:lynx:static:update` 仅更新 React Lynx 项目；118 项生成／编码结论和 catalog hash 均不变，差异只有生成时间。之后不更新的 `e2e:lynx` 再次通过。
- 类型检查、ESLint、Stylelint、`pnpm agents:check` 和 `git diff --check` 在提交前执行。

## 适用边界

固定 SDK 为 Lynx 4.0.1。Android 在全 UI 模式下 `syncFlush` 本身可为空操作，确认顺序依赖同一引擎 actor 的 Flush 和随后主线程任务；iOS 使用公开 `syncFlush`，截图要求 `afterScreenUpdates:YES` 成功返回。

这次修正的是测试触发条件和取证生命周期。尚未用更新后的宿主完成双端模拟器采集，因此保留 `partial`，不更新原生支持基线，不把浏览器效果写成 Lynx 运行时支持。

## 规则评估

不新增 AGENTS 规则。现有规则已经要求真实消费节点、同轮证据和资源归属；本次通过回归测试与每视图绑定落实这些边界。
