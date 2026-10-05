# 本地多端 E2E 验收手册

这份手册是仓库内 H5、微信小程序、Android、iOS、Harmony 本地验收的唯一流程入口。它记录的是可迁移的流程和证据要求，不记录某台电脑的绝对路径、截图或设备名称。换电脑时只需要重新配置工具链和设备 ID。

## 0. 全面测试前的强制预检

本地全面验收必须先通过微信 IDE、HBuilderX、iOS、Android、Harmony、Web 和当前 AI 会话 computer use 的全部检查。此要求也适用于 AI 手动编排的全仓测试。`pnpm e2e:runner:health` 仅是 hosted/命令版本检查，不代表全端就绪；单项回归、普通 CI 和预检自身测试无需启动全部模拟器。

### 准备与阻断

在目标 worktree 中运行：

```bash
pnpm e2e:preflight prepare
```

命令生成 `e2e/.artifacts/preflight/<run-id>/report.json`、`report.md`、探针日志和截图。每条工具命令都有超时，每个平台 worker 有总超时；出现故障时保留一次有界诊断，然后非零退出，全面测试不启动。检查失败、超时、未知、缺证、平台不支持均阻断，不能按 skip/optional 通过。

目标必须唯一：优先使用已有设备变量；多个目标时指定 `E2E_HBUILDERX_ANDROID_DEVICE_ID`、`E2E_HBUILDERX_IOS_DEVICE_ID`、`E2E_HBUILDERX_HARMONY_DEVICE_ID`。微信探针默认使用仓库微信项目的授权 AppID；使用其他有权限的项目时通过 `E2E_PREFLIGHT_WECHAT_APPID` 或 `E2E_TEMPLATE_IDE_APP_ID` 覆盖，两个别名同时设置时必须相同。预检保存实际验证的 AppID，门禁将同一绑定传给模板 IDE 阶段；缺少绑定、绑定不符或配置改变时必须重新 prepare，不以默认值补齐旧报告。微信非默认安装位置通过 `E2E_PREFLIGHT_WECHAT_CLI` 配置；Windows 指向官方 `cli.bat`。HBuilderX 使用 `HBUILDERX_CLI_PATH`、`HBUILDERX_CHANNEL` 和 `HBUILDERX_HOST`。

预检可安全启动目标明确的 HBuilderX 和指定 iOS 模拟器。微信 IDE 必须由用户预先打开、确认登录并开启服务端口；E2E 不自动启动或重启 IDE。Android/Harmony 无在线目标时，由 AI 用当前 computer use 在已安装的 Android Studio/DevEco 中启动明确的模拟器，再重新 prepare；不能安装新设备或猜测多个候选中的一个。登录、授权、组件安装或用户会话冲突交给用户处理。微信使用本轮独立的临时原生探针项目，显式采用 DevTools provider。

微信入口统一使用 `scripts/wechat/`：只读官方安装元数据和 `.ide` / `.ide-status` 服务标记，通过已有 HTTP 服务的 `/v2/isLogin`、`/v2/auto`、`/v2/close` 操作本轮项目。`E2E_PREFLIGHT_WECHAT_CLI` 仅用于识别安装，绝不执行；Linux、旧版或非标准安装可显式设置 `E2E_PREFLIGHT_WECHAT_HTTP_PORT`。IDE 配置 CLI token 时通过 `WECHAT_DEVTOOLS_CLI_TOKEN` 传入，不写入报告。服务不可用时直接阻断，无 CLI 回退。

所有 E2E 禁止退出登录、切换账号、读取/替换/刷新登录票据、清 session/all 缓存、删除用户配置或终止共享 IDE。允许编译缓存操作但不降级为全量清理。打开项目时记录原 HTTP 端口，清理只断开自己的连接并关闭原服务上的本轮项目；认证或服务失败后不再发项目请求，保留未清理现场并报告。服务端自然过期或撤销票据仍可能令 IDE 自行退出，测试不得伪造/恢复这些凭据；用户恢复后重新 prepare。根因与证据见[微信登录态保护复盘](../docs/engineering/lessons/wechat-login-preservation.md)。

第三方工具中转同样受限：HBuilderX `launch mp-weixin --compile false` 会自动调用微信 CLI，启动前还会清理本地存储，禁止使用。独立脚本默认直接运行所选 HBuilderX 安装的同套 Node 与 uni 编译器持续 watch，再由 `scripts/wechat` 连接已有 IDE；安装身份缺失或歧义直接失败。只有显式 `HBUILDERX_COMPILE_ONLY=1` 才进入静态编译，一次性编译不能替代 watch/HMR 验收。环境合同与验收边界见[HBuilderX 微信 watch 复盘](../docs/engineering/lessons/hbuilderx-wechat-watch-session.md)。

### 包源网络与代理

`release status`、安装或其他包源请求超时时，先区分 DNS、TCP、TLS 与 HTTP 响应。系统显示“网络可达”、浏览器能访问或系统代理已开启，都不能证明当前命令行进程使用了同一条网络路径。macOS 可只读检查 `scutil --proxy`，再确认已配置代理的监听状态；分别用直连和该代理访问同一个官方 registry 地址，保留首次失败与有界对照。不凭超时次数认定 registry 服务故障，也不关闭证书校验、替换官方源或硬编码域名 IP 来放行。

确认为命令行没有继承已启用的系统代理时，将下列配置放入机器本地的任务启动环境，并让 prepare、verify、全面入口及其子进程复用。不要把本机代理端口、账号或工具路径提交到仓库。

| 环境变量 | 配置要求 |
| --- | --- |
| `HTTP_PROXY`、`HTTPS_PROXY` | 使用已经验证的代理 URL；设置小写别名时与大写值保持一致 |
| `NO_PROXY` | 保留已有直连规则，补齐 `localhost,127.0.0.1,::1`，确保微信 IDE、预检服务及本地设备通信不经过外部代理 |
| `NODE_USE_ENV_PROXY` | 本仓库 Node 24 命令需要原生 `fetch` 使用代理时设为 `1` |

配置后实际验证 Node 的 HTTPS 请求与 `pnpm release status`；代理返回 CONNECT 成功不等于目标 HTTPS 成功，必须保持证书校验并取得目标响应。扩展工作流保留上述环境变量，当前预检身份不绑定代理配置，报告不能被描述为锁定了网络路径；本轮三个入口需使用同一会话环境。网络恢复后重新 prepare，之前失败的报告仍不能放行。

实际案例中，直连官方 npm 的 DNS/TCP/TLS 请求失败，已有系统代理路径正常；任务环境未继承代理导致重复超时。补齐任务环境后，官方 npm、GitHub 和 Node 原生请求取得 HTTP 200，`pnpm release status` 成功退出。此证据只证明包源网络恢复；微信自动化、截图及完整验收必须分别通过，不能由网络恢复推定。

### 当前会话的 computer use 证据

脚本探针通过后，prepare 保持前台服务，打印本轮 loopback 探针 URL。AI 必须使用当前会话实际可用的 computer use 工具：发现目标，读取页面，截图，在输入框输入页面上的 run ID，点击“验证”，再读取界面确认“完成：<run-id>”。不得用 Playwright、HTTP 请求或页面脚本代做此项；Web 脚本探针的交互不会写入 computer use 回执。

Chrome 默认使用原生应用控制入口。macOS 使用 `cua.getApp('com.google.Chrome')`；其他系统按当前工具文档，通过应用或窗口清单选择 Chrome，不照搬 macOS 的 bundle ID。需要发现应用时使用 `cua.listApps()` 或工具支持的窗口清单，不先调用 `cua.getState()`、`cua.listBrowsers()` 或专用浏览器接口作为原生控制的前置检查。

通过原生入口完成以下操作，并按下方格式保留真实工具输出：

1. 选择 Chrome 应用及目标窗口，核对当前页面；通常新建标签页，在地址栏输入本轮探针 URL，避免覆盖用户已有页面。
2. 用应用的 `getAXState()` 读取页面上的 run ID，并用 `getScreenshot()` 保存本轮 PNG 截图。
3. 根据最新可访问性树定位输入框，使用应用的 `setValue()` 或 `typeText()` 输入 run ID；读取更新后的界面，再定位并点击“验证”。
4. 再次读取界面，确认出现“完成：<run-id>”，保存输入、点击和完成状态的证据。

原生应用控制与专用浏览器接口是不同入口。`Codex auth token is unavailable` 等专用浏览器认证错误不能单独证明原生 Chrome 控制不可用。只有用户明确要求专用接口，或原生入口无法完成任务时，才排查或切换专用浏览器认证链路；不为默认原生路径要求用户登录、修改模型 provider 或反复重启应用。已失败的预检仍须记录并阻断，恢复或更换入口后重新 prepare，不复用失败报告。

普通网页自动化测试可以使用 Playwright CLI；它不能代替这里要求的当前会话 computer use 证据。原生入口同样必须满足完整交互、截图、回执和 verify 检查，不能仅凭“应用可读取”宣称预检通过。

用户正在使用 Chrome 且要求不中断其操作时，不继续抢占原生应用窗口。当前工具支持时，可通过 `cua.createBrowserTab('iab', 'about:blank', { visible: false })` 创建后台应用内标签页，再用该标签页的 `goto`、`getAXState`、`getScreenshot`、`typeText` 和 `click` 完成本轮交互。此路径仍是当前会话的 computer use，必须保存实际 provider、调用 ID、截图和完整动作结果；不能使用页面脚本、HTTP 或独立 Playwright 代做。Chrome 专用接口认证失败不代表应用内入口不可用，二者分别验证。此入口不可用时仍阻断，不切回用户正在操作的窗口。

把原始工具输出与 PNG 截图保存到本轮目录，再写入 `computer-use.json`：

```json
{
  "runId": "本轮 run ID",
  "provider": "实际工具名称",
  "sessionId": "当前 AI 会话 ID",
  "targetUrl": "prepare 打印的完整 URL",
  "observedAt": "完成最后一次界面验证后的 ISO 时间",
  "screenshot": "computer.png",
  "observations": [
    { "action": "discover", "toolCallId": "实际调用 ID", "transcript": "discover.txt" },
    { "action": "read", "toolCallId": "实际调用 ID", "transcript": "read.txt" },
    { "action": "screenshot", "toolCallId": "实际调用 ID", "transcript": "screenshot.txt" },
    { "action": "input", "toolCallId": "实际调用 ID", "transcript": "input.txt" },
    { "action": "click", "toolCallId": "实际调用 ID", "transcript": "click.txt" },
    { "action": "verify", "toolCallId": "实际调用 ID", "transcript": "verify.txt" }
  ]
}
```

证据文件必须位于本轮目录，使用相对路径；文本保留对应调用 ID、run ID 和真实结果。一条工具调用包含多个动作时可以引用同一份输出。只有回执、截图、完整动作证据、同一工作树和新鲜时间同时满足才会放行；单独写 `passed: true` 无效。这个本地门禁用于防止缺证、误用和历史报告复用，不是对恶意伪造本地文件的安全认证服务。AI 对工具输出来源的真实性负责。

若所选 computer use 入口的工具缺失、目标发现或认证失败、截图/操作不可用或无法保存证据，应立即通知用户，并用以下命令记录原始错误和结束本轮服务。报告应注明使用的是原生应用入口还是专用浏览器接口。此命令固定返回非零状态；脚本探针已失败、服务已退出时，也能补充失败记录。不能把“Playwright 可用”当作 computer use 通过。

```bash
pnpm e2e:preflight block --report <本轮-report.json> --reason "实际工具调用的原始错误"
```

### 验证、领取与恢复

在另一个终端运行以下命令，将占位路径替换为本轮报告：

```bash
pnpm e2e:preflight verify --report <本轮-report.json>
pnpm e2e:local:full-report --preflight-report <本轮-report.json>
```

需要同时执行全仓质量检查与 demo 多端验收时，使用 `pnpm e2e:demo:workflow:local --quality --preflight-report <本轮-report.json>`。`--quality` 只允许与 `--local` 一起使用；根构建、全量单测、lint、类型、架构、文档、规则和 release 检查与后续多端阶段共享同一次门禁领取，任一步失败即停止。不要嵌套两个全面入口重复领取同一报告。 本地 demo 工作流在本轮微信视觉阶段重置报告，后续 Android/iOS/H5/Harmony 合并本轮证据；最后补齐 H5、Harmony 截图，执行 `--fail-on-incomplete` 与 `0.05` 跨端差异门槛。没有对应 H5 case 的平台或模式仍需标明缺少跨端对照，不能仅凭工作流退出码宣称所有组合通过。

demo 工作流在矩阵检查后先执行 static 快照和多平台构建产物断言，再进入微信 IDE、watch HMR 和 H5。多平台构建范围固定为矩阵中 `status: ci` 的可执行 case；普通 uni-app Vite 的 H5 构建与浏览器 HMR 通过 `e2e:uni:h5` 单独执行。矩阵中登记为 local 的额外平台仍按本次任务涉及范围选择专用入口。

需要补齐独立类型、打包、脚本、模板、React Native/Lynx 原生与性能回归时，在同一个入口增加 `--extended --baseline-ref <任务起始提交的完整SHA>`，且同时保留 `--quality`。本轮预检必须从 `pnpm e2e:preflight prepare --extended` 开始；普通报告不能领取扩展流程。完成本轮 computer use 与 verify 后执行：

```bash
pnpm e2e:demo:workflow:local --quality --extended --baseline-ref <任务起始提交的完整SHA> --preflight-report <本轮-report.json>
```

扩展模式要求固定的完整提交 SHA，禁止以移动分支充当性能基线；性能命令及基线会写入阶段报告。新增阶段共享本轮门禁，任一失败均停止。独立质量检查在 static 前完成，模板构建/HMR/微信 IDE 与启动矩阵在标准 IDE 阶段前完成；标准多端截图之后串行执行 RN Web/Android/iOS、Lynx Android/iOS 和 synthetic/framework 性能门禁。canonical template 与 RN/Lynx 静态测试由 static 统一覆盖，不重复执行。

扩展模式固定 `CI=1`，清除局部用例过滤、旧二进制和原生工作目录复用配置，禁用跳过安装/构建及自动更新基线；工具路径、设备和超时配置仍需与预检一致。RN/Lynx 原生验收使用本轮绑定的 Android/iOS 模拟器；`prepare --extended`、verify、领取前会检查额外工具链，RN/Lynx 对应原生阶段前再次复查命令、版本与组件。检查遵循运行时实际选择：RN 使用 `RN_JAVA_HOME`/Android Studio JBR，Lynx 使用 `LYNX_JAVA_HOME`/`JAVA_HOME` 与 `LYNX_GRADLE`；Java 需 17 以上，当前 Lynx AGP 8.7.3 需 Gradle 8.9 以上的 8.x。Android SDK 两个环境变量同时设置时必须指向同一目录；检查所选 platform 的 `android.jar`、Lynx Build Tools 35.0.0 以及 RN 安装版本声明的 Build Tools/NDK。iOS 分别检查 RN 的 PATH `pod`、Lynx 的 `LYNX_POD` 和 `xcodegen`。工具缺失立即阻断，不自动安装；工具链预检不代表原生编译通过。历史 Issue 的特殊版本对照与人工诊断按关联改动另行执行，不属于扩展模式的默认覆盖。

视觉测试的 `DEMO_VISUAL_STYLE_ISOLATION_VARIANT` 和 IDE 的 `E2E_IDE_REQUIRE_LIVE_PAGE_VISIBILITY` 也会清除：uni-app x 恢复两种样式隔离模式，IDE HMR 恢复默认页面可见性要求。既有用例级可见性例外仍按原逻辑处理，不能将它们的产物证据描述为实时页面验收。

也可以把本轮报告交给 `pnpm e2e:demo:workflow:local --preflight-report <本轮-report.json>`。两者只能选择一个消费同一报告；再次运行必须新建预检。prepare 前台服务要保持运行，测试结束后自动释放会话和锁。

verify 会重新检查环境并合并 computer use 证据。全面入口在任何测试/构建子进程启动前，向活动预检服务领取一次性会话；所有检查必须在 15 分钟以内，且 checkout、SHA、源码、主机与相关配置一致。领取复查结束时再次验证时效和证据。修改 JSON、传入旧报告、关闭 prepare 服务均不能放行。测试进程固定已检查的设备 ID、微信 CLI、IDE host 和浏览器，进入设备阶段前再次检查；失败则停止后续调度。Web 同时检查测试默认 Chromium 与 HBuilderX 实际选用的浏览器；指定 `E2E_HBUILDERX_CHROME_PATH` 时不能回退到其他安装。HBuilderX 检查所选安装的编译器入口和运行基座，实际编译仍由门禁之后的测试验证。smoke/hmr-smoke 为独立局部验证，不构成全面验收。

SIGINT/SIGTERM 等待本次 worker 结束后清理服务与锁，不按进程名称终止其他会话；已启动的 IDE/模拟器保留，不重置设备。全面测试消费进程退出时，prepare 将本轮标记失效并退出。强制终止 prepare 留下锁时，错误会列出锁路径、run ID 与 PID：先确认该 run ID 属于本任务且 PID 已退出，再只删除这一个锁；活动或归属不明的锁不能接管。中断、源码变更、设备/IDE 切换后重新 prepare。

阻断通知使用当前对话与命令输出，至少写明：失败项、原始错误、已尝试的启动、未执行的测试、恢复动作、JSON/Markdown 报告位置。预检通过仅证明前置环境就绪，不代表编译、HMR 或业务验收通过。

## 1. 验收分层

按下面的顺序执行，上一层失败时不要直接跳到截图层：

1. **静态矩阵**：确认 demo、平台、构建脚本和覆盖状态登记正确。
2. **构建产物**：检查真实平台后缀、样式文件、safe class、source map 和动态 class。
3. **运行时结构**：确认页面已进入真实运行时，再检查 marker、背景色、文本色、圆角、间距、主题和动态 class。
4. **HMR**：在同一个运行实例中修改源码，确认增量产物、运行时结构和前后截图都发生预期变化。
5. **跨端截图**：只有 H5 与目标端都拿到有效截图且结构探针通过，才计算归一化像素差异。

“构建成功”不等于“运行时通过”，“有截图”也不等于“验收通过”。启动页、旧产物、旧 WebView 或不完整页面都不能作为证据。

## 2. 第一次换电脑的准备

### 2.1 仓库和 Node

```bash
node --version                 # 对照根 package.json 的 engines
corepack pnpm --version
pnpm install
pnpm prepare
```

本仓库统一使用 `pnpm`，不要用 npm 或 yarn。先构建被本地 HBuilderX 链路依赖的包，再运行 E2E：

```bash
pnpm --filter weapp-tailwindcss build
```

如果新 worktree 出现未追踪的包内 `dist`，只构建缺失的依赖包；不要用清理命令覆盖其他 worktree 的文件。

### 2.2 工具链

至少记录下列版本，写入本次验收记录：

- HBuilderX stable/alpha 版本和 CLI 路径。
- Android SDK platform-tools、`adb` 和设备/模拟器版本。
- Xcode、iOS Simulator、WKWebView/Safari bundle 版本。
- DevEco Studio、Harmony SDK、`hdc` 和设备/模拟器系统版本。
- 微信开发者工具版本和登录状态（仅小程序 IDE 链路需要）。
- Chrome/Chromium 版本（H5 截图链路）。

### 2.3 设备检查

先启动目标设备，再执行：

```bash
adb devices
xcrun simctl list devices booted
hdc list targets
```

预期是每个要验收的平台至少有一个 `device`、Booted 或在线 `hdc` target。没有设备时必须记录为阻塞；不得把跳过、旧截图或构建产物当作通过。

设备选择统一使用环境变量，不把本机 ID 写进源码或测试：

```bash
export E2E_HBUILDERX_ANDROID_DEVICE_ID=emulator-5554
export E2E_HBUILDERX_IOS_TARGET=simulator
export E2E_HBUILDERX_HARMONY_DEVICE_ID=127.0.0.1:5557
```

Harmony 也可以使用 `DEMO_VISUAL_HARMONY_DEVICE_ID`；截图脚本优先读取 `DEMO_VISUAL_HARMONY_SCREENSHOT_DEVICE_ID`。HBuilderX 有多个实例时，用 `HBUILDERX_CHANNEL=stable|alpha` 和 `HBUILDERX_HOST=<listhost 返回的 host>` 消除歧义。

## 3. 固定执行顺序

### 3.1 静态矩阵和快照

先验证矩阵登记和静态快照：

```bash
pnpm exec vitest run -c ./e2e/vitest.e2e.config.ts \
  e2e/e2e-matrix.test.ts

E2E_PROJECT_FILTER="<demo>" pnpm e2e:static
```

如果修改了 demo、issue 复现页或样式输出回归用例，必须重新生成对应 static 快照/产物基线，并在提交或 PR 中记录命令和项目名。没有确认预期差异时不要使用 `-u` 批量更新快照。

多平台静态产物使用：

```bash
E2E_MULTIPLATFORM_BUILD_CASE="<demo> <platform>" \
  pnpm e2e:multiplatform-build
```

检查真实输出后缀和目录，不要假设所有平台都有 `app.wxss`：小程序可能是 `app.acss`、`app.ttss`、`main.wxss` 或分包样式；App 可能是 `.debug/bundle-post/chunk`、`dist/dev/app-plus` 或 `unpackage/dist/dev/app-harmony`。

### 3.2 H5 和微信小程序

在需要使用 DevTools/automator 的机器上，先确认共享启动治理没有重复 launch：

```bash
node --import tsx scripts/check-e2e-ide-shared-launch.ts
```

HBuilderX demo 使用底层本地入口：

```bash
pnpm e2e:hbuilderx:h5
pnpm e2e:hbuilderx:mp
```

普通 Vite demo 使用项目自身的 `dev:*`/`build:*` 脚本。H5 需要浏览器页面和最终 CSS 都通过结构探针；小程序需要真实 DevTools/headless runtime、WXML 和可达样式文件都通过。小程序 IDE 链路不要反复启动 automator，同一 suite 复用连接并用 `miniProgram.reLaunch(...)` 切页。

#### 微信像素截图的显示比例

稳定版 DevTools 的截图会受模拟器「自适应」缩放与宿主窗口空间影响，接口没有返回完整截图几何。需要像素对照时，在确认属于本轮测试的项目窗口中，用模拟器机型菜单选择「显示比例 → 100%」，并保持窗口足以完整容纳模拟器。375×667 CSS 像素的模拟器在本次稳定版实现中至少需要 391×683 的内容窗口；最终仍以原图尺寸和运行时几何检查为准，不把菜单值当作通过证据。

设置按完整项目路径保存，换 worktree 或临时目录后不自动继承。E2E 不直接修改 IDE 内部存储、不增加 Tool 协议白名单、不为恢复截图重启或重置登录。截图比例失败会打印原图和运行时尺寸；#928 的像素基线还拒绝非整数采样比例。模板 smoke 可独立保存原图证据，但像素测试不能切到原图绕过裁剪。详见[截图缩放与渐变基线复盘](../docs/engineering/lessons/wechat-screenshot-pixel-alignment.md)。

### 3.3 Android、iOS、Harmony

先做 HBuilderX 本地结构/HMR，再做截图：

```bash
pnpm e2e:hbuilderx:local:android
pnpm e2e:hbuilderx:local:ios
pnpm e2e:hbuilderx:local:harmony

pnpm e2e:android:hmr
pnpm e2e:ios:hmr
```

切换 Android/iOS/Harmony 前先停止上一个 HBuilderX 运行任务，再重新 launch。确认日志出现真实运行时信号（例如 `App Launch`），并确认页面不是 HBuilderX 启动页。App 产物路径必须从 runner 输出和实际文件确认，不能把 Android 的 `app-plus` 路径套给 Harmony。

原生入口在共享 Git common dir 中按安装、机器和 host 原子登记，整个测试作用域清理成功后才释放。未解除、损坏或 owner 已退出的登记会同时阻断预检和新的原生入口，不能换项目、平台、版本或报告目录重跑绕过。停止未知时保留现场；不存在强制跳过或自动过期解除。该保护仅覆盖共享此 Git common dir 的仓库脚本，不控制其他仓库或人工 IDE 任务，详见[持久门禁复盘](../docs/engineering/lessons/native-session-persistent-guard.md)。

Harmony 的项目身份由 `scripts/hbuilderx-app-project.ts` 按本轮绑定 host 的版本选择。Alpha 5.31 起使用 `fs.realpath` 后的真实根作为 `--project` 与 cwd，不注册或关闭这个真实项目；其他版本和 Android/iOS 保留独占别名兼容入口。核对 `[hbuilderx-app-project]` 中的 `kind`、`projectRoot`、`launchProject` 与实际编译输出路径一致，不能将同名项目、符号链接目录或旧预检版本当作身份依据。该模式消除仓库引入的 Harmony 根路径别名，但不证明 IDE 内部 native 任务已停止；停止或 fallback 状态未知时仍按[取消边界记录](../docs/engineering/lessons/harmony-cancel-alias-boundary.md)保留现场并阻断后续调度。真实对照的证据要求见[路径身份复盘](../docs/engineering/lessons/harmony-canonical-project-root.md)。

### 3.4 视觉报告

单端排障优先使用过滤和单平台参数，避免前一次运行覆盖另一平台证据：

```bash
DEMO_VISUAL_FILTER=<demo> \
pnpm exec tsx scripts/demo-visual-e2e-report.ts --h5-only --fail-on-incomplete

DEMO_VISUAL_FILTER=<demo> \
pnpm exec tsx scripts/demo-visual-e2e-report.ts --weapp-only --fail-on-incomplete

DEMO_VISUAL_FILTER=<demo> \
pnpm exec tsx scripts/demo-visual-e2e-report.ts --android-only --fail-on-incomplete

DEMO_VISUAL_FILTER=<demo> \
pnpm exec tsx scripts/demo-visual-e2e-report.ts --ios-only --fail-on-incomplete

DEMO_VISUAL_FILTER=<demo> \
DEMO_VISUAL_HARMONY_DEVICE_ID=<device-id> \
pnpm exec tsx scripts/demo-visual-e2e-report.ts --harmony-only --fail-on-incomplete
```

Issue 或跨端验收使用统一门槛：

```bash
DEMO_VISUAL_FILTER=<demo> \
DEMO_VISUAL_MAX_CROSS_PLATFORM_DIFF_RATIO=0.05 \
pnpm exec tsx scripts/demo-visual-e2e-report.ts --fail-on-incomplete
```

报告和截图默认位于：

```text
e2e/.artifacts/demo-visual/full/report.json
e2e/.artifacts/demo-visual/full/report.md
e2e/.artifacts/demo-visual/full/screenshots/<demo>/<platform>/
e2e/.artifacts/demo-visual/full/diffs/
```

`ratio <= 0.05` 只表示像素差异通过门槛，不能替代结构探针。缺少 H5/目标端任一截图、页面未就绪、marker 不匹配或结构探针失败时，必须判定为未完成。

## 4. 结构探针和截图判定

每个跨端 case 至少检查：

- `template corpus radial`。
- `space item 1`、`space item 2`。
- `apply corpus`。
- `issue 902 theme variable`。
- 关键背景色、文本色、圆角、间距、字体尺寸和动态 class。

App 端同时检查 transformed output、compiled style output 和真实截图。raw class 只能作为兼容探针；最终产物优先检查 safe class，例如 `dark_cbg-*`、`text-_b..._B`。H5 通过浏览器计算样式和结构探针，小程序通过 WXML/运行时节点和 reachable style 文件，Harmony 通过 `hdc` 截图和 runner 结构探针。

HMR 必须满足三件事：增量产物包含新 class、运行时页面发生预期变化、前后截图存在可解释的 diff。只有产物变了但截图没变，或截图变了但 marker 不对，都不能判定 HMR 通过。

普通 uni-app Vue3 的 App 用例显式使用 `updateMode: 'native-reload'`：HBuilderX 5.26 在 `app-service.js` 变化时可能全量同步并重启应用生命周期。这类结果单独作为平台原生热重载验收，仍检查本轮产物、运行时和截图，报告记录 `App Launch` 次数，不计入纯 HMR 步数。默认模式仍是 `hmr`，uni-app x 与 Harmony 不自动放宽；两种模式均拒绝更新失败和重装。实现及回归见 `e2e/hbuilderx-local/hmr-lifecycle.ts`、`e2e/hbuilderx-hmr-lifecycle.test.ts` 和 `e2e/demo-visual-update-mode.test.ts`。

## 5. VDOM、Vapor 和 Harmony 特别规则

- HBuilderX 日志中的 `VDOM模式` 或明确的 Vapor 标识才是模式证据；不要根据文件名猜测模式。
- 当前仓库 runner 有 Harmony VDOM 本地链路，但没有通用的 Vapor CLI 切换参数。没有独立 Vapor 日志和截图时，PR 必须写“Vapor 未取得”，不能把 VDOM 结果代替 Vapor。
- Harmony 常见输出包括 `unpackage/dist/dev/.app-harmony`、`unpackage/dist/dev/app-harmony`、`.uvue/app-harmony` 和 HBuilderX 临时 chunk；以本次 runner 实际发现的 ready output 为准。
- `hdc list targets` 为空、HBuilderX 无法启动目标、ArkTS 编译失败或截图停留在启动页，均属于设备/工具链阻塞，不要修改验收阈值掩盖问题。

## 6. 常见阻塞的记录方式

先判断分歧发生在哪一层：

1. **工具链**：CLI、设备、模拟器、IDE 登录或端口不可用。
2. **编译器**：HBuilderX/UTS/ArkTS 报语法或平台限制。
3. **构建图**：产物缺失、样式入口未进入构建图、source map 不完整。
4. **运行时**：页面未就绪、旧基座、旧 WebView、runtime bridge 或 marker 失败。
5. **视觉探针**：页面可见但颜色/圆角/间距/主题/HMR 未达到预期。

例如 `Invalid declaration: '!'` 是 HBuilderX/UTS 对前置重要修饰符的编译阻塞，不应被误写成 weapp-tailwindcss 样式合并失败；`/uvue.wxss` 缺失是 style isolation 资源解析阻塞；H5 theme-dark、Android HMR 或 iOS marker 失败应分别记录具体探针和截图路径。

每次阻塞至少记录：

```text
平台与模式：
demo：
命令：
工具链版本：
设备 ID：
首次失败层级：工具链/编译/构建图/运行时/视觉
原始错误或探针：
已生成产物：
截图/报告路径：
是否可由另一台电脑复现：
```

## 7. 证据和提交前检查

提交前运行：

```bash
git status --short --branch
git diff --check
pnpm exec vitest run -c ./e2e/vitest.e2e.config.ts e2e/e2e-matrix.test.ts
```

只提交源码、测试、规则/手册和必要的 changeset。`e2e/.artifacts`、设备截图、HBuilderX 临时目录和本机日志默认不提交；在 PR 中提供报告路径、命令摘要和阻塞原因即可。所有新增 demo 或 static fixture 的改动必须同时更新对应基线。

这份手册发生流程变化时，先修改本文件，再同步根 `AGENTS.md`/`e2e/AGENTS.md` 的入口或约束；不要把同一条设备经验复制到多个互相漂移的文档中。
## IDE 手动启动后的 Web 自动验收

原生 HBuilderX 工作流只接受手动触发；PR 继续运行三系统 × Node 22/24 的 portable 回归。已知 CLI 间歇挂起独立记录，手动工作流失败仍保留失败状态。

针对 #1170 / #1144，可在独立且复现项目没有未提交修改的 worktree 中运行：

```sh
pnpm e2e:hbuilderx:attach --case 1170-LF --channel alpha --url http://localhost:5173/ --log ./e2e/.artifacts/ide-current.log
```

入口先构建当前依赖、备份源码并准备场景，然后输出项目绝对路径。此时在对应版本的 HBuilderX 打开该项目，停止该项目旧运行，通过「运行到浏览器」启动，确保 URL 与参数一致。验收器最多等待 5 分钟，确认服务启动时捕获的本轮标识后自动连接；请勿在验收期间编辑项目文件或启动另一轮验收。

浏览器断言完成后，终端会提示导出日志。将本次 IDE 控制台完整日志保存到 `--log` 指定的文件（UTF-8、项目源码目录之外），包含 `[wt-ide-version]` 记录的 IDE 注入版本、原生编译器版本、VDOM 模式及本轮 `[wt-acceptance]`、`[wt-acceptance-complete]` 两个标识。仅当日志与浏览器证据均通过时报告成功；旧日志、缺失版本、Vapor 输出或未完成的日志不能代替验收。

分别选择 `1170-LF`、`1170-CRLF`、`1144-options`、`1144-setup`，stable/alpha 各独立执行两轮。每个场景都先准备，再经 IDE 重新启动，以区分首次加载与增量。#1170 每轮验证 6 次文字保存、3 次类替换及每次刷新；#1144 复用 16 次保存和刷新断言。

结果写入 `e2e/.artifacts/hbuilderx-attach/`，包含提交 SHA、系统、实例身份、CSS、截图、计算样式、浏览器诊断和 IDE 日志。验收器只关闭自身创建的浏览器并恢复源码，不关闭 IDE、不终止外部服务、不发送 CLI 请求。完成后由操作者在 IDE 停止本次运行。

强制中断后，使用终端打印的恢复账本路径：

```sh
pnpm e2e:hbuilderx:attach --recover <恢复账本路径>
```

恢复前逐文件校验内容；发现外部修改时保留账本和文件，人工比对后处理，不强制覆盖。Windows 尚未取得实际交互桌面证据时标记“待验收”；macOS、portable 或合成服务测试通过均不能代替 Windows 原生证据。连接模式通过也不代表 CLI 启停挂起已解决。

GUI 控制台不保证输出 CLI 的 `HBuilderX Version:` 行。连接验收插件只将真实 `HX_Version` 元数据以 `[wt-ide-version] <本轮标识> <版本>` 写入控制台，并随启动身份保存；缺失元数据时仍失败，不从用户输入的 channel 推导版本，也不伪造 CLI 日志。
