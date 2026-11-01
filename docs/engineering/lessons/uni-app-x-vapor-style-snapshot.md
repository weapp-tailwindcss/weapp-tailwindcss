---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1325
baseline: 7361901a76bbef6caa418fd91e0c438b8e62ab06
regressions:
  - packages/weapp-tailwindcss/test/uni-app-x/vite-native-style-requests.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/vapor-style-demo.test.ts
  - e2e/runtime-structure.test.ts
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
  - claim: Vapor iOS 首屏及连续样式更新在设备上保持有效
    kind: native
    status: pending
    sha: 7361901a76bbef6caa418fd91e0c438b8e62ab06
    environment: 目标为 HBuilderX 5.33.2026102401、内置编译器 5.33.2026102120.0907、Vapor bytecode、iOS；Xcode 27.2 尚未完成必需组件安装
    reason: Xcode 显示 Install Required Components，CoreSimulator 安装版本与 simctl 需求不一致，尚未取得有效设备、原生产物或本轮截图；版本信息不能替代运行证据
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
- uni-app X 与架构契约定向测试通过，正常运行显式 `CI=1 --update=none`。覆盖乱序 style 请求、前插索引、scoped/普通/多个作者块、交错子请求、删除恢复、重复转换、并发逆序完成、预处理器和外部来源。
- Vapor demo 新增样式矩阵；`vapor-style-demo.test.ts -u` 单独生成插件层静态基线，再以 `--update=none` 复验。记录完整输入、转换后 SFC、每块索引和生成 CSS，不把它称为上游原生产物。
- H5 构建完成；以本轮产物启动临时本地服务，通过安装在当前 worktree 的 Playwright、`headless: true` 检查六个实际节点的尺寸和背景，页面异常为空。服务与浏览器在 finally 中关闭；本地日志、JSON 与截图保存在忽略的 `.tmp/issue1325/`。H5 编译日志明确为 VDOM/Web，不是原生 Vapor。
- 严格类型检查剩余 5 个既有错误，位于 generic-web-production-fast-path 和 weapp-tw-web-rpx-finalize-loader。用 TypeScript CompilerHost 从 HEAD 读取这三个改动文件的原始版本进行内存基线对照，得到同样 5 个诊断；未改写 checkout 或借用其他 worktree 依赖。
- 新增 `uni-app-x-vapor-tailwindcss-v4 ios vapor` 设备入口。子组件的作者 style 与当前 token 一次保存，避免额外父页面更新掩盖子组件独立更新；逐轮检查六个真实节点尺寸和原生截图。自动门禁只验证生成布局持续存在，作者文字颜色需截图人工核对；该入口未运行。静态模板可能进入 bytecode，不编造 app-service 中的模板字符串或具体样式 bytes 类名。

本文的 baseline SHA 不包含修复，以上已执行验证包含未提交修改，不能把 baseline 当成修复提交。最终提交与 PR CI 状态另由 PR 记录。

## 适用边界

当前状态为 partial。Xcode 必需组件安装阻断 Vapor+iOS 和 VDOM+iOS 的真实对照；未启动全面测试、未复用旧报告或以跳过放行。需用户完成组件安装后重新核对设备，再保存完整转换链、实际原生样式产物与设备截图，验证首屏和连续更新。当前 demo manifest 指定 bytecode；真实样式载体需从该轮构建发现，不能复制 Harmony 的类名，也不能把 nativecode 的 `.style.mm` 当作 bytecode 默认输出。

现有证据不支持关闭 Issue、将 PR 标记为原生验收完成或自动合并。CI 通过也不能替代设备证据。

## 规则评估

不新增 AGENTS 规则。现有构建生命周期、来源归属、先失败回归和原生证据边界已覆盖本次问题；新增可执行回归与本记录即可。
