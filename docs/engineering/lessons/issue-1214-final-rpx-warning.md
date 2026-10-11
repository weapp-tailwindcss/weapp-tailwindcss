---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1214
baseline: 887e16289cfaa3507d1332b342512bfcdd86037b
regressions:
  - packages/weapp-tailwindcss/test/tailwindcss/v4/rpx-theme-warning.test.ts
  - packages/weapp-tailwindcss/test/bundlers/rpx-theme-warning.integration.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-rpx-warning.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-rpx-warning.test.ts
  - packages/weapp-tailwindcss/test/bundlers/gulp-rpx-warning.test.ts
  - e2e/issue-1214-rpx-calc.test.ts
  - e2e/issue-1214-rpx-calc-watch.test.ts
---

# Issue #1214：在最终样式阶段诊断 rpx 主题风险

## 症状

5.5.11 中，默认配置的 `@theme { --spacing: 1rpx }` 即使最终已输出静态 rpx，仍会报告主题警告。首次安全构建还会消耗会话的一次提示额度，导致后续 watch 真正引入运行时风险时无法再次提醒。

## 根因与纠正

共享生成服务在构建器完成最终 calc 计算之前输出警告，并在确认存在运行时表达式之前标记会话已警告。生成中间结果不足以证明最终产物存在风险。

生成服务现在只记录各来源的 rpx 主题变量。Vite 在最终 calc 和单位转换之后检查 bundle；Webpack 在最终 CSS asset 收尾阶段检查；Gulp 在 transformWxss 或 adaptWxss 完成后检查，generateWxss 不提前提示。继续使用 PostCSS 包的诊断工具，不在主包引入 CSS 解析实现。

仅发现相关运行时 calc 才标记会话已警告。静态结果、未使用变量和解析失败均不占用额度；同一来源重新生成时替换其变量记录。平台、日志级别和会话隔离边界保持不变。

## 验证

修改前，新增诊断回归出现 4 项失败，包括静态结果仍警告以及缺少最终阶段入口；修改后通过。

以下定向回归使用 `CI=1` 和 `--update=none`：

- `pnpm --filter weapp-tailwindcss exec vitest run test/tailwindcss/v4/rpx-theme-warning.test.ts test/bundlers/rpx-theme-warning.integration.test.ts test/bundlers/vite-rpx-warning.test.ts test/bundlers/vite-css-finalizer.unit.test.ts test/bundlers/gulp.unit.test.ts test/bundlers/webpack.v5.unit.test.ts --update=none`：6 文件、252 项通过。
- `pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/gulp-rpx-warning.test.ts test/bundlers/webpack-rpx-warning.test.ts test/ci/architecture-contract.test.ts test/ci/generation-ownership.test.ts test/source-line-limit.test.ts --update=none`：5 文件、18 项通过。
- `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1214-rpx-calc.test.ts e2e/issue-1214-rpx-calc-watch.test.ts --update=none`：2 文件、19 项通过，含真实 uni-app 微信构建和同一 watch 进程的 7 个阶段。

对应项目为 `demo/uni-app-vite-tailwindcss-v4` 的 Issue #1214 临时测试项目；依赖为 Tailwind CSS 4.3.3、Vite 5.2.8、Vue 3.5.43、uni-app 3.0.0-5020620260917001（编译器 5.26）。先以同一 E2E 命令的 `-u` 更新 static 基线，再执行上述禁止更新的验证。仅 watch.json 新增两轮覆盖与移除覆盖三阶段；既有静态长度不变。

包依赖构建与 `pnpm --filter weapp-tailwindcss build` 通过；`pnpm architecture:check`、`pnpm release check` 通过。`pnpm release status` 确认中文 patch intent 由主包消费。中英文 spacing-rpx 页面通过 MDX 3.1.1 编译。ESLint 对本次非忽略文件定向检查，关闭仓库禁止使用的 format/prettier 规则，不运行 Prettier。

严格类型检查 `pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.build.json --noEmit --noCheck false --pretty false` 未通过：framework-source-scan-session.ts 第 443、444 行将 undefined 赋给必填函数。本次未修改该文件，基线已有相同错误和复现记录，见 [Issue #1245 导入归属复盘](issue-1245-wxss-import-ownership.md)。不把主包构建通过等同于严格类型检查通过。

## 适用边界

本次验证的是警告时机与构建产物，没有启动全仓或全端验收，也未重做微信设备上的 rpx 渲染验证。运行时保留的表达式仍需在目标设备验证；后续自定义插件可能继续改变产物。

108 页项目 unibestX 的完整性能对比仍待实施，不能由本次定向回归推导。原项目链接已补充到 [Issue #1245](https://github.com/sonofmagic/weapp-tailwindcss/issues/1245#issuecomment-5882238719)。

## 规则评估

不新增 AGENTS 规则。现有构建图、包边界和根因回归规则已覆盖该问题，通过持久回归和中英文文档说明诊断时机。
