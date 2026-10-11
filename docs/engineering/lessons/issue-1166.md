---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1166
baseline: df717fb9b77a732ab423564038a0aaf76d59e8c9
regressions:
  - packages/postcss/test/infinity-radius.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-infinity-radius.test.ts
  - e2e/issue-1166-webpack-radius.test.ts
  - packages/weapp-tailwindcss/test/ci/packed-runtime-dependencies.test.ts
---

# Issue 1166：Webpack 无限圆角的 PostCSS 交接边界

## 症状

Tailwind CSS 4.3.3 的普通、方向及逻辑圆角生成
`calc(infinity * 1px)`。隔离消费目录使用真实的
`postcss-calc@8.2.4`、`postcss@8.5.28` 和 Taro
`postcss-pxtransform@4.2.1`，在设计宽度 375、倍率 2 下，
Webpack 的 postcss-loader 报告 `infinity * 2rpx` 词法警告。
该配置可复现 Issue，但不代表已取得报告者完整项目或依赖树。

## 根因与纠正

Webpack 生成 loader 延迟完整小程序适配，原始无限长度先进入外部
PostCSS 解析器。最终产物再改为有限长度，无法撤销先前产生的警告。
仓库全局 override 使用能识别 infinity 的本地 calc 包，普通 demo
构建无法单独证明旧版外部解析器兼容。

在 PostCSS 包导出窄范围 AST helper，复用既有无限值识别规则与
9999px 常量，仅处理标准圆角属性、`--radius` 及
`--radius-*` 中完整的正无限 px/rpx 表达式。
Webpack 在返回下游 loader 和登记生成 CSS 之前调用 helper，
缓存与返回值一致；完整样式适配仍延迟执行，Web 目标不调用 helper。
字符串、注释、非圆角属性、零值、负值和复合表达式保持原样。

有限值仍参与 Taro 单位转换：demo 的默认设计宽度得到 9999rpx，
375 设计宽度页面得到 19998rpx。验收应断言有效有限长度，
不能把最终值固定为 9999px。

PR 的跨平台隔离消费检查最初只打包主包，安装时拉取已发布的旧
PostCSS 包，因而缺少新增 helper。消费验证现在按 manifest 收集
workspace 运行时依赖闭包，一并打包并覆盖安装，包含 scoped calc，
排除 devDependencies。pnpm 11 的 overrides 写入消费项目的
`pnpm-workspace.yaml`；`file:` 依赖使用路径说明符并保留空格，
不能按文件 URL 百分号编码，否则带空格的临时目录无法安装。

## 验证

- `pnpm install --frozen-lockfile`、`pnpm build:pkgs`：通过，30 个构建任务实际执行。
- `pnpm --filter @weapp-tailwindcss/postcss test --coverage.enabled=false --update=none`：709 项通过，3 项既有跳过。
- `pnpm --filter @weapp-tailwindcss/postcss-calc test --coverage.enabled=false --update=none`：206 项通过，3 项既有跳过。
- `pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/webpack-infinity-radius.test.ts test/bundlers/css-imports.test.ts test/bundlers/webpack.v5.unit.test.ts --coverage.enabled=false --update=none`：197 项通过。
- `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1166-webpack-radius.test.ts --update=none`：两项通过。修复前真实 Webpack 构建触发目标警告；修复后无 warnings，方向与逻辑圆角有效，普通 10px 仍转换为 20rpx。Web 目标在关闭额外兼容转换时保留原始无限圆角及 10px 尺寸。测试通过独立 manifest 解析并断言 calc 版本为 8.2.4，已接入 PR core smoke。
- `TARO_BUILD_STRICT=1 pnpm --filter @weapp-tailwindcss-demo/taro-webpack-react-tailwindcss-v4 build:weapp`：生产构建通过；仍有既有产物体积提示，无目标 calc 警告。非交互式运行必须显式启用 strict，避免 guard 跳过构建。
- `pnpm e2e:multiplatform-build:taro-alipay`：支付宝构建及两项产物回归通过。
- `E2E_PROJECT_FILTER='^taro-webpack-react-tailwindcss-v4$' pnpm e2e:static:u e2e/taro-webpack-react-tailwindcss-v4.test.ts`：10 项通过，重新生成对应项目基线；提交的变化包括圆角单位、方向圆角及新增页面类名。
- `E2E_PROJECT_FILTER='^taro-webpack-react-tailwindcss-v4$' pnpm e2e:static e2e/taro-webpack-react-tailwindcss-v4.test.ts`：重新构建后 10 项通过，未更新快照。该测试入口会先清理输出，曾误用 `E2E_SKIP_BUILD=1` 导致缺失产物；正常复查应保留构建。
- PostCSS 构建产物的 ESM/CJS 导出均可调用新 helper，类型声明随包构建生成。
- `pnpm --filter weapp-tailwindcss exec vitest run test/ci/packed-runtime-dependencies.test.ts --coverage.enabled=false --update=none`：10 项通过，覆盖依赖闭包、循环与缺失依赖，以及 POSIX/Windows、根目录、盘符、相对路径和空格。
- `pnpm e2e:windows-utilities`：在本地 macOS 实际运行通过，已发布基线与候选依赖闭包的开发/生产四种构建均通过全部产物断言；两个修改的 CI 脚本通过 ESLint。
- `pnpm test --coverage.enabled=false --update=none`：5,093 项通过、45 项既有跳过；`pnpm lint` 通过。
- `E2E_WATCH_MINI_PROGRAM_ONLY=1 E2E_WATCH_CASE=taro-webpack-react-tailwindcss-v4 E2E_WATCH_COMMAND_TIMEOUT_MS=900000 pnpm e2e:watch`：原生 dev 启动检查通过。轮询重建覆盖主页面模板、脚本、样式、内容以及普通/独立分包，底层 runner 全部通过并生成完整报告；外层命令先到达 900 秒超时，故该命令整体记为失败。随后使用现有 `assertHotUpdateReport` 独立复核完整报告，通过所有断言，不重复执行已经完成的重建。
- 原生 watch 专项：执行 demo 的 `pnpm --filter @weapp-tailwindcss-demo/taro-webpack-react-tailwindcss-v4 dev:weapp`，以 `WATCHPACK_POLLING=100` 保持同一进程，依次把 `rounded-t-full` 替换为 `rounded-b-full`、删除该方向类、恢复原类。四次编译均成功；每轮遍历实际 `.wxss` 产物，断言新类圆角为正有限长度、旧方向类消失，完整日志无 calc 词法警告。验证后恢复源码并结束自建进程。探针同时读取 stdout/stderr，Webpack 完成信息会出现在 stderr，不能只监听 stdout。
- `pnpm typecheck`：438 条既有错误。在独立、未修改的上述基线 worktree 使用同一依赖执行核心包严格 tsc，错误逐条一致，本次新增错误为 0。

## 适用边界

提前归一化仅用于 Webpack 的 Tailwind v4 小程序生成结果；不增加配置，
不修改 Web 默认行为，也不扩大到非圆角 infinity 表达式。
当前证据覆盖构建器和产物，未宣称已验证用户设备上的圆角渲染。
正常测试使用 `CI=1` 与 `--update=none`；更新基线单独执行。

## 规则评估

不新增 AGENTS 规则。既有 AST、loader 生命周期、隔离消费验证及
static 基线要求足以约束本次修复，长期保证由上述回归测试承担。
