---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 6d2eb5064f9ffb35429e551a7b57309bd05bc5e4
regressions:
  - e2e/uni-app-vite-vue3-hbuilderx-tailwindcss-v4.test.ts
  - e2e/hbuilderx-alias-consumers.test.ts
  - e2e/wechat-session-boundary.test.ts
  - e2e/hbuilderx-compiler-watch.test.ts
  - e2e/hbuilderx-compiler-lifecycle.test.ts
---

# HBuilderX 的微信 watch 必须与 IDE 启动解耦

## 症状

2026-10-03 本地流程进入 watch 后，21:34:24.158 的 HBuilderX 输出出现“正在启动微信开发者工具”，随后微信 Electron 执行 initialize/open。仓库的直接 automator 入口已经使用已有 HTTP 服务，但 `scripts/hbuilderx-launch-mp-weixin-dev.ts` 默认仍调用 `launch mp-weixin --compile false`，经 HBuilderX 间接触发微信 CLI。发现后主流程已停止并按归属回收本轮进程；不能因为 IDE 已经开启就认为这条路径安全。

## 根因与纠正

只读核对本轮安装的 HBuilderX 5.31.2026093020-alpha：`uniapp-extension/out/index.js` 模块 174 的 `liteMode` 等于 `!!session.args.compile`；模块 4981 在首次编译成功后选择 `liteMode ? stop() : openTool()`。`stop()` 会终止编译器，因而 `compile=true` 是一次性编译；`compile=false` 则进入 `openTool → startIde` 并执行微信 CLI `open --project`。

`startIde` 还在启动前调用 `removeWXLocalstorage`，并可能自动确认开启微信服务端口。即使本仓没有直接执行登录或注销，该中转仍会碰触用户 IDE 的启动和本地状态边界。此处只记录调用路径，不读取或保留登录资料；本轮证据证明发生了不允许的启动，不能据此断言再次注销或把具体文件内容当作已验证的认证根因。

当前官方调用链没有持续 watch 且禁止 auto-open 的分支。`--ui` 仅转入界面 launchPlatform，不能消除这一行为。不能改用户配置、修改安装插件、注入未知开关或把一次性编译当作 watch 放行。

### 安全编译链

先行安全提交在解析 runner、创建项目别名、删除旧产物和启动进程之前拒绝 watch 调用。随后把默认模式与 `HBUILDERX_COMPILE_ONLY=0` 接入[独立编译入口](../../../scripts/hbuilderx/wechat-watch.ts)：直接运行所选安装的 Node 和同套 `uniapp-cli-vite` 官方 `bin/uni.js -p mp-weixin`。其 `runDev` 原生创建持续 watcher，不经过 IDE debug adapter 或 launcher。显式 `HBUILDERX_COMPILE_ONLY=1` 仍固定传 `--compile true`；其他值拒绝，不回退到运行模式。微信连接只能由 `scripts/wechat` 管理用户已打开的 IDE。

安装身份来自既有 `HBUILDERX_CLI_PATH` / channel 解析，但不执行该 CLI。绑定安装下 `about`、`node`、`uniapp-cli-vite` 的 manifest 身份和实际入口；缺失、冲突或多个候选目录立即失败，不回退到项目旧编译器。普通 HBuilderX demo 的 uni 插件工厂也改为共享工具链选择器，保持工厂与直接编译器一致。

| 输入 | 子进程合同 |
| --- | --- |
| 运行目录、Node、uni 入口 | 所选安装的 compiler 目录、`plugins/node/node`（Windows 为 `node.exe`）与 `bin/uni.js` |
| `UNI_INPUT_DIR` / `VITE_ROOT_DIR` | 本轮项目真实绝对路径 |
| `UNI_OUTPUT_DIR` | 该项目的 `unpackage/dist/dev/mp-weixin` |
| `HX_APP_ROOT` / `UNI_HBUILDERX_PLUGINS` | 同一安装根目录 / 插件目录，按完整目录查找插件 |
| `HX_Version`、缓存、平台、模式 | 安装 manifest 版本、本项目缓存、`mp-weixin`、`development` |
| uni-app x | 清除继承状态，由官方编译器读取本轮 manifest 识别 |
| 旧 `HX_*` / `UNI_*`、`PIPE_NAME`、`HBuilderProcessId` | 清除后重建，禁止带入旧 socket、automator、插件映射或平台路由 |
| 纯编译选项 | 保留 `UNI_MINIMIZE`、`UNI_CUSTOM_CONTEXT`、`UNI_CUSTOM_DEFINE`、`UNI_APP_SOURCEMAP` 与 `SOURCEMAP` |

不注入 extension 的管道、socket、验证文件或 `static/kill.js`。环境键按不区分大小写处理，避免 Windows 的小写旧变量绕过隔离。SIGINT/SIGTERM 由受管进程树处理，只停止本轮 compiler，并等待根进程和已发起清理完成；重复信号复用同一次清理。编译器无信号自行退出（即使状态 0）仍按 watch 失败处理，并在 `exit` 事件中、`close` 撤销进程组身份之前领取收尾句柄。运行与停止同时失败时保留两者，不升级为全局终止。

## 验证

- 修复前，5 个默认或非法环境值的隔离回归全部失败，证明会继续进入 launcher。
- 修复后，`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hbuilderx-alias-consumers.test.ts e2e/wechat-session-boundary.test.ts --update=none` 共 20 项通过，涵盖无子进程、无别名、旧产物不变、固定 compile 参数和原有信号清理。
- AST 边界同时扫描全部 E2E 与脚本里的微信 launch 参数，拒绝缺省、变量、条件表达式、重复覆盖和展开参数，防止中转启动再次绕过直接 automator 检查。
- 实际执行脚本并设置 `HBUILDERX_COMPILE_ONLY=0` 后立即以退出码 1 报告明确阻塞，没有启动 IDE 或编译器。定向 ESLint 通过。
- 上一条记录对应先行安全提交。直接编译入口完成后，新的隔离安装回归覆盖默认与 `0` 模式的真实 Node 子进程，连续两次修改由同一 PID 生成新产物，结束时确认该 PID 消失；假的 HBuilderX CLI 不可执行，证明此路径无需中转 CLI。
- 新回归还验证原生路径 API（POSIX、macOS、Windows 盘符/根目录/UNC/相对路径）、环境隔离、安装身份缺失和歧义、缺入口时保留产物，以及取消失败和晚到清理错误。独立严格 TypeScript 通过。
- 增加真实 POSIX 子进程回归：编译器根进程主动退出 1、同组后代仍存活时，受管停止会回收后代并保留原退出错误。此进程组用例在 Windows 不适用；Windows 取消仍复用既有 `taskkill` 归属边界，本轮未做真实 Windows 进程验收。

## 适用边界

主工作树集成后补齐普通 HBuilderX Vue3 demo 的常规 static 入口。该项目此前虽然登记在 `projectEntries`，却没有 `defineProjectTest` 入口；CLI 多平台检查消费另一份 `dist/build` 产物，不能代替 Alpha 的 `unpackage/dist/dev` 基线。新增入口按已有项目测试框架保存 7 份 CSS/类名/源码候选基线，不与 `demo-matrix` 报告或其他项目目录重复。

限定该 demo、uni-app x VDOM、issue1144 三个入口执行 `-u` 后，审查确认只有新增项目的 7 份基线，现有项目基线字节未变；再使用 `CI=1`、`E2E_SKIP_OPEN_AUTOMATOR=1` 和 `--update=none`，3 文件 4 项全部通过、无跳过，34.38 秒。两个 HBuilderX 项目真实使用 Alpha 5.31.2026093020-alpha 的只编译路径；issue1144 是 npm Web 生产构建。日志为 `.tmp/alpha-spacing-static-{update-9ab8b2e86,verified-7f828fad9}.log`。此项未连接微信项目，不代表持续 watch 或设备 HMR 已验收。

独立实现阶段仅执行隔离进程回归；主任务随后完成了上一段所列真实 vendor static 编译。uni-app x VDOM 还在独立预检后通过微信 IDE 连接、模板及脚本类产物更新，见[局部导入归属复盘](vite-local-css-replay-ownership.md)。这些记录不能替代普通 HBuilderX Vue3 demo 的持续 watch 验收，也不能替代实际 IDE 可视更新与完整多端验收。

只读审计覆盖官方 CLI、mp-weixin 插件、打印与编译链，已定位的 auto-open 与本地存储操作均位于没有加载的 extension launcher。部分 vendor helper 包含预编译字节码，不能声称形式化证明所有第三方代码无副作用；升级工具链后仍需按真实进程和 IDE 日志复查边界。

## 规则评估

沿用已有保留微信登录态的全局规则，补充可执行边界与多端手册，明确第三方工具中转同样受限。
