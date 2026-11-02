---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1325
baseline: 7361901a76bbef6caa418fd91e0c438b8e62ab06
regressions:
  - packages/weapp-tailwindcss/test/uni-app-x/vite-native-style-requests.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/vapor-style-demo.test.ts
  - e2e/runtime-structure.test.ts
  - e2e/runtime-structure-injection.test.ts
  - e2e/hbuilderx-ios-hmr-completion.test.ts
  - e2e/issue-1325-native-control.test.ts
  - e2e/harmony-render-mode.test.ts
verification:
  - claim: 插件按最终 style 索引回放内联来源，子请求不覆盖完整 SFC 快照
    kind: unit
    status: passed
    sha: 7361901a76bbef6caa418fd91e0c438b8e62ab06
    environment: macOS，Node 24.22.1，pnpm 12.15.0，基线加本次未提交修改
    command: CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/uni-app-x test/ci/architecture-contract.test.ts --update=none
  - claim: 六个 H5 对照节点均为 120×32，背景为 rgb(14,116,144)，无页面异常
    kind: integration
    status: passed
    sha: 7361901a76bbef6caa418fd91e0c438b8e62ab06
    environment: macOS，Node 24.22.1，项目 npm 编译器 3.0.0-5030320261023001 的 VDOM/Web 分支，headless Chromium；基线加本次未提交修改
    command: pnpm --filter @weapp-tailwindcss-demo/uni-app-x-vapor-tailwindcss-v4 run build:h5
  - claim: Vapor iOS 首屏和四轮原生重载保持生成样式及作者样式
    kind: native
    status: passed
    sha: a285d6fc234a5e758f1c97cc151a6568d85c8fff
    environment: macOS、HBuilderX 5.34.2026102909、内置编译器 5.34、Vapor bytecode、iPhone 18 Pro / iOS 27.2；该提交加本轮未提交探针与生命周期修改
    command: CI=1 E2E_HBUILDERX_LOCAL=1 E2E_HBUILDERX_CASE='uni-app-x-vapor-tailwindcss-v4 ios vapor native-reload' pnpm e2e:hbuilderx:local:ios
  - claim: 无插件 Vapor 原生 CSS 对照保存后也会重启
    kind: native
    status: passed
    sha: a285d6fc234a5e758f1c97cc151a6568d85c8fff
    environment: HBuilderX 5.34.2026102909、Vapor bytecode、iPhone 18 Pro / iOS 27.2；该提交加本轮未提交便携对照及探针修改
    command: CI=1 E2E_HBUILDERX_LOCAL=1 E2E_HBUILDERX_ISSUE1325_CONTROL=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1325-native-control.test.ts --update=none
  - claim: Vapor 与 VDOM iOS 保存时保持应用生命周期的纯 HMR
    kind: native
    status: failed
    sha: a285d6fc234a5e758f1c97cc151a6568d85c8fff
    environment: HBuilderX 5.34.2026102909、iPhone 18 Pro / iOS 27.2；该提交加本轮未提交探针与生命周期修改
    command: CI=1 E2E_HBUILDERX_CASE='uni-app-x-vdom-tailwindcss-v4 ios' pnpm e2e:hbuilderx:local:ios
    reason: 两种渲染模式保存后均出现新的 App Launch；严格判定返回 restarted，未记作纯 HMR 成功
---

## 症状

Issue 报告 weapp-tailwindcss 5.6.3、Tailwind 4.3.3 在 HBuilderX 5.33 之后的 Vapor iOS 上间歇丢失样式，H5 正常，没有提供完整 SFC 或复现仓库。截图能确认布局丢失，不能确定具体失败块或编译阶段。

## 根因与纠正

已用失败回归确认的插件缺陷：

- preflight 前插后，真实请求顺序是 `[preflight, 作者块…, 局部生成块]`，旧缓存仍以作者原始索引加载 important apply，错误地用作者 CSS 覆盖 index 0 的 preflight。7 种 POSIX、Windows、UNC、根路径及相对路径回归在原代码上失败。
- 原生 script/template 子请求会登记为完整 SFC，清空作者来源并替换主事务。保留原生子请求转换，但使用主模块身份，不发布完整快照或重置权威来源。
- scoped 的外部 `src` 块会被当成内联载体写入局部规则，上游消费外部文件时无法得到这些规则。外部块原样保留，另建内联载体。

修复以最终返回给框架的 SFC 为有序快照，包含 Harmony 展开后的结果；不再按作者块数量推断某个索引的所有权。旧内联索引删除时返回空 CSS，当前作者或外部块复用该索引时优先采用当前来源。较旧异步事务不能覆盖新快照或 Web 局部规则；样式请求持续等待当前主事务。

`load` 与 `transform` 的阶段不同：HBuilderX 可在本插件 CSS transform 前完成 Sass、CSS import 和 URL 处理，因此非空快照仅用于完整 SFC payload 的取块，不能把已编译 CSS 换回原始预处理器文本。持久回归覆盖这条边界。

“Vapor 只支持一个 style”尚无证据。对本机正式版安装进行只读、内存编译器探针后，compiler-sfc 保留三个 style，真实 custom plugin-vue 按转换后 descriptor 生成全部 inline 请求，共享 CSS 插件按 SFC 聚合全部模块，原生 CSS parser 保留全部规则和级联。Rollup cache 连续三轮 `red+h8 → red+h12 → blue+h12` 也完整。普通多 style 的冷启动和增量编译未复现原报告的丢失；不能将以上确定插件缺陷直接等同于 Issue 完整根因。

另纠正一次排查假设：原生 IDE 开发走 `build watch`，不会触发 Vite serve 的 handleHotUpdate。纯 serve 探针能观察到原始 descriptor 覆盖窗口，但不据此修改原生 HMR 调度或宣称 iOS 问题已复现。

## 验证

- 当前 worktree 独立 frozen install；核心包构建和架构检查通过。
- uni-app X 与架构契约定向测试24文件294项通过，正常运行显式 `CI=1 --update=none`。覆盖乱序 style 请求、前插索引、scoped/普通/多个作者块、交错子请求、删除恢复、重复转换、并发逆序完成、预处理器和外部来源。
- Vapor demo 新增样式矩阵；`vapor-style-demo.test.ts -u` 单独生成插件层静态基线，再以 `--update=none` 复验。记录完整输入、转换后 SFC、每块索引和生成 CSS，不把它称为上游原生产物。
- H5 构建完成；以本轮产物启动临时本地服务，通过安装在当前 worktree 的 Playwright、`headless: true` 检查六个实际节点的尺寸和背景，页面异常为空。服务与浏览器在 finally 中关闭；本地日志、JSON 与截图保存在忽略的 `.tmp/issue1325/`。H5 编译日志明确为 VDOM/Web，不是原生 Vapor。
- 严格类型检查剩余 5 个既有错误，位于 generic-web-production-fast-path 和 weapp-tw-web-rpx-finalize-loader。用 TypeScript CompilerHost 从 HEAD 读取这三个改动文件的原始版本进行内存基线对照，得到同样 5 个诊断；未改写 checkout 或借用其他 worktree 依赖。
- 5.34 的真实 Vapor+iOS 冷启动和新增、替换、删除、恢复四步原生重载通过。日志明确为“编译器版本：5.34（uni-app x）蒸汽模式”和 bytecode，编译器来自当前 IDE 的 `plugins/uniapp-cli-vite`；没有修改厂商文件。设备为用户指定的 iPhone 18 Pro / iOS 27.2。
- 修复真实设备暴露的测试探针问题：无 script 子组件须注入 `script setup lang="uts"`；原生 dataset 是 Map，不能用 `getAttribute('data-*')` 读取 token；UTS JSON serializer 将第二次出现的对象引用写为 null，所以 marker 与 nodes 各自生成独立数据对象。对应回归在旧探针上失败、修改后通过，未放宽结构协议。
- Vapor 的 App Options 生命周期没有输出启动信号；demo 改用 script setup 的 `onLaunch` 等生命周期，并显式从 `@dcloudio/uni-app` 导入以兼容 npm H5。最终 App 源码也纳入插件 static 基线。H5 构建仍有上游 UTS 关于 hook 导出的类型警告，实际包声明及 JS 均导出 hook，浏览器执行与样式检查通过。
- 五轮截图均为1206×2622，structure pixelRatio=3。由173×41的 marker 与519×123截图像素独立确认几何映射。30个矩阵节点均为120×32，背景精确为#0e7490；none作者文字按黑色→#111827→#334155→黑色→#111827变化，plain/scoped始终#111827，multiple始终#334155。删除后的裁剪与初始逐像素相同，恢复后与新增相同，其余五个矩阵节点全程不变。五轮token各异且markerCount=1。
- 严格 Vapor HMR 首次保存返回 `restarted`。独立无插件原生 CSS 对照也产生一次 App Launch，因此仅本 PR 新增的 Issue 专属 case 显式声明 `native-reload`，不修改通用生命周期实现。VDOM+iOS 对照首屏通过，保存后同样 `restarted`；其严格门禁保留且失败记录保留。两种模式都继续要求本轮编译、传输和设备取证，拒绝重装及过期证据。
- 实际原生产物为 `unpackage/dist/dev/app-ios/app-service.js`、manifest 与 `bytes/*.style.bytes`；nativecode的字符串表位于 `UNI_APP_X_DOM2_CPP_DIR/*.style.mm`，不是bytecode默认产物。原始SFC、转换产物和这些文件按时间与内容hash归档，不凭模板字符串猜测bytecode内容。

本文的 baseline SHA 不包含修复，以上已执行验证包含未提交修改，不能把 baseline 当成修复提交。本轮新增探针、更新模式及矩阵定向回归另有138项通过；最终提交与 PR CI 状态另由 PR 记录。

## 适用边界

当前状态为 partial：已复现并修复三处插件来源/索引缺陷，5.34 修复后设备矩阵通过；Issue 未提供原始 SFC，普通多 style 的间歇丢失仍未完整复现，不能把三个确定缺陷直接认定为原报告全部根因。

Xcode 必需组件已由用户安装，本轮重新确认 Xcode 27.2、模拟器、5.34 IDE/CLI和运行基座。此前看到的旧 CLI 属于 IDE 更新过程；更新完成后 App/CLI 均为5.34，没有发现可单独删除的旧 CLI，不删除当前 CLI 或另一套 Alpha 安装。

本地证据保存在忽略的 `.tmp/issue1325/`：`native-20261102T014450Z` 为严格 Vapor HMR 失败；`native-20261102T014719Z` 含无插件对照及插件四步通过、完整截图/结构/日志和内容归档；`native-20261102T015127Z` 为严格 VDOM+iOS 对照；`native-20261102T015823Z` 为最终持久插件入口四步复验，`native-control-portable` 为便携无插件入口复验，后两者均通过。失败现场与正常清理账本保留，用户 IDE 和模拟器会话未重置。便携无插件复现保存在 `e2e/fixtures/issue-1325-vapor-native-control`。

未运行本地全面测试；定向验证不替代全端预检。native-reload 通过不证明纯 HMR，H5 的 VDOM/Web 也不替代 Vapor。现有证据不支持自动合并或关闭 Issue；CI 通过只说明对应提交的自动检查结果。

## 规则评估

不新增 AGENTS 规则。现有构建生命周期、来源归属、先失败回归和原生证据边界已覆盖本次问题；新增可执行回归与本记录即可。
