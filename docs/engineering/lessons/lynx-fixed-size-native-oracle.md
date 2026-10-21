---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: dca472231d8e390b29f786f378c99da259dbd1e4
regressions:
  - examples/react-lynx/src/compatibility/fixed-size-geometry.test.ts
  - e2e/lynx-fixed-size-evidence.test.ts
  - e2e/lynx-fixed-size-adapter.test.ts
---

# Lynx 固定尺寸的原生语义证据

## 症状

旧 `sizing-fixed` 将 `w-[123px] h-[45rpx]` 放入通用 `.compat-probe`；其 `min-height:40px` 掩盖实际高度，几何判定又只验证宽度123。历史双端报告中的40px高度不能证明45rpx有效。能力适配器此前仍将此例阻塞，不能把118例有最终状态等同于全面语义验收通过。

Lynx4.0.1固定源码 `53f070c8ce50a1661e7f6db248af9c2b04b29d81` 的 `CSSStyleUtils::ToLength` 使用原生 screen width / 750，而非可调整的根 viewport。Android参数来自同一 LynxContext 的 DisplayMetrics，除以density得到CSS单位；iOS将同一个 `builder.screenSize` 和实际 scale 绑定到 ReporterBinding。当前宿主没有调用外部虚拟 `updateScreenMetricsWithWidth:height:`，物理屏幕检查不声称覆盖该外部更新。

## 根因与纠正

- 使用独立160×96容器、无文字的蓝色主体与4px橙色标记，移除通用最小高度、padding和文本流影响，原候选原样消费。参考主体固定80×64。
- 既有 captureGeometry 桥增加原生 screen 参数，侧车和报告保存同一快照，采集前后检查一致；现有v1环境补全保留Android的wm size物理像素，iOS模拟器补全已换算为逻辑点，分别归一化后与原生快照对账；缺失、布尔、非有限、非正参数拒绝发布。旧 geometry() 返回六矩形的接口保留，主题和overflow调用不变。Lynx4.0.1的SystemInfo仅提供pixelWidth/pixelHeight，不提供screenWidth/screenHeight，不能误把runner补全归因于该API。
- 几何同时检查宽123、高45×screenWidth/750、参考尺寸、容器、位置和子标记；容差最多一物理像素加0.01。缺证保持not-tested，真实错误才判unsupported，支持预期不随失败改变。
- 离线重读两个PNG和原生JSON，核对run/bundle/实际字节摘要、报告、环境和screen，再以独立颜色/坐标验证主体、标记及背景。错误40/45/64px高度、重签错误侧车、旧run/bundle/截图、缺附件都不能通过。
- 该混合例只贡献 `authoring/sizing-fixed`，不扩散到两个utility的注册能力。合同加入catalog/fixture hash，历史报告不能冒充新证据。

## 验证

以下结果来自上述baseline加本轮修改，尚不代表该baseline已包含修复或真实双端已重验。

1. 固定尺寸几何先红：21项中14失败、7通过；实现后21通过。
2. iOS新增 `version:@YES` 原生反例先红，排除CFBoolean后通过。`CI=1 pnpm exec tsx e2e/lynx/test-evidence-store.ts ios` 与 android 同入口均通过，失败后禁止publish。
3. `CI=1 pnpm --filter ./examples/react-lynx exec vitest run --update=none --coverage.enabled=false`：23文件247项通过；同目录 `tsc --noEmit --pretty false` 通过。
4. 固定尺寸、适配器、报告、overflow、主题、static及CI路径的定向回归：9文件175项通过，之后补Android物理/逻辑单位反例。协议夹具已补完整screen与PNG，32项通过。新例已接入 `e2e:lynx` 和 `e2e:tailwind:contract`。
5. `CI=1 pnpm e2e:lynx:static:update` 重建 examples/react-lynx；审查仅catalog hash及时间改变，118例生成/编码结论不变。禁止更新模式的回归通过，未手工改写历史原生报告。

## 适用边界

`e2e:lynx` 首轮因旧协议合成夹具缺screen被正确拒绝；补全该夹具后，按失败项及未执行项分批复验，入口全部41文件810项最终通过，未重复已成功的实际构建。Android单位修正后的最终3文件57项通过。

下一步须重新完成 `prepare --extended`、当前会话真实computer use及verify，再用新宿主构建和实际双端PNG验收。未得到新证据前，验收仍为partial。

## 同轮性能诊断的限制

Node22.23.3下保留三次独立Mpx诊断：内置profile首次180秒超时且无有效profile；第二次Inspector在构建主动exit前未落盘；第三次在退出前停止采样，取得CPU和累计allocation profile。第三次CPU SHA256为 `4e4353681b32d051ac7b52fcddcbe283824e1f09cc9206d63069ab220b2b4b14`，heap SHA256为 `c211d09f281c9e96c61880949226fb6a8d2d4a6e338ccbf43ec4f5176e852d58`。

累计估计分配3441.339MiB中，collectCustomPropertyValues仅0.750MiB；不支持此前按猜测优化collector或clone。采样会扰动且可能触发GC，不能当RSS门禁或保留堆证明。dca当前性能CI通过不证明旧13bbea6的RSS失败根因消除；旧失败和原门槛保留，没有新增性能生产补丁或重跑取绿。

## 规则评估

通过可执行负例落实已有证据边界，不新增AGENTS。仅修改示例、验收宿主和测试编排，无公开包行为或发布内容变化，不新增发布intent。

Refs #1307, #1308, #1309
