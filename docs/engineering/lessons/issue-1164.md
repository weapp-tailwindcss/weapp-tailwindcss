---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1164
baseline: 686a8cc9019a25c756d8d50288c2e4a1ea177c78
regressions:
  - packages/weapp-tailwindcss/test/uni-app-x/harmony-scss-comments.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/vite-style-requests.test.ts
  - e2e/issue-1164-static.test.ts
---

# Issue 1164：Harmony scoped SCSS 行注释

2026-09-08 补充：[5.25 alpha 与 Harmony 更新证据](uni-app-x-alpha-hmr.md) 已验证原始 setup，并用无插件原生对照区分符号链接失败、增量重启和纯 HMR。以下保留本次历史修复证据；未验证边界以后续记录为准。

## 症状

uni-app x、weapp-tailwindcss 5.5.1、Tailwind CSS 4.3.3。
Issue 最后一条评论明确指出：在 scoped SCSS 中加入单独一行 `//`，
Harmony VDOM 的背景、尺寸及圆角就不生效。

从上述 main 基线创建独立 worktree，冻结安装并运行 `pnpm build:pkgs`。
原 checkout 的三处修改未纳入任务。新 demo 页面是
`demo/uni-app-x-vdom-tailwindcss-v4/pages/issue-1164/index.uvue`，
分别挂载空白、行注释、块注释、作者规则四个组件，并保留不设置宽度的页面探针。
demo 实际解析到本 worktree 的 `packages/weapp-tailwindcss/dist/vite.cjs`。

修复前 Harmony 截图中，空白与块注释组正常，行注释及作者规则组丢失背景和圆形。
编译后的 line.js 中 `_style_1 = {}`，模板仍引用局部别名。

## 根因与纠正

Harmony 为原生样式对象提前展开局部 `@apply`，发生在 Sass 预处理之前。
原始 SCSS 被普通 CSS parser 解析时，`//\n.probe` 会成为一个选择器，
无法匹配生成后的 `.probe`。同样的问题影响注释后的 `@reference` 和缓存源码回填。

使用 `postcss-scss.parse` 统一原始源码边界，生成器输入经 AST 序列化，
行注释转为合法 CSS 注释，URL 和字符串中的双斜杠仍保留。
生成后的 CSS 继续使用原有 CSS parser。未新增公开 API 或配置。

H5 生产产物对照又暴露了空作者块的生命周期问题：
模板已生成局部别名，但空白或纯注释 scoped 块可能不产生可用样式请求。
因此这类 Web SFC 改用现有独立 style block 分支，继续使用 `:global` 保持 specificity。
完整 SFC 变换统一更新 Web 回放内容，包括独立生成的样式载体。

验证中曾把“没有 scoped 块”直接用于清空缓存，导致原始 style 子请求也清空
完整 SFC 的规则。浏览器计算样式和生产断言发现了这个错误。
最终仅完整模板对应的 SFC 可以更新这份状态，并添加子请求不能清空缓存的回归。

PR 的三系统 demo 矩阵进一步发现 Issue 1144 页面在首次 HMR 后丢失局部样式。
该页面使用非 scoped 作者块，生成的独立 scoped 块不在框架的原始描述符中。
框架为样式子请求返回完整 SFC 时，旧链路用带查询参数的 ID 重复生成别名，
覆盖主模块缓存；仅补回放规则仍不足以处理绕过 load 的样式变换。
修复后由完整 SFC 的 transform 缓存追加样式块的源码与实际索引，
load 和 transform 都从该缓存提供生成块；样式子请求不再进入 SFC 主模块转译。
生成块自行携带规则，作者块桥接不重复注入。跨 POSIX、Windows、根目录和相对 ID
的回归覆盖连续更新与删除，Issue 1144 完整 H5 矩阵在本地复现失败后通过。

## 验证

2026-09-07，macOS，Node 24.18.0，pnpm 11.25.0。
HBuilderX 5.24.2026081301，日志明确显示 VDOM 和样式隔离策略 1.0。

- Harmony：Pura 90 模拟器，`OpenHarmony-6.1.1.125`，实际产物
  `unpackage/dist/dev/app-harmony`。保留修复前后截图和 line.js，
  修复后四组颜色、100px 高度、48px 圆形及作者 padding 均正确。
- Android：Android 11 模拟器，产物 `unpackage/dist/dev/app-android`。
  日志确认进入 Issue 页面，运行截图中的四组样式正常。
- iOS：iPhone 17 Pro / iOS 26.5 模拟器，产物 `unpackage/dist/dev/app-ios`，
  App Launch 后截图中的四组样式正常。
- H5：uni CLI 编译器 5.22，Vite 5.4.21，Chromium 152。
  当前 worktree 的独立端口实例中，九个 ID 的计算样式通过；
  生产 JS 类名与 CSS 声明关系纳入 static 基线。
- 微信：专项 static 用 HBuilderX 重新编译四个组件，检查 WXML 与对应 WXSS，
  不将这项产物断言描述为微信开发者工具运行时验收。

本地验证命令：

```sh
pnpm install --frozen-lockfile
pnpm build:pkgs
pnpm build:ci
pnpm exec cross-env CI=1 pnpm exec vitest run --project=weapp-tailwindcss --update=none --coverage.enabled=false
pnpm lint
pnpm exec cross-env CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/e2e-matrix.test.ts --update=none
pnpm exec cross-env CI=1 E2E_PROJECT_FILTER=uni-app-x-vdom-tailwindcss-v4 E2E_ISSUE_1164_HARMONY=1 E2E_ISSUE_1164_MINI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1164-static.test.ts -u
pnpm exec cross-env CI=1 E2E_PROJECT_FILTER=uni-app-x-vdom-tailwindcss-v4 E2E_ISSUE_1164_HARMONY=1 E2E_ISSUE_1164_MINI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1164-static.test.ts --update=none
pnpm exec cross-env CI=1 E2E_PROJECT_FILTER=uni-app-x-vdom-tailwindcss-v4 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-x-vdom-tailwindcss-v4.test.ts -u
pnpm exec cross-env CI=1 E2E_PROJECT_FILTER=uni-app-x-vdom-tailwindcss-v4 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-x-vdom-tailwindcss-v4.test.ts --update=none
pnpm e2e:demo:matrix uni-app-x-vdom-tailwindcss-v4:h5
pnpm e2e:demo:matrix issue-1144-uni-app-x-web:h5
pnpm release status
pnpm agents:check
git diff --check
```

核心测试 3437 通过、35 跳过，矩阵 34 通过。聚合包构建 30 个任务成功，
没有命中缓存；build-all 没有输出文件的既有提示单独保留。
Issue 1164 的 H5、Harmony 与微信专项基线三项通过，不包含构建哈希、
本机路径或设备 ID。设备相关测试未启用环境变量时明确跳过。
同时刷新该 demo 通用 static 基线并以禁止更新方式重跑通过，补齐新页面的类名与来源记录。
通用基线也包含最新 main 已有的 Issue 1160 边框来源及 utility；旧快照中额外的
主题覆盖和重复 preflight/注释不再出现在当前冻结构建产物中，主入口仍保留完整主题声明。
本机执行通用 static 时暂时移除构建后全局关闭微信开发者工具的清理调用，
避免打断共享 IDE 会话；编译与快照断言完整执行，测试后已恢复脚本，不提交该临时调整。
H5 demo 矩阵生产基线、dev 首编译、连续替换/新增/恢复及刷新检查全部通过。
截图与原始日志在忽略目录 `e2e/.artifacts/issue-1164`，不进入发布包。

## 适用边界

Harmony 连续删除注释、重新加入注释并切换蓝色、恢复橙色，均生成正确增量产物，
最终页面及标识均随保存变化。但 HBuilderX 报告“热更新失败”，随后自动重装运行包，
因此不能记为纯 HMR 通过；日志及三轮截图已保留。这是本记录保持 partial 的原因。

本次验证为原生 UVUE VDOM，不用 WebView 版本替代原生渲染证据，
也不将 VDOM 结果延伸到 Vapor。未改动默认宽度，auto width 探针在本次布局中正常。
SCSS AST 解析不是 Sass 编译器，变量、混入与导入的执行仍由框架预处理器负责。

## 规则评估

不新增 AGENTS 规则。已有“按生命周期维护状态”和“真实运行时证据”足以约束本问题；
新增解析器与完整 SFC/style 子请求的回归比增加文字规则更直接。
