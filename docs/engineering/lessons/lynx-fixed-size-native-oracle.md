---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: dca472231d8e390b29f786f378c99da259dbd1e4
regressions:
  - examples/react-lynx/src/compatibility/fixed-size-geometry.test.ts
  - e2e/lynx-fixed-size-evidence.test.ts
  - e2e/lynx-fixed-size-adapter.test.ts
verification:
  - claim: 同一源码的 Lynx 双端固定尺寸几何、真实 PNG 与主题恢复证据通过独立重放
    kind: native
    status: passed
    sha: 8db895c54373e20737dcc8254861f73872579aa1
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0；Android API 30 arm64-v8a、density 2.75 与 iPhone 17 Pro iOS 26.5 arm64、scale 3
    command: CI=1 pnpm e2e:tailwind --preflight-report e2e/.artifacts/preflight/b7f98809-eb17-41b6-8a8a-857b62ea500b/report.json --target lynx-android,lynx-ios
    reason: 原生采集和严格重放通过；统一入口因新旧 catalog hash 不同退出1，未将入口改记成功。已审查原件后通过正式更新器归档并刷新双端基线，全部注册能力仍未完成。
  - claim: Lynx 文档更新后的网站黄金来源完成审查，三浏览器禁止更新比较通过
    kind: integration
    status: passed
    sha: 399d635bb559cfd6a0d01369727740e1ffc7f822
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0、Playwright 1.64.1；源码固定，包含本轮已审查的 darwin 黄金登记改动
    command: CI=1 PLAYWRIGHT_HTML_OPEN=never pnpm --filter @weapp-tailwindcss/website e2e:local
    reason: 1992项通过、636项既有条件跳过，零失败零重试；仅验证网站，不覆盖剩余原生或注册能力。
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

### 8db895c 双端实际验收

第一轮扩展预检 `58410efe-ecc1-4b2f-a978-eda460639336` 在 runtime-android 因任务 shell 未继承 Android SDK 变量失败并关闭服务；未调度原生验收。确认本机已有 SDK 路径后显式传入环境变量，重新执行 `prepare --extended`，得到 `b7f98809-eb17-41b6-8a8a-857b62ea500b`。全部脚本、当前会话原生 Chrome 的读取、截图、输入、点击和完成回执以及 verify 通过，之后才启动双端统一入口。原始 JPEG 截图保留，按真实签名转换为 PNG 供门禁读取，没有把 JPEG 字节重命名成 PNG；本任务临时标签已显式关闭。

run `8c29cdaa-b86c-4fc1-a7e8-28b254463458` 的 Android 原生 screen 为392.7273×850.9091、density2.75，主体实测122.9091×23.6364；iOS为402×874、scale3，实测123×24。两端均满足独立123px与45×screenWidth/750断言、80×64参考尺寸及marker/画布像素。主代理实际查看双端probe/control四张PNG；生产 `readNativeReport` 又分别重读181份附件、字节hash、bundle、screen和主题九帧，全部通过。Android为54个supported、64个预声明拒绝；iOS为53/65。此计数是118个历史案例的既有状态，不意味着全部正向案例已具有同等级的独立语义oracle。

双端bundle分别为 `f6d4ffae349aca74085e0aacc0b8f67820f9de3c01018544fc48d7d924fb1b53` 和 `aefb7b436c46e33760f57bd7ba6f1895ffa33970aff34ca5934ebda089815608`。与已提交报告的归一化结论比较，仅catalogHash变化；支持预期、拒绝原因、checkpoint结论和版本均相同。统一入口因此在双端基线比较处各失败一次并退出1，原报告保持失败，不能由离线重放改写为入口成功。审查后用 `LYNX_IOS_REPORT`、`LYNX_ANDROID_REPORT` 指向本轮原件，执行 `CI=1 pnpm e2e:lynx:update`，正式归档至 `e2e/.artifacts/lynx-baselines/baseline-14YOZI/` 并刷新双端报告和compatibility baseline，没有手填原生参数。

原日志为 `.tmp/lynx-sizing-native.log`、`.tmp/lynx-sizing-independent-replay.log` 与 `.tmp/lynx-sizing-baseline-update.log`；独立摘要在本轮tailwind目录的 `independent-replay.json`。本轮仅选择两个Lynx目标，其余13目标未调度；能力适配器因子进程基线拒绝记录的失败继续保留。更新后的源码与基线须用新的预检再进入实际验收，不复用已消费的lease。全能力验收仍为partial，RN交付字节链及其他注册/转换/Web/微信缺口继续保留。

更新后三份报告/基线以 `CI=1`、`--update=none` 运行五文件110项定向回归通过；同步六份中英文文档中的真实设备、时间、hash和来源，16项文档合同及双语网站生产构建通过。CI默认设备仍为原配置，没有将本机模拟器事实写入工作流。

### 网站黄金来源与禁止更新比较

固定 `399d635bb559cfd6a0d01369727740e1ffc7f822` 的源码和实际双语构建，后台三浏览器正式候选采集1204项通过、602项既有视觉合同跳过，零失败零重试。历史 `bc4f4c546656a7e52f170433d7647cdb82227b23` 的黄金来源先经准确历史合同验真并完整归档；1204张候选中1191张字节相同，13张不同。主代理逐一审看22个变化区域的44份前后裁剪：8张对应中英文Lynx设备、时间、catalogHash和伴随排版变化；另5张的细微栅格差异经原生产comparator及既有 `maxDiffPixels:5` 通过，没有改变像素门槛。

正式 review、install 和 verify 均成功，旧基线归档至 `.tmp/website-baseline-history-bc4/installed-archive/archive-index.json`。之后保持源码、HEAD和构建不变，执行上述 `e2e:local`：来源管线1文件1项通过，实际Chromium/Firefox/WebKit共1992项通过、636项既有条件跳过，46.9分钟，零失败零重试；配置明确 `headless:true`、`updateSnapshots:'none'`。入口成功退出后，本轮浏览器worker、Playwright父进程和本地Worker均已退出。日志为 `.tmp/website-399d635-{comparison,raster,review,install,verify,no-update}.log`；来源审查和安装成功没有替代这次实际比较。

## 同轮性能诊断的限制

Node22.23.3下保留三次独立Mpx诊断：内置profile首次180秒超时且无有效profile；第二次Inspector在构建主动exit前未落盘；第三次在退出前停止采样，取得CPU和累计allocation profile。第三次CPU SHA256为 `4e4353681b32d051ac7b52fcddcbe283824e1f09cc9206d63069ab220b2b4b14`，heap SHA256为 `c211d09f281c9e96c61880949226fb6a8d2d4a6e338ccbf43ec4f5176e852d58`。

累计估计分配3441.339MiB中，collectCustomPropertyValues仅0.750MiB；不支持此前按猜测优化collector或clone。采样会扰动且可能触发GC，不能当RSS门禁或保留堆证明。dca当前性能CI通过不证明旧13bbea6的RSS失败根因消除；旧失败和原门槛保留，没有新增性能生产补丁或重跑取绿。

## 规则评估

通过可执行负例落实已有证据边界，不新增AGENTS。仅修改示例、验收宿主和测试编排，无公开包行为或发布内容变化，不新增发布intent。

Refs #1307, #1308, #1309
