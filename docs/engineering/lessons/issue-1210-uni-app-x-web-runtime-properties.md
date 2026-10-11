---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1210
baseline: 190cda97f100120833a383496db41bbc9980f031
regressions:
  - packages/postcss/test/uni-app-x-author-apply.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/web-runtime-properties.test.ts
  - packages/weapp-tailwindcss/test/bundlers/uni-app-x-web-runtime-cleanup.test.ts
  - e2e/issue-1210-web.test.ts
  - scripts/ci/demo-matrix/output.test.mjs
  - packages/weapp-tailwindcss/test/source-line-limit.test.ts
---

# uni-app x H5 渐变和阴影的运行时变量丢失

Refs #1210。

## 症状

在 `uniAppX()`、Tailwind CSS v4、H5 样式隔离 2.0 和 scoped SCSS 下，渐变、阴影及局部 `@apply` 的计算样式可能为 `none`。手写渐变不依赖 Tailwind 运行时变量，因此仍然正常。

最小浏览器回归的四个用例在修复前失败。尚未复现 issue 所述 HBuilderX 删除动态 `var()` fallback；不能把该推测写成根因。

## 根因与纠正

1. uni-app x CSS hook 已拿到 Web 生成结果，却再次调用小程序 `styleHandler`。该管线把初始化选择器 `*` 转成 `view,text`，并进行小程序变量降级；`uni-view` 等真实 Web 节点无法得到默认值。Web 生成结果现在仅经过无转换的 PostCSS 映射阶段，保留原有生成依赖登记和 HMR 生命周期。
2. 局部 `@apply` 筛选把变量注册和默认值一起删除。作者规则筛选移入 `packages/postcss`，仅在 Web 分支保留实际使用的 `--tw-*` 注册与初始化；默认值仍取自 Web compat 读取的真实 `@property initial-value`，不引入静态默认值表。
3. 初次修复的直接 hook 测试没经过真实 scoped SCSS 清理。实际 demo 揭示更早的 apply-only 筛选与 scoped preflight 清理也会删除初始化。两层现在传递明确的内部保留策略，并用独立回归覆盖。普通 Web、小程序和 UVUE 的默认策略不变。

初始化继续位于工具类声明之前，使用低优先级的元素通配选择器。动态 fallback、via 停靠点、彩色阴影和 ring 组合保持为 CSS 变量链；没有套用 UVUE 静态展开策略。`webCompat: false` 仍保留原生注册，不新增用户配置。

## 验证

环境：macOS，Node 24.18.0，pnpm 12.4.1，Tailwind CSS 4.3.3；CLI 编译器 5.22（uni-app x VDOM），HBuilderX stable 5.24.2026081301。

通过：

- `pnpm exec cross-env CI=1 vitest run --project=@weapp-tailwindcss/postcss --update=none`：79 个文件，801 项通过，3 项原有跳过。
- `pnpm exec cross-env CI=1 vitest run --project=weapp-tailwindcss test/bundlers test/uni-app-x test/ci/architecture-contract.test.ts --update=none`：142 个文件，1632 项通过，覆盖普通 Web、小程序、UVUE 与构建器边界。
- `pnpm exec cross-env CI=1 vitest run --config scripts/ci/demo-matrix/vitest.config.mts --update=none`：73 项通过。static 检查支持合法的 `var(--spacing, .25rem)`，仍拒绝缺失依赖、非法 fallback 和错误倍数。
- `pnpm exec cross-env CI=1 E2E_ISSUE_1210=1 vitest run --config e2e/vitest.e2e.config.ts e2e/issue-1210-web.test.ts --update=none`：真实 CLI H5 页首次加载、同进程颜色替换、增加 via、删除 via、恢复、刷新通过；确认服务根目录身份及每轮 DOM 标识。覆盖两色/三色渐变、20%/80% 位置、普通/彩色阴影、ring、drop-shadow、局部 apply 和手写对照。
- `pnpm e2e:demo:matrix uni-app-x-vdom-tailwindcss-v4:h5 --update` 后运行 `pnpm e2e:demo:matrix uni-app-x-vdom-tailwindcss-v4:h5`：限定该 demo 的 static 基线更新及不更新验证均通过。基线差异是 Web 动态尺寸/颜色变量保留；浏览器实际尺寸与 HMR 矩阵通过。
- 生产构建归档由 Vite preview 提供服务，运行同一 issue E2E，设置 `E2E_ISSUE_1210_PRODUCTION=1` 和 `E2E_ISSUE_1210_URL`：计算样式通过。生产局部 CSS 仍含低优先级初始化及动态 fallback。
- `pnpm --filter @weapp-tailwindcss/postcss build` 和 `pnpm --filter weapp-tailwindcss build`，主包 `tsc -p tsconfig.build.json --noEmit --noCheck false --pretty false`，修改源码的 ESLint，`git diff --check` 和 `pnpm agents:check`。

失败与限制：

- HBuilderX 验证命令在上述 issue E2E 命令上增加 `E2E_ISSUE_1210_HBUILDERX=1`。IDE 编译日志确认 5.24、VDOM、样式隔离 2.0、编译成功，但首次加载期间持续出现 `App.uvue` 样式 HMR 与浏览器重载。停止本任务其他 dev 服务后复测仍然发生，无法稳定加载 marker，未进入同进程保存验收。尚未定位重载原因，也未证明它由本次修改引入；不把 IDE 编译成功算作 HBuilderX 页面通过。
- PostCSS 额外开启 `--noCheck false` 的严格类型检查失败。干净的基线 checkout 执行相同命令也失败，75 条诊断逐条对比相同；既有构建配置与构建命令通过。本次不混入无关类型修复。
- 未运行原生设备验收；原生分支的证据仅限自动测试。

原始证据位于忽略目录 `e2e/.artifacts/issue-1210/`：`portable`、`production` 包含每轮 CSS、计算样式、截图；`hbuilderx` 和 `hbuilderx-first-attempt` 包含两次 IDE 日志及失败截图；类型检查基线和当前日志分别保留。demo matrix 的构建副本和日志位于 `e2e/.artifacts/demo-matrix/uni-app-x-vdom-tailwindcss-v4-h5/`。

### PR 首轮 CI 纠正

[PR #1212](https://github.com/sonofmagic/weapp-tailwindcss/pull/1212) 首轮发现 `uni-app-x/vite.ts` 达到 504 行，触发已有 500 行源码门禁。本地先运行 `test/source-line-limit.test.ts` 重现，再将样式结果及 sourcemap 封装提取到 `vite/style-result.ts`，复用已有 Web/native 回归验证行为不变。先前定向测试没有包含该仓库级门禁，后续验证加入它。

首轮远端性能样本中，weapp-vite 构建中位数增加 5.90%（约 192ms），Taro Vite 插件构建中位数增加 5.59%（367ms）。同一源码与基线的本地独立副本以三次构建、三次 HMR 采样，按现有 5% 门禁计算，两项均通过。它们仍不能代替远端结果，也不能据此断定噪声根因；保留首次日志与本地样本，在 PR 中记录最终提交及其 CI 结果。没有放宽门禁或修改性能基线。

第二轮 CI 的 Linux、Windows demo matrix 暴露旧 `issue-1144-uni-app-x-web:h5` 基线遗漏：`text-slate-500` 从静态 `#62748e` 变为 `var(--color-slate-500,rgb(98,116,142))`，与本次保留 Web 动态变量的行为一致。本地先用 `pnpm e2e:demo:matrix issue-1144-uni-app-x-web:h5` 重现相同差异，再限定该项目加 `--update` 更新，最后重复不更新命令通过 static、首次加载、替换、增加和恢复 HMR 验证。其他基线没有批量更新。第二轮性能五个分片及汇总全部通过，源码行数门禁和三个完整单测分片也通过。

## 适用边界

仅针对 uni-app x 的 Web 生成样式分流与作者局部样式筛选。`@apply` 无法自行提供应用主题，主题仍由应用入口负责；隔离单测仅带入主题，刻意不带入全局运行时默认值，以免掩盖局部初始化丢失。重复转换与显式关闭 Web compat 都有回归。

## 规则评估

不新增 AGENTS。已有 CSS 包边界、构建生命周期、真实页面、static 基线和证据区分约束足够；补充可执行回归与本记录。HBuilderX 的持续重载需另行定位后补齐 IDE 验收，不能靠延长等待或忽略失败将其标为通过。
