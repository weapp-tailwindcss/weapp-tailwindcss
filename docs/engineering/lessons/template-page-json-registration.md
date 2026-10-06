---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: bafb408881a23a6d7e4712a077f43e47aad23891
regressions:
  - e2e/template-ide-contract.test.ts
  - e2e/template-page-artifacts.test.ts
  - e2e/template-framework-versions.test.ts
  - e2e/canonical-template-build-smoke.test.ts
  - e2e/templates-build-smoke.test.ts
  - e2e/templates-ide-smoke.test.ts
---

# 模板空页面 JSON 与运行时注册

## 症状

六模板真实 IDE 验收 `cca8a1ae-bd3f-4e8a-badb-8855fbfdb32c` 的前五个模板通过，最后的 weapp-vite 模板在导航时收到 `Uncaught [object Object]`，页面截图为空白，尚未调用渲染查询。该轮基础库实际为 3.17.3、IDE 为 2.02.2609231，不能套用此前 Taro 独立诊断的 3.8.6 环境。

在基线上的定向诊断 `2dd94d79-5eea-4120-bb31-6db7b0cdcbc3` 保留原始协议：请求 `ad78ea60-cfef-4477-bdc5-8612febef17b` 调用 `App.callWxMethod` 的 `reLaunch('/pages/index/index')`，5ms 后收到错误。随后 CDP 控制台和 `App.logAdded` 明确报告“页面 [pages/index/index] 缺少 json 文件，无法注册为页面”。源码配置是 `{}`，实际 dist 没有对应 JSON。日志位于该轮 `e2e/.artifacts/preflight/<报告 ID>/weapp-template-run.log`。

## 根因与纠正

weapp-vite 6.25.1 的 `emitJsonAssets` 过滤所有空配置对象，误将注册页面当成可省略配置的产物。上游 [1c477a9489b610140aa7734518ab4acd6abba8ab](https://github.com/weapp-vite/weapp-vite/commit/1c477a9489b610140aa7734518ab4acd6abba8ab) 改为始终通过 bundler `emitFile` 输出页面 JSON。实际 npm 包检查确认 7.0.0、7.0.4 尚未包含修复，[7.1.0](https://github.com/weapp-vite/weapp-vite/releases/tag/weapp-vite%407.1.0) 是最小已发布修复版本。本模板精确锁定 7.1.0，保留原有直接依赖 weapp-tailwindcss 5.5.5、Tailwind CSS 4.3.3 和 merge 2.2.3。

此前读取 IDE 编译器发现“找不到页面 JSON 时返回空对象”，据此允许源码 `{}` 替代缺少的产物，这是错误的边界推断：编译器读取容错不证明基础库可以注册页面。真实运行时错误纠正了这个假设。现在 IDE、canonical build 和普通微信模板 build 共同验证 app.json 实际注册的主包与分包页面，缺产物立即失败；既不填标题或非空占位，也不在构建后补写 dist。只接受真实 JSON 对象，不把组件或 `.wxml.json` 类报告误当作页面配置。

依赖更新脚本仅调整 weapp-vite 主版本策略为 7，并验证 `>=7.1.0 <8.0.0`，避免之后维护退回未修复的 6.x/7.0。版本查询策略有持久回归，其余框架版本策略不变。

7.1.0 自动集成仍由 weapp-tailwindcss 生成样式：发布包的 `resolveManagedTailwindcssOptions` 自动检测 Tailwind v4，`getCoreModule` 动态加载 `weapp-tailwindcss/core`，随后调用 `compiler.generate` 与 `compiler.transformCss`。本轮实际 core 解析为 5.5.5，未注册官方 Tailwind Vite/PostCSS 生成插件。

## 验证

先在原 helper 上加入“源码为空仍须拒绝缺失输出”的回归，36 项中 1 项失败；原 6.25.1 全新 canonical build 则因缺少 `dist/pages/index/index.json` 失败。修改后执行：

```sh
pnpm exec cross-env CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/template-ide-contract.test.ts e2e/template-page-artifacts.test.ts e2e/template-framework-versions.test.ts e2e/template-contract.test.ts e2e/template-workspace-config.test.ts e2e/wechat-session-boundary.test.ts --update=none
pnpm exec cross-env CI=1 E2E_CANONICAL_TEMPLATE_CASE='^weapp-vite-tailwindcss-v4 weixin$' pnpm e2e:canonical-templates -u
pnpm exec cross-env CI=1 E2E_CANONICAL_TEMPLATE_CASE='^weapp-vite-tailwindcss-v4 weixin$' pnpm e2e:canonical-templates --update=none
pnpm exec cross-env CI=1 E2E_TEMPLATE_CASE='^mpx-tailwindcss-v4( weixin)?$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/templates-build-smoke.test.ts --update=none
```

首项 6 文件 90 项通过，覆盖真实空产物、主包缺失、两种分包字段、独立分包、组件引用保留、重复路由、非法 JSON、POSIX/Windows 根目录和相对路径。canonical 更新和随后不更新验证均为 2 项通过，包含 frozen install 与全新构建；普通 MPX 微信模板为 4 项通过。

仅更新 `e2e/__snapshots__/canonical-templates/weapp-vite-tailwindcss-v4/` 中 app.json、app.wxss、pages/index/index.json、pages/index/index.wxml 四份静态产物。新页面 JSON 实际为 `{}`。app.json 与 WXML 和 6.25.1 产物哈希完全相同；WXSS 的 AST 审阅确认没有丢失旧选择器，19 组重复工具类归为单份，三个 text 尺寸类的 line-height 回退由 initial 恢复相应主题变量，增加 14 组基础规则与 Tailwind banner。既有 reset/theme 声明保留。这会影响排版，不能宣称像素等价。

在模板目录运行真实 `pnpm exec weapp-vite dev --no-mcp`，使用非 TTY、关闭 stdin、不传 `--open`。静态审查 7.1.0 CLI 确认只有显式 open 才打开 IDE，非 TTY 跳过热键会话，no-mcp 禁止 MCP；mini backend 只进入构建服务。清空 dist 后等待日志“开发服务已就绪”和本轮产物，再在同一 PID 79469 依次替换 31rpx→47rpx、加入 19rpx margin、恢复源码。四阶段真实页面 JSON 均存在，WXML 和 CSS 标识同步，恢复后两者哈希回到初始值。SIGINT 后等待实际进程退出，exit 0，所属进程组无残留。

watch 原始日志、阶段哈希与有界操作脚本位于 `e2e/.artifacts/template-page-json/`。首轮探针过早读取了已有 production 产物，作为 `startup-stale-*` 保留但不计完整 watch 通过；上面结果来自补上清理与就绪屏障后的定向复验，未通过重跑规避产品失败。此为产物级兼容检查，不是 IDE HMR 或 500ms 性能验收。

helper、新回归及矩阵的定向严格类型检查和全部改动 TypeScript 的 ESLint 通过。未执行批量依赖更新脚本，避免无关模板变更。

## 适用边界

本次修复独立模板及测试门禁，未修改公开包行为，因此不新增包 change intent。真实 IDE 操作由主流程统一完成，本提交尚未运行修复后的六模板截图验收与全面矩阵，状态保留 partial。新的基础样式与行高必须在集成后的真实截图中验收。CLI build/watch 不能替代 IDE 或设备证据，也不能据此证明 uni-app x 的 WXSS 引用问题已修复。

## 规则评估

不新增 AGENTS 规则。现有真实产物、构建图、登录态保护、持久回归和定向快照要求已足够；问题通过依赖根因修复与三个入口共享的可执行门禁解决。
