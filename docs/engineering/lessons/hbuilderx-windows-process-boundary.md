---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1170
baseline: 8a71397c9d3f8a799a64e6e8f418c7847818d9fb
regressions:
  - packages/hbuilderx-runner/test/process.test.ts
  - packages/hbuilderx-runner/test/log-output.test.ts
  - packages/hbuilderx-runner/test/discovery.test.ts
  - packages/hbuilderx-runner/test/discovery-windows.test.ts
  - packages/hbuilderx-runner/test/host-connection.test.ts
  - e2e/hbuilderx-project-alias.test.ts
  - e2e/issue-1144-stable.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/style-reference-paths.test.ts
---

# Windows HBuilderX 进程参数边界

## 公开 CI 案例与当前诊断边界（2026-09-09 核实）

HBuilderX 有公开的 CI 使用案例，不能把当前 Windows 间歇挂起概括为“不支持 CI”。

- [官方 CLI 概述](https://hx.dcloud.net.cn/cli/README)明确说明 Linux CLI 于 2025 年 1 月推出，用于持续集成、自动化发布；目前官方说明测试过 Ubuntu。这是原生 CLI 的支持路径，不是可视化编辑器。
- [官方运行模式说明](https://hx.dcloud.net.cn/cli/launch-app?id=launch-ui)说明 HBuilderX 5.11+ 的默认 `--ui false` 在终端完成编译与运行，适合 CI、脚本自动化；`--ui true` 由 IDE 界面接管。不能依据早期文章断言当前所有 CLI 工作都要求交互桌面。
- [DCloud 社区 Windows/Jenkins 对照](https://ask.dcloud.net.cn/question/139056)：作者在同一 Windows 10 机器上，以 SYSTEM 或登录用户启动 Agent 服务均失败；在登录桌面通过 JNLP 或 `java -jar agent.jar` 启动 Agent 后发行成功。同帖还报告多条 CLI 命令中途卡住，官方回复只说明未复现，没有给出通用根治补丁。更换服务用户名不等于切换到交互会话。
- [KOPS 实践记录（2024-04-10）](https://www.kops.cc/archives/hbuilder-project-build-with-container.html)描述 Linux Jenkins 调用 Windows Jenkins、后者运行 HBuilderX CLI 的真实架构，也报告偶发打不开项目、需重启 IDE。作者最终迁移普通 uni-app 到 Vue CLI；这不能替代本任务 uni-app x 的 Windows 原生 HMR 验收。文中“仅支持 Windows/macOS”早于官方 Linux CLI，现已过时。
- [公开 Actions 配置](https://github.com/schizobulia/cli-test/blob/fc186b4a390fc6ca74bb2c3c29f226fa827a794a/.github/workflows/hx-build.yml)确实调用官方 Linux HBuilderX 的 `open`、`project open` 与 `launch app-android --compile true`，但查询到的最近 7 次运行全部 cancelled；只能证明有人尝试集成，不能当作稳定运行的证据。

当前现场已有 Windows IDE/Chrome 窗口，挂起时新 CLI 的只读命令仍能响应；因此服务会话问题只能作为待排查条件，不能直接认定是本次根因。新增现场记录包含 runner/CLI/IDE 的 SessionId、诊断进程的 UserInteractive、原生线程状态与 WaitReason。初始化 `version` 超时也在杀死原客户端前采集，不再只留下空日志。线程等待本身不证明死锁，后续仍需结合等待链或调用栈定位具体请求；该改动只加强证据，不改变超时判定、重试策略或产品 runner。

## 症状

扩展 #1170 / #1144 验收时，真实 Windows Node 22、24 均暴露 runner 的进程参数缺陷：
带空格的脚本路径被截断，Node 报找不到临时目录中的 `hbuilderx`，`a&b` 的后半部分被 cmd 当作独立命令执行。
原有超时回归也因为脚本被 shell 解析而提前失败。同提交的 Linux/macOS × Node 22/24 均通过。
修复前运行：[34240275773](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34240275773)。

## 根因与纠正

`spawnCommand` 对所有 Windows 命令启用 `shell: true`，破坏了原生可执行文件的参数数组边界。
改为 `cross-spawn`：原生可执行文件直接启动，pnpm 等 cmd shim 经过专门的 PATH/PATHEXT 解析和参数转义。
原生进程不存在时，将 error 事件写入命令日志，再经 close 和既有错误分类返回，避免未处理事件终止调用方。
这属于 runner 的实际跨平台缺陷，不是 #1144 原始 setup 启动超时的已证实根因。

## 验证

- 本地 `CI=1 pnpm --filter @weapp-tailwindcss/hbuilderx-runner test --update=none`：21 通过，Windows cmd shim 用例在 macOS 明确跳过。
- `pnpm --filter @weapp-tailwindcss/hbuilderx-runner build`：ESM/CJS 与声明构建通过。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hbuilderx-project-alias.test.ts e2e/issue-1144-runner.test.ts --update=none`：14 通过。
- macOS HBuilderX 5.25-alpha 使用中文、空格与 `&` 项目别名，Options/setup 共 32 次保存、4 次刷新通过。日志为忽略目录中的 `verify-1170-1144/macos-runner-fix.log`。
- `pnpm install --frozen-lockfile`、`actionlint .github/workflows/uni-app-x-regression.yml` 通过。lockfile 只保留目标 importer 和新增类型依赖，未混入无关 peer hash 重排。
- 单独 runner 的 `tsc --noEmit` 仍受既有环境变量索引访问与旧测试类型错误影响；新增进程测试没有类型诊断，声明构建通过，不能声称整个包的严格类型检查通过。

后续 Windows 修复后、三系统与真实 IDE 的最终状态以 [PR #1172](https://github.com/sonofmagic/weapp-tailwindcss/pull/1172) 的对应提交检查为准。原始样式证据和历史启动异常见 [独立验证记录](issues-1170-1144-latest-verification.md)。

## UNC 引用与既有跨平台用例

修复后的 Windows Node 22/24 runner 均已通过 22 项，见
[34241610924](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34241610924)。随后扩大到全部 uni-app x 测试，
暴露 8 个把 `/project` 固定为 POSIX 文件系统路径的既有用例。Windows 会为这种宿主根路径补齐盘符，
mock module graph 也必须使用同一个绝对文件路径身份；本次调整测试的文件路径与路由构造，保留原来的 HMR/CSS 语义断言。

继续扩展到 UNC 后发现实际解析遗漏：Web/Harmony 各自的盘符检测都不识别共享根目录。
在非 Windows 宿主解析 `\\server\share` 或 `//server/share` 模块时，会落入本机 cwd 或丢掉开头的共享标识。
同一组 16 项用例修复前 4 项失败、修复后全部通过，覆盖盘符、UNC 两种分隔符、中文空格、宿主根目录与相对路径。
两条链路现共用 `resolveStyleReferencePath`，先按来源路径语义解析，再在 CSS 引用边界统一为 `/`。
这不改变宿主文件系统对 `/project` 的正常解析，也不增加源文件扫描或构建后写盘兜底。

主包重新构建后，`CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/uni-app-x test/bundlers --update=none`
通过 126 文件、1537 项。使用 `E2E_ISSUE_1170_STATIC=1` 运行 #1170/#1144 static `-u`，三个生产用例通过且基线无变化；
再单独执行 `--update=none` 复验，原始日志前缀为 `verify-1170-1144/path-fix-*`。

## 适用边界

原生参数用例覆盖中文、空格、空参数、尾部反斜杠、引号、括号、管道、`&` 与字面量环境变量表达式；Windows 另测 PATH 下的 cmd shim。
Windows IDE 每个版本重复两轮完整场景，失败保留现场且不自动重试。Server 2025 的结论不冒充用户 Windows 11 原机、Vapor 或原生 App 验收。
本次没有改 demo 或样式 fixture；此前新增 #1170 的 static 基线已重新生成并以禁止更新模式通过。

## Windows 实例发现与连接边界

现代 Windows 不一定安装 WMIC。旧实现查询失败直接返回空列表，导致 runner 对已有 IDE 再次执行 `open`。
现改为 Windows 自带 PowerShell 与进程 API，使用 JSON 传递路径，避免 CSV 丢失逗号、中文或 UNC 路径；
查询错误与有效空列表分开处理。实际 Windows 回归创建位于中文、空格、逗号和 `&` 目录的临时
`HBuilderX.exe`，确认无 WMIC 时仍能找到同目录 CLI，并只清理测试自身进程。

真实 IDE 压测进一步暴露：即便改用进程 API，PowerShell 查询仍可能超时。
因此不能让显式配置路径的连接依赖操作系统进程枚举。内部将路径选择与 host 握手分开：
显式 candidate/环境变量直接定位 CLI，使用 `listhost` 和 `version --host` 确认实例；
只有有效空列表才执行一次 `open`，随后等待 host 注册。命令失败、超时、版本不匹配和歧义都不会触发重复启动。
未配置路径时仍通过运行进程发现安装位置。只返回路径的 `resolveHBuilderXCli` 对显式配置不再枚举进程；
需要 `isRunning` 元数据的 `resolveHBuilderXCliInfo` 保留真实探测语义。两类 API 分别覆盖，避免单纯读取路径竞争 PowerShell 查询。

`host-connection.test.ts` 覆盖显式 candidate/env、已有 host、空列表后注册、只启动一次、版本不匹配、
多个 host、显式绑定、CLI 失败、超时、缺失 candidate 和统一截止时间。
本地 runner 42 项通过、2 个 Windows 专用用例跳过，ESM/CJS 与声明构建通过。
[34251949634](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34251949634) 的前一版发现实现
已经通过三系统 × Node 22/24，但 Windows stable 在查询时超时，alpha 第二场景在编译服务创建前超时。
这些失败不能当作样式问题复现，也不能因个别场景通过而声称连续原生验收完成。
host 连接实现 `52dcaed93` 在 macOS alpha 完成两轮、8 个场景，共 100 次保存和 44 次刷新，全部通过。
命令为 `CI=1 HBUILDERX_CHANNEL=alpha E2E_ISSUE_1170_WEB=1 E2E_ISSUE_1144_ALPHA=1 E2E_WINDOWS_REPEATS=2 E2E_WINDOWS_CASE=all node scripts/ci/issue-hbuilderx-verify.mjs`，CLI 路径由环境变量传入。
日志为 `verify-1170-1144/macos-host-handshake.log`；Windows 最终原生结果待补充。

## 首次界面与测试环境就绪

[34255683114](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34255683114) 将 setup 放到最前面：
alpha 的 setup、LF 通过，CRLF 在编译器创建前失败；stable 的首个 setup 失败。
这排除了“只在第四次启动失败”的固定解释，也不能把源码 setup 当作必现触发条件。
同一提交在 macOS 完成 setup 优先的两轮 8 场景、100 次保存、44 次刷新，日志为 `macos-setup-first.log`。

stable 的失败桌面截图直接显示首次主题选择向导和 `Enjoy it` 按钮仍打开，尽管 CLI 版本、插件安装、host 和项目注册已经成功。
版本响应不代表 GUI 首次初始化完成。曾依据 macOS 配置预置 Windows 用户目录的
`HBuilder X.ini` 中 `[uistate] first=false`，但 [34257224817](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34257224817)
两套 IDE 都只通过首个 setup，随后 LF 启动失败；六个跨平台矩阵通过。该配置不能证明 Windows 首次引导关闭，已移除实现及专用测试。

后续诊断改为在独立 GitHub runner 上按安装路径定位唯一 HBuilderX 进程，保存首次界面的 UI Automation 控件树和截图，
只对官方语言包 `dialog.button.startuse` 对应的“开始体验 / Enjoy It”按钮使用语义调用，再验证按钮消失。
不猜测坐标、不操作其他对话框，也不将界面操作当作样式修复。诊断运行
[34260388484](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34260388484) 中，alpha 完成两轮 8 场景；
stable 的 setup、LF 通过，CRLF 在编译器创建前失败。控件树显示按钮名称包含 `Alt+E` 快捷键后缀，首次匹配遗漏，向导仍显示。

修正后 [34262127231](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34262127231) 记录 `invoked: true`，
截图和控件树确认首次向导关闭，但 alpha 仍在 setup 通过后的 LF 启动失败，两套 IDE 都没有完成连续验收。
因此首次向导不是间歇性启动失败的已证实根因，不能以此前一次 alpha 全部通过宣布稳定修复。

尝试在独立诊断安装中加入上游 CLI 请求日志时，官方插件完整性校验检测到修改并中止初始化。
[34264849325](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34264849325) 仅作为被拒绝的诊断实验保留；
插桩代码已全部移除，未绕过校验，也未将修改后的工具链写入缓存。
后续用未修改的官方 IDE 和不导入 weapp-tailwindcss/仓库 runner 的最小项目，对照真实目录与 Windows junction 的反复启停，
首次运行 [34266683948](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34266683948) 在两套 IDE 上都启动了编译器，
随后因最小项目遗漏 `index.html` 而退出；这不是原始启动挂起的复现。补齐官方 Web 入口，并把别名放到临时目录的独立兄弟目录后，
本地未修改的 macOS alpha 已通过真实目录和别名各一次启动、浏览器唯一标识验证与关闭。
命令为 `CI=1 E2E_HBUILDERX_VANILLA=1 node scripts/ci/hbuilderx-vanilla.mjs`，CLI 由环境变量传入。
修正后的 Windows 对照运行是 [34273608659](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34273608659)，
计划每套 IDE 依次执行真实目录 8 次、独立 junction 8 次；保留失败现场，不自动重试。
其中 alpha 首个真实目录项目成功渲染；终止 CLI、关闭项目后，第二次 `project open` 无输出并在 20 秒截止时间超时，
尚未进入 junction 阶段。这证明无需 Tailwind 插件或仓库 runner 也能触发原生启停问题，
但失败位置是项目重新打开，不能直接等同此前 `launch web` 的编译器创建前挂起。
同轮 stable 第一次真实目录 `launch web` 即无输出，120 秒内未建立 Web 服务；现场包含仍存活的 CLI、
IDE 和插件宿主，未创建编译器。首次向导已经关闭，项目已注册，尚未执行任何项目关闭或 junction 操作。
这证明编译器创建前挂起也可在完全不加载 Tailwind 的官方最小项目中出现；不能通过修改样式插件修复这一已隔离现象。
六个跨平台矩阵全部通过，包含实际 Windows 进程发现和三系统真实 Chromium hash 导航回归。

最小对照可在 Windows 上执行（工作目录为本仓库，使用已安装的官方 HBuilderX，当前只运行一个对应版本）：

```powershell
$env:HBUILDERX_CLI_PATH = (Resolve-Path '<HBuilderX 安装目录>\cli.exe').Path
$env:E2E_HBUILDERX_VANILLA = '1'
& $env:HBUILDERX_CLI_PATH open
pnpm exec node scripts/ci/hbuilderx-vanilla.mjs
```

本地入口每种路径执行一次，GitHub runner 每种执行八次；每轮使用新页面标识防止误连旧构建。
命令参数、PID、退出码、耗时、原始输出与失败桌面/进程现场保存在 `e2e/.artifacts/issue-hbuilderx-windows/vanilla/`。
原始 34273608659 的 alpha 项目重新打开失败只留下任务日志，后续补齐所有短命令失败前的现场采集，避免只覆盖 launch 超时。
此入口用于诊断，既不替代完整样式验收，也不把失败转成通过。

[34275130420](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34275130420) 进一步使用 PowerShell 7
直接调用官方 CLI，以对照 Node 直接启动的句柄与控制台边界。Stable 真实目录 8 次、junction 8 次全部通过；
alpha 真实目录 8 次、junction 前两次通过，第三个 junction 再次出现空 launch 日志、CLI 存活但没有编译器的超时。
失败现场确认 CLI 的参数完整，仍未加载 Tailwind。该结果否定了“用 PowerShell 包一层即可稳定修复”的结论，
没有把该诊断包装器接入产品 runner。它不能独立证明 junction 是根因，因为上一轮真实目录首次启动也失败。
后续需要依据官方 CLI/插件宿主的真实启动协议定位，不能用一次通过、增加重试或变更样式生成器替代根因证据。


另补齐 host 初始化截止时间耗尽的错误分类：空 host 在 `open` 后始终未注册时返回 `timeout`，不再误报版本不匹配。
新增用例修复前失败、修复后通过；runner 43 项通过、2 项 Windows 专用跳过，ESM/CJS 和声明构建通过。

尝试官方 `launch web --compile true` 后，服务在第一次编译就绪时立即停止，无法承载 HMR，因此没有保留此替代方式。
正式验收继续使用 IDE 原生启动、原始日志与真实浏览器计算样式。

## 本轮 CI 补验

PR 冷构建改为三次采样后，同步工作流契约中仍要求一次采样的两处旧断言，43 项 workflow 测试通过。
[34255683248](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34255683248) 的首次性能运行中，
四个分片通过，weapp-vite 稳态 RSS 从 599.38 MB 到 670.21 MB（+11.82%），耗时与 HMR 基本持平。
原始报告保留为 `verify-1170-1144/benchmark-weapp-latest/`；本地同基线三次构建、三次 HMR 的阻断门禁通过，
报告为 `benchmark-local-result/`。远端同提交 attempt 2 的全部性能分片及聚合门禁通过：weapp-vite 构建耗时 +0.61%、
HMR P95 -0.02%，构建稳态 RSS 600.76 → 656.95 MB（+9.35%、+56.19 MB），未达到既有 64 MB 绝对下限。
复测报告保留为 `benchmark-weapp-second/`，首次失败证据继续保留，不声称内存波动已经根治。
没有调整 5% 阈值、64 MB 下限或置信规则。

显式路径 API 的两项新增回归修复前失败、修复后通过；元数据 API 另有保留进程探测的回归。
最新本地 runner 46 项通过、2 项 Windows 专用跳过，ESM/CJS 和声明构建通过。
macOS demo matrix 的 hash 导航误判已独立修复，真实浏览器前后对照与受影响 demo 验收见
[导航验证记录](demo-matrix-hash-navigation.md)。

## UTF-8 管道分块边界

`collectProcessOutput` 原先直接对每个 Buffer 调用 `toString()`。操作系统管道不保证数据块落在字符边界，
中文项目名或错误短语可能被截成替换字符，导致诊断文本损坏，甚至错过原有错误分类。
两项确定性回归分别覆盖所有 UTF-8 字节分割位置和 stdout/stderr 交错输出，修复前均失败。
现在在每条 Readable 流上独立设置 UTF-8 解码，由 Node 保留尚未完整的多字节字符，再交给原有日志缓冲。
不把两条流共享到一个解码器，也不在业务正则里尝试补救乱码。

本地 runner 48 项通过、2 项 Windows 专用跳过，ESM/CJS/声明构建通过。
更新后的 runner 再经 macOS HBuilderX alpha 5.25 实际运行 #1170 的 LF 连续保存、类替换和刷新场景通过：
`CI=1 HBUILDERX_CHANNEL=alpha E2E_ISSUE_1170_WEB=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1170-web.test.ts -t 'preserves LF styles' --update=none`，
CLI 路径由环境变量传入，日志为 `verify-1170-1144/macos-utf8-1170.log`。
这是跨平台日志输入边界缺陷，不是官方 CLI 空日志挂起的根因；空日志对照本身完全没有导入该函数。
没有修改 demo 或样式 fixture，因此本轮不需要重新生成 static 基线。

PR 提交 `e4b542299` 的 iOS CI 原生编译成功（0 errors / 0 warnings），随后 `xcrun simctl openurl`
以 `NSPOSIXErrorDomain code=60` 超时退出，尚未进入 RN 兼容性断言。
原始 Expo 日志保留为 `verify-1170-1144/pr-e4-ios/expo-run.log`；不能将这一轮计为 iOS 验收通过。

## 普通文件输出对照

[34292675347](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34292675347) 在未修改的官方 IDE、
无 Tailwind/仓库 runner 的最小项目中，将原生 stdout/stderr 指向同一普通文件描述符。
Stable 三次真实目录启动和页面标识验证成功后，第三次 `project close` 无输出、20 秒超时；
alpha 八次真实目录和两次 junction 启动成功后，第二次 junction 的 `project close` 同样超时。
因此不能将普通文件输出作为完整启停修复；本轮失败发生在关闭命令，不能冒充 launch 挂起。
对应 `command-10.json`、`command-31.json` 保留参数、PID、截止时间及失败前 IDE/进程/端口现场。
文件输出模式仅为诊断选择，未接入产品 runner。

后续失败现场在原进程、窗口、端口与日志采集之后，追加 listhost/version/project list 三项只读请求，
每项最多五秒并记录 PID、错误、状态与输出到 `cli-health.json`。
这用于区分原客户端挂起与其他客户端同样无法获得响应，不重试或更改原操作的判定。
本地 macOS alpha 的三项实际请求均返回 0。

最新 PR `c229957b4` 的 [34294165871](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34294165871)
六个系统与 Node 组合全部通过。Stable 在准备 IDE 的 version 查询就空输出、120 秒超时，未进入样式测试；
alpha 的 #1144 setup 连续保存通过后，#1170 LF 的 launch 空日志、没有 Web 服务。
保持原失败客户端时，另外三个客户端的 listhost/version/project list 分别在 66/56/57 毫秒内成功返回，
对应项目仍已注册。这排除整个原生宿主都无法处理请求，但仍不能区分原 launch 客户端和插件 RPC 链路。

## 继承 stdin 对照

官方 [dcloudio/hbuilderx-cli 的包装器](https://github.com/dcloudio/hbuilderx-cli/blob/main/lib/hbuilderx.js)
捕获输出时使用继承的 stdin。独立诊断仅将 stdin 从 ignore 改成 inherit，
保持 stdout/stderr 管道、原生参数、截止时间与重复次数。本地 macOS 真实目录和别名启动均通过。

[34294835402](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34294835402) 在 Windows 上仍失败：
stable 八次真实目录、一次 junction 页面渲染成功后，关闭该 junction 项目时空日志、20 秒超时；
alpha 两次真实目录渲染成功后，第二次关闭也空日志、20 秒超时，尚未进入 junction 阶段。
两套 IDE 失败时另外三个只读 CLI 客户端都在 34–50 毫秒内返回 0。
因此继承 stdin 不能作为完整启停修复，也不能凭本轮 launch 都通过认定启动挂起消失。
该模式只用于诊断，没有改动产品 runner。后续应依据原失败客户端与宿主的实际等待位置继续定位，
不要继续重试已否定的 shell、输出文件或输入句柄包装。

## 规则评估

不新增 AGENTS 规则。现有跨平台参数、真实运行和失败证据要求足够，以可执行回归补齐遗漏。
