---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1144
baseline: be518d94790c29aad401220b5cdb2a5d23173d5f
regressions:
  - packages/weapp-tailwindcss/test/uni-app-x/vite-style-requests.test.ts
  - e2e/issue-1144-alpha.test.ts
  - e2e/issue-1144-runner.test.ts
  - e2e/issue-1144-static.test.ts
---

# #1144：让 Web HMR 与首次编译共享 SFC 描述符

## 症状

2026-09-08，从上述 main 提交创建仓库外 worktree `codex/issue-1144-style-lifecycle`。
冻结安装并构建主包及依赖后，在 HBuilderX alpha 的 Options 对照中，第 1 次保存就复现：

```text
[plugin:vite:css] [postcss] …index.uvue?vue&type=style&index=1&…&lang.css:10:7: Unknown word
{{ theme.themeClass }} · {{ theme.modePreference }} · {{ theme.resolvedMode }}
```

页面没有进入本轮 marker。失败证据位于
`e2e/.artifacts/web-hmr/issue-1144-uni-app-x-web-1788853711949`。

本次修复后使用的是 **5.5.2 基线上的本地构建**，不是已经发布的 npm 修复版。
上一轮 npm 5.5.2 的独立消费证据仍保留在
[发布包验证记录](https://github.com/sonofmagic/weapp-tailwindcss/blob/95026254550227263142afc7ab1f3002796e78fa/docs/engineering/lessons/npm-5.5.2-verification.md)。

## 根因与纠正

首次 SFC 转换会追加局部 utility style 块，但原有 `handleHotUpdate` 在框架之后执行。
HBuilderX 的 `uni:css-scoped` 会包装 `ctx.read()`、给作者块补 `scoped`，Vue 又使用这个读取结果建立 HMR 描述符。
此时描述符只认识原始 style 块，而主转换已经生成了额外块；插件在 post hook 重新转换加过 scoped 的源码时，局部规则又转移到了作者块。
旧生成块索引继续被请求，框架 loader 返回完整 SFC，模板最终进入 PostCSS。

另外，独立 `?vue&type=script&lang.uts` 子请求也进入了完整 SFC 转换。
它会用不含 style 的脚本覆盖同文件的作者/生成样式缓存，并替换待完成的主模块事务。
临时生命周期日志明确记录了“主模块生成 index 1 → 脚本子请求清空缓存”的顺序。
日志插桩本身改变时序后可出现整套通过，因此不能用单次偶然通过否定缺陷。
诊断日志保留于 `e2e/.artifacts/web-hmr/issue-1144-uni-app-x-web-1788853922832/server.log`，临时插桩已移除。

修复在 Web 的 pre HMR hook 中转换完整源码，再把结果交给后续 scoped、预处理与 Vue 描述符比较。
post hook 使用同一事务保留的原始源码，不再转换框架已经改写过的读取结果。
Web script/template/custom 子请求不再登记为完整 SFC；原生模板子请求仍走原有转换链。
对曾由插件生成、现在已移除的 style 索引保留所有权并返回空 CSS；作者块复用该索引时优先使用作者内容。
CSS 无须生成 utility 时，已完成的源码提取或清空仍必须作为有效 transform result 返回。

**仅为旧请求返回空 CSS 不足以修复问题**：真实 alpha 对照曾变为
`[plugin:vite:vue] Cannot read properties of undefined (reading 'scoped')`。
这证明必须先对齐框架描述符，不能只在 loader/PostCSS 末端处理错误输入。
最终实现同时处理描述符与子模块状态边界。

纠正上一轮记录和 [Issue 评论](https://github.com/sonofmagic/weapp-tailwindcss/issues/1144#issuecomment-5581188236)：
“第 9 轮切换 style 块”不准确。第 9 轮实际删除新增 important 节点并把 `pt.root` 从 `p-4!` 改为 `p-0!`；第 13–16 轮才切换组件 style 块。
失败发生在 style 子请求，不代表操作就是切换 style 块。本记录替代旧记录中这一操作描述及尚未验证的生命周期解释；保留旧失败证据。

CLI 补充验证还发现验收清理缺陷：服务先停止、浏览器后关闭，会让浏览器重连错误写回已返回的错误数组。
当时持久 `diagnostics.json` 的 errors 为空，16 轮均完成，但返回后的断言出现 `ERR_CONNECTION_REFUSED`。
runner 改为先关闭浏览器，再停止服务、恢复源码和关闭项目；每一步失败仍执行后续清理。
没有过滤运行期错误、修改警告断言或更新快照来掩盖失败。

## 验证

环境：macOS 26.6.2（25G83），Node 24.18.0，pnpm 11.25.0，Chrome 152.0.7977.77；
HBuilderX **5.25.2026082902-alpha**，host **HBuilderX**，内置 Vite **5.2.8**，日志确认 uni-app x **VDOM**、样式隔离 2.0。
主包实际解析为本 worktree 的 `packages/weapp-tailwindcss/dist/vite.cjs`，
PostCSS 为本 worktree `packages/postcss`（3.3.3），Tailwind 为 pnpm 安装的 4.3.3。
主包 manifest 仍为 5.5.2，版本号不用于冒充发布包验收。

```bash
pnpm install --frozen-lockfile
pnpm --filter weapp-tailwindcss... run build
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/uni-app-x test/bundlers --update=none
CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none
CI=1 E2E_ISSUE_1144_ALPHA=1 HBUILDERX_CHANNEL=alpha HBUILDERX_HOST=HBuilderX pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1144-alpha.test.ts --update=none
CI=1 E2E_ISSUE_1144_WEB=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1144-web.test.ts e2e/issue-1144-runner.test.ts --update=none
```

- 发布版/基线对照：原始 4 路径用例加入脚本子请求后 4/4 失败；保留生成索引后，再加入 scoped HMR 迁移用例仍 4/4 失败。最终同例通过，覆盖 POSIX、Windows 反斜杠/盘符、根路径与相对路径。
- uni-app x 与 bundler 回归：125 文件、1,517 测试通过；PostCSS：64 文件、709 通过、3 个既有跳过。
- CLI 与清理回归：2 文件、10 测试通过，CLI 的 16 轮保存与两次刷新通过，运行期错误断言保持不变。
- 最终拆分后的 alpha + static + runner：3 文件、13 测试通过。
- 最终 alpha：Options 与原始 setup 各 16 轮保存、两次刷新，共 32 轮保存与 4 次刷新。真实 `pt.root` class/CSS/computed style/marker 一致，important 和组件 style 删除/恢复正确；两组完整日志及浏览器 diagnostics 无目标错误。
- alpha Options 证据：`e2e/.artifacts/web-hmr/issue-1144-uni-app-x-web-1788855387181`；setup：`e2e/.artifacts/web-hmr/issue-1144-uni-app-x-web-1788855409399`。每组含 identity、initial、save-1 至 save-16 的 CSS/JSON/PNG、server.log 与 diagnostics；末轮 marker 为 `issue-1144-component-style-3`，宽 196px，真实 pt padding 为 0px。

限定 `issue-1144-uni-app-x-web` 重建生产 static 基线，**快照无差异**；随后关闭更新复验，并补 #1160/#1166 与 runner/matrix：

```bash
CI=1 E2E_PROJECT_FILTER=issue-1144-uni-app-x-web pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1144-static.test.ts -u
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1144-static.test.ts e2e/issue-1144-runner.test.ts e2e/issue-1160-static.test.ts e2e/issue-1166-webpack-radius.test.ts e2e/e2e-matrix.test.ts --update=none
```

该组 44 测试通过（runner 清理回归加入前），生产 Options/setup 均通过，#1166 使用真实 `postcss-calc@8.2.4`。

类型检查 `CI=1 pnpm typecheck` 仍失败。对照 worktree 的主包源码、锁文件和 tsconfig 与 baseline 一致，先构建相同依赖，再运行同一主包 `tsc --noEmit --noCheck false`：
baseline 438 条、本次 437 条。按路径、错误码、消息归一化比较无新增，少 1 条 HMR hook context 类型错误。
原始日志与比较结果位于 `e2e/.artifacts/issue-1144-fix/*typecheck*`。
首次未构建对照依赖的结果包含缺失模块，已废弃，不用于得出无新增结论。

构建与定向 ESLint（包括显式 `--no-ignore` 的产品测试）、`pnpm agents:check`、`git diff --check` 通过。
全量 core 最初只因文件行数超限失败，行为测试 3,448 项通过；随后拆出内部 Web HMR 模块和已有样式警告处理，行数限制与 uni-app x 192 项回归通过。最终 `CI=1 pnpm test:core --update=none` 全量复验通过（3,449 通过、35 个既有跳过），v8 行覆盖率 94.26%。

## 适用边界

本轮证明当前本地修复在上述 macOS alpha Web VDOM 链路有效。
Windows 仅有路径回归，没有新增 Windows HBuilderX 真机证据；Vapor 未取得。
未改变原生 utility 生成、公开配置/API/类型，原生分支经过现有单测，未把此前 Android/iOS/Harmony/微信设备证据冒充本轮验证。
全仓类型错误保持可见；本次不发布 npm、不合并、不关闭 #1144，需发布后再独立消费新版本确认。

通过仓库 `pnpm release --bump patch --summary … weapp-tailwindcss` 入口记录中文 change intent，
`pnpm release status` 只查看计划，没有执行 version/publish。

## 规则评估

不新增 AGENTS 规则。现有“沿构建生命周期定位、修复前后同例验证、真实 IDE 不可由单测替代”的约束已覆盖此次问题。
通过持久 HMR 描述符回归、两种脚本的 alpha 验收和资源清理回归落实规则。
