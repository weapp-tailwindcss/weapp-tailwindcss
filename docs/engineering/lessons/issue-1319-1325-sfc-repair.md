---
status: partial
issues:
  - https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1319
  - https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1325
baseline: 80efee1e22769557c4c73308c546f446c929320a
---

# SFC 样式边界与事务修复

本记录继续 [main 根因验收](main-1319-1325-root-cause-acceptance.md)。保留旧失败现场，单独记录修复版；设备验收尚未完成，两个 Issue 均不能标记为全面根治。

## 根因与实现

`<style>` 全局正则跨过 SFC 顶层边界，把脚本字符串、注释和自定义块内容当作 CSS。原工程 `mp-html.uvue` 的注释误匹配使 UTS 进入真实 style 请求，产生 `Unknown word`。转换器另一个正则会把伪 scoped 标签当作载体，造成 MagicString 区间重叠。

中立工具层现在复用既有 `@vue/compiler-dom` 的 SFC 模式，保留顶层块原文、属性和 offset。转换器、快照、CSS 缓存及来源扫描共享同一边界；Svelte 保留独立适配和预处理器元数据。生成扫描区分文件中的完整 SFC 与显式 `sourceCss` 载荷，无 style 的 SFC 不再把整份脚本作为 CSS 扫描。已展开的 Sass、import、URL 和外部 src 保持各自的处理入口。

真实 HBuilderX 5.34 Vapor 的 `@vitejs/plugin-vue` 调用 compiler-sfc 时使用默认 `ignoreEmpty=true`。无 src 的空白 style 不占请求索引；含 src（包括空属性值）或 CSS 注释的块仍占索引。提取器先过滤再编号，以独立 compiler-sfc descriptor 校验。转换器编辑仍保留空块；自闭合 scoped 载体在原位置展开，避免生成规则落到块外。

异步状态按文件保留当前事务及结算结果，样式读取同时追随替代通知和结算通知。旧任务失败仍由旧 transform 抛出，较新请求不会被过期失败击穿；当前失败持续传播，直至后续事务替换。身份核对与快照读取处于同一同步阶段。

成功事务统一发布样式快照、Harmony 来源、引用和生成规则。完整 SFC 的权威状态按文件替换，子请求只补充尚无权威状态的来源；删除后保留空状态，防止晚到子请求复活旧规则。最终 bundle 按真实模块图选取有效来源，保留 watch 缓存模块；权威来源为空时禁止从旧 sourcemap 回退恢复规则。

保留 #1319 已合入的零宽重置、基础类注入和作者覆盖顺序；没有新增公开 API、关闭 preflight、合并所有 style 或改动厂商文件。

## 本地回归

以下命令在独立安装依赖的本任务 worktree 执行，Node 24.22.1、pnpm 12.15.0：

```sh
pnpm --filter weapp-tailwindcss exec vitest run test/uni-app-x test/bundlers/sfc-style-boundary.unit.test.ts test/bundlers/vite-css-memory.test.ts test/bundlers/shared/generator-css/source-files.test.ts test/bundlers/vite-sfc-style-source.unit.test.ts test/ci/architecture-contract.test.ts test/ci/framework-boundaries.test.ts test/ci/generation-ownership.test.ts --update=none
pnpm --filter weapp-tailwindcss build
pnpm architecture:check
pnpm agents:check
pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false
```

32 文件、394 项通过，包含原四项失败语义、实际 bundle 删除/替换/文件退出、异步交错、错误恢复、POSIX/Windows/UNC/相对 module id，以及属性内 `>`、CRLF、嵌套模板、空块、多块、预处理器、外部 src、CSS 伪标签和扫描伪指令。包的 ESM/CJS 与声明构建通过；架构及规则检查通过。

类型检查仍失败，仅保留已在基线复现的五项诊断：`generic-web-production-fast-path.ts:100` 的 TS2379；`weapp-tw-web-rpx-finalize-loader.ts:28` 的 TS2322、34/35 的 TS4111、40 的 TS2345。本次没有新增诊断，不能据此写成类型检查通过。

原始手动入口的故障快照先保存为忽略目录中的 `main-80efee1e-failure.snap`，然后仅对该入口生成修复版 static 基线，并复验不更新：

```sh
pnpm exec vitest run --config e2e/fixtures/issue-1325-style-boundary.vitest.ts --update=all
pnpm exec vitest run --config e2e/fixtures/issue-1325-style-boundary.vitest.ts --update=none
```

两次均 5 项通过；常规包单测同时保留独立正确性断言。快照记录完整 SFC、转换结果及三个索引的请求/返回。修复前日志和快照保留，未用成功重跑覆盖失败。

## 原工程与设备验收

原工程仍固定 `cq112233/unibestX@b239192f46611f51877aef48ca851b4c67c47f44`，A 使用原锁 npm 5.6.3，B 使用修复版完整运行时闭包。B 原验收目录在恢复时已不存在，因此从同一原提交重新建立独立副本并安装，没有复制 A 的可写依赖目录。旧 B 的源码归档、tarball、安装 receipt、编译失败及截图继续保留。

微信原 AppID `wx6d379a8c0aff3ea3` 的打开错误已通过原生 UI 查明为“登录用户不是该小程序的开发者”，不是样式结论。保留截图 `wechat-permission/original.png`，未重置登录或修改票据。用户随后明确授权验收副本使用 weapp-tailwindcss demo AppID `wxb3d842a4a7e3440d`；新验收通过原工程现有 `VITE_WX_APPID` 配置入口覆盖并重新预检，记录该差异。

HBuilderX 固定 5.34.2026102909，iOS 固定 iPhone 18 Pro / iOS 27.2。隐私页“同意并进入应用”的既有授权保留。旧预检均已关闭或阻断，不能复用；全部设备验收仍须新 prepare、当前会话 computer use、verify 和领取。

当前两个 Issue 的结论均为“验证未完成”：尚未取得修复版原首页的微信/Harmony Vapor 边框全序列，以及 Vapor+iOS 的十次冷启动和十轮连续更新。H5、VDOM、静态回归及 CI 不替代这些证据。后续按首次偏离记录编译、产物、节点与截图，严格 HMR 与原生重载分别统计。

Refs #1319，Refs #1325；不自动合并 PR 或关闭 Issue。
