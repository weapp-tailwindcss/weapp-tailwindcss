# @weapp-tailwindcss/hbuilderx-runner

## 0.1.7

### Patch Changes

- 修复命令超时与长驻进程停止提前返回的问题：等待真实关闭及最终日志，在固定预算内终止本轮独立进程组，清理失败保留主错误和独立诊断。重复停止复用同一结果，Windows 进程树部分终止失败不再被根进程退出掩盖，超时后的零退出码仍按超时处理。

- 将发布包的仓库与问题反馈地址更新为 weapp-tailwindcss 组织下的主仓库，使 npm 包元数据与迁移后的 OIDC 发布来源一致。保留现有包名、导出接口、npm 所有权和文档域名。

## 0.1.6

### Patch Changes

- 识别 HBuilderX 中文 CLI 的未启动响应，避免把提示文本当作 host 名称；仅在确认实例未启动时打开 IDE，继续保留超时和实例冲突门禁。

## 0.1.5

### Patch Changes

- Windows 上 HBuilderX 进程探测在 PowerShell 冷启动超时时重试，单次失败不再把瞬时超时当成探测失败。

## 0.1.4

### Patch Changes

- 修复 Windows 原生进程参数被 shell 拆分的问题，正确处理带空格和中文的路径、cmd shim 以及可执行文件缺失错误。

  使用 Windows 内置 PowerShell 与进程 API 探测已有 HBuilderX 实例，避免 WMIC 缺失时误判为未启动并重复打开 IDE。通过 JSON 保留中文、逗号和共享路径，探测失败时明确报错。

  显式配置 CLI 时直接通过 listhost 与版本握手绑定实例，不再依赖操作系统进程枚举。只有确认没有 host 才启动一次 IDE；版本不匹配、歧义与命令超时保留为错误，连接过程共享启动截止时间。

  只解析已配置 CLI 路径时不再枚举系统进程；需要运行状态的信息查询 API 保留原有语义。

  子进程 stdout/stderr 分别按流解码 UTF-8，避免中文项目名和错误文本被数据块边界截断成乱码。

## 0.1.3

### Patch Changes

- 将公开 npm 包的主页和相关文档入口迁移到新的 `https://tw.weapp.dev` 域名，并补齐缺失的包主页元数据。

## 0.1.2

### Patch Changes

- 🐛 **统一更新各发布包的 npm 描述与中英文 README，明确 `weapp-tailwindcss` 面向 Web、小程序、React Native、Lynx 与跨端框架的全端 Tailwind CSS 定位。公开包现在默认展示英文 README，并提供统一命名的简体中文入口，同时保留各子包的具体职责边界。** [#1079](https://github.com/sonofmagic/weapp-tailwindcss/pull/1079) by @sonofmagic

## 0.1.1

### Patch Changes

- 🐛 **修复 uni-app x Native scoped 作者样式被通用 CSS 生成管线提前改写的问题，并统一 Windows 下 Vite 模块身份与 HMR 候选刷新顺序，确保新增、删除和回滚类名时会重新编译对应 `.uvue` 本地样式；同时细分 Harmony 构建失败、保留 HBuilderX 日志中的首个关键错误，并让 Harmony 回归基于与 HBuilderX Alpha 对齐的编译器及最终 JavaScript 产物验收样式。** [#1036](https://github.com/sonofmagic/weapp-tailwindcss/pull/1036) by @sonofmagic

## 0.1.0

### Minor Changes

- ✨ **新增 HBuilderX stable、Alpha 共存选择能力，将 CLI 路径、运行实例 host 与版本绑定到同一 runner 会话，并让仓库 HBuilderX e2e、demo 与 visual 工作流稳定使用指定版本。** [`8319746`](https://github.com/sonofmagic/weapp-tailwindcss/commit/83197469e6662c684ae30ab9bbd6b0b58ea75d20) by @sonofmagic

## 0.0.4

### Patch Changes

- 🐛 **修复多 iOS 模拟器环境下 HBuilderX 测试无法自动选择设备的问题。** [`d6c0951`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d6c0951bdd1b10b5a57dd8b6bac73850f1147e49) by @sonofmagic

## 0.0.3

### Patch Changes

- 🐛 **修复 HBuilderX 多端运行时的项目别名、工具链定位与启动参数处理，确保 uni-app、uni-app x 在 Android、iOS、Harmony 和微信小程序回归中使用正确项目与实际输出目录，并补充对应测试。** [#988](https://github.com/sonofmagic/weapp-tailwindcss/pull/988) by @sonofmagic

## 0.0.2

### Patch Changes

- 🐛 **内部按框架与打包器拆分插件分支，保持 `WeappTailwindcss` 与 PostCSS 公开入口不变。** [#969](https://github.com/sonofmagic/weapp-tailwindcss/pull/969) by @sonofmagic
  - `weapp-tailwindcss` 现在会在 Vite、Webpack、Gulp 入口提前解析 app type / bundler 分支，并进入对应 `frameworks/*` 插件工厂。uni-app Vite、uni-app x Vite、Taro、MPX、weapp-vite 与原生 Gulp 链路拥有直观的目录边界，uni-app x Vite 的额外插件组合也只保留在自己的框架分支中，降低单个框架改动影响其它打包器的风险。
  - `@weapp-tailwindcss/postcss` 增加 CSS 处理分支解析，将普通小程序、Web、`uni-app-x-css-webview` 与 `uni-app-x-css-uvue` 兼容处理拆到独立目录，避免平台兼容逻辑继续散落在通用 handler 中。
  - PostCSS 内部进一步拆出 `frameworks/*` 策略层与无框架语义的 style target profile：Taro、MPX、uni-app、uni-app x、weapp-vite 等框架先进入各自 strategy，再显式选择 `mini-program`、`web` 或 uni-app x 专属 CSS target，方便后续按框架扩展不同处理顺序，同时用互斥测试锁住“不执行其它框架后处理”的边界。
  - 新增 `@weapp-tailwindcss/hbuilderx-runner`，沉淀 HBuilderX CLI 本地运行能力。它负责解析正在运行的 HBuilderX 或 `HBUILDERX_CLI_PATH`、封装项目 open/close/launch、统一超时和进程树清理，并把项目识别错误、配置加载失败、Android/iOS/Harmony 工具链缺失等常见失败归类成可诊断错误，供 HBuilderX e2e 与后续 demo/CLI 脚本复用。

## 0.0.1

- 初始版本，提供 HBuilderX CLI 调用、日志、错误分类和工具链探测辅助能力。
