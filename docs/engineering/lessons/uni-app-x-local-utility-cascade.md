---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: c6cdfff0c2fbd3e23c26c0b95f026429450ff9bc
regressions:
  - packages/postcss/test/local-utility-order.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/local-cascade.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/local-cascade-source.test.ts
---

# 自动局部别名应消费当前生成来源的 utility 顺序

## 症状

本轮 uni-app x 微信 watch 同一节点包含 `bg-[rgb(12,34,56)]` 和 `bg-[#000002]`。全局 WXSS 按 Tailwind 规则先生成 HEX、后生成 RGB；页面局部 WXSS 却先生成 RGB 别名、后生成 HEX 别名。两条局部选择器 specificity 相同，模板节点仅消费 `wtu-*` 别名，因此最终背景与全局 Tailwind 语义相反。

原始证据位于本轮 `e2e/.artifacts/uni-app-x-alpha/1d1886be-d916-415a-9ea6-568cccb041ff/wechat-followup/watch-complex-first-add/` 的源码、WXML 与 WXSS。最小持久回归使用真实 Tailwind CSS `4.3.3` 引擎重新计算参考顺序，不依赖固定别名或这份忽略的产物目录。

## 根因与纠正

局部样式收集器通过 Map 记录候选首次出现顺序，再逐条发出 `@apply` 规则。Tailwind 为独立 utility 排序，但不会重新排列作者的独立规则，导致模板遍历顺序越过局部 CSS 生成边界成为覆盖顺序。简单字典序或按 utility 名称分类都无法兼容变体、自定义主题与用户配置。

收集器仅给自己生成的规则添加可穿过 Sass 的保留注释。raw generation 已解析确切来源、配置与平台兼容主题后，调用该来源的 design system，一次查询所有局部候选的 `getClassOrder`。排名输入复用目标 rpx 候选及引擎候选规范化，避免不同写法对应同一候选时丢失别名。排序后的来源同时参与生成会话身份、正常编译和原有 fallback，不另建一套 runtime 来源推断。

PostCSS 包拥有 AST 排序：只在同一父节点、连续且已标记的规则之间移动；作者规则、作者注释、层级及未知排名都是稳定边界。`0n` 是有效排名，同排名维持原始先后，缺失排名不补零。内部标记即使遇到未知排名也被消费；无标记来源保持原对象，不触发额外 design system 加载。编译错误继续抛出，不用未排序 CSS 掩盖失败。

完整 `generateTailwindV4Css` 回归还揭示另一条路径：作者 CSS 重放会去掉原始 `@apply`，却把内部注释再次附加到结果。由 PostCSS 作者样式转换边界统一清理准确匹配的标记，同时保留其他作者注释，覆盖已处理及未处理作者样式。清理必须位于各分支原有的 source-media 片段修复之后，不能提前解析中间残片。

## 验证

- 改动前，`CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/uni-app-x/local-cascade.test.ts --update=none` 的 3 项均失败，实际别名顺序与真实全局生成顺序相反；修改后同一命令通过。
- 新增完整管线回归首先在 legacy/graph × Web/小程序的 4 项上确认标记残留；修复后扩展至延后适配，共 12 项来源/完整管线回归通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/uni-app-x test/bundlers/generator-css.unit.test.ts test/bundlers/multi-source-ownership.integration.test.ts test/bundlers/generator-author-functions.test.ts test/ci/architecture-contract.test.ts test/ci/generation-ownership.test.ts --update=none`：23 文件、425 项通过。覆盖模板顺序反转、跨节点、重复候选、条件变体、连续新增/替换/删除/恢复、源码主题切换、Sass 保留标记与编译失败。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/local-utility-order.test.ts test/tailwind-v4-user-css.test.ts test/uni-app-x-author-apply.test.ts test/rpx-candidate-compat.test.ts --update=none`：4 文件、36 项通过，覆盖父层级、作者边界、缺失与未知排名、零排名和稳定同排名。
- `pnpm --filter @weapp-tailwindcss/engine build`、`pnpm --filter @weapp-tailwindcss/postcss build`、`pnpm --filter weapp-tailwindcss build` 和 `pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false` 均通过。
- `pnpm architecture:check`、受影响源码 ESLint、`git diff --check`、`pnpm agents:check` 均通过，`pnpm release status` 确认中文 intent 覆盖 engine、PostCSS 和主包。ESLint 按仓库配置忽略 test 目录，测试通过由上述 Vitest 命令确认。
- 最终审查补出标记清理早于 source-media 残片修复的 2 项真实失败，并调整到各分支既有修复之后；PostCSS 定向 13 项、主包局部排序/完整管线 15 项均通过。新增 3 个测试文件显式执行 `eslint --no-ignore` 通过。
- 对应 VDOM demo 的 static 基线与真实 watch 由主任务整合后验证；Vapor 没有普通 static 入口，其历史原生产物与首屏证据见[工具链复盘](hbuilderx-vapor-toolchain.md)。本次没有启动浏览器或设备，不把同一插件实例的连续生成回归当作真实 HMR 或全端验收。

主任务整合后重建 engine、PostCSS 与主包，三个包构建通过；局部排序与 WXSS 产物归属的组合回归 3 文件、26 项通过。限定 `uni-app-vite-vue3-hbuilderx-tailwindcss-v4`、`uni-app-x-vdom-tailwindcss-v4` 和 `issue-1144-static` 三个 static 入口重生成基线，Git 内容无差异；随后显式 `--update=none` 复验 3 文件、4 项通过。命令保持 `CI=1 HBUILDERX_CHANNEL=alpha E2E_SKIP_OPEN_AUTOMATOR=1` 并使用本轮 Alpha 安装，原始日志分别为 `.tmp/uni-local-cascade-static-update.log` 和 `.tmp/uni-local-cascade-static-verify.log`。这是编译和产物验证，真实 watch 仍需在最终提交重新预检。

在提交 `fd81fee3c` 重新 prepare、完成真实后台 computer use 输入/点击/截图并 verify 后，轮次 `edab1850-3352-4d60-8eb1-56ece3a3875a` 的微信 IDE 3 项通过。真实 watch 的模板 `baseline-arbitrary`、`complex-corpus`、`hex-arbitrary` 新增/删除及已有节点 added-class 步骤完成；此前复杂集合的变量比较与局部层叠问题没有再阻断模板阶段。脚本 `baseline-arbitrary` 新增随后因 `text-[23.000068px]` 的类/CSS 证据缺失而失败，整轮退出 1，未自动重跑。清理前完整源码、产物和日志保存在该轮 `wechat-followup/watch-script-first-add/`。插件处理样本还出现 764–2801ms 的非首编 total，超过配置的 500ms 预算；功能失败先于最终性能判定，不能把这轮写成性能门禁通过。排序设计系统与生成会话存在重复加载，耗时贡献仍需定向测量。

## 适用边界

修复对齐 Tailwind 当前 design system 提供的候选级顺序；它按候选首个生成节点排名，不声称复现同一候选生成的多个 AST 节点互相交错的全部层叠关系。作者自己编写的规则顺序不被改动，局部别名身份和模板类名先后保持现有契约。平台不支持的伪类和条件规则仍由既有兼容管线处理。

## 规则评估

不新增 AGENTS。现有构建生命周期、精确来源和 PostCSS 包边界要求已足够，以真实引擎比较与完整重放管线回归固化，避免把排序推回模板遍历或静态类别表。
