---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 6300019672793344d98c32b7b3c011c7207a0c12
regressions:
  - e2e/frameworkIdeHotUpdateArtifacts.test.ts
  - e2e/hbuilderx-local-styles.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-output-errors.unit.test.ts
---

# IDE 热更新的样式导入诊断

## 症状

Alpha 5.31 的 uni-app x 微信增量构建将页面的 `../../uvue.wxss` 引用带入根 `main.wxss`。用户看到 WXSS 文件编译错误，E2E 却只报告产物未更新超时。首次失败保存在预检轮次 `742b8b31-d1d0-433e-93b9-1968abf8e335` 的 `06.log` 和 `wxss-first-failure/mp-weixin`，后续阶段没有调度。

## 根因与纠正

产物收集错误地把项目 cwd 当作小程序输出根；`/app.wxss` 被当作宿主系统绝对路径忽略，而错误的相对引用解析到项目内的输出根外，抛出 ENOENT。语义等待回调无条件吞掉该异常，最后仅留下 mtime 超时提示。

IDE watch 现在从框架矩阵的 `resolveFrameworkSupportPaths` 传递明确的 `miniprogramRoot`。样式遍历复用 PostCSS 导入解析，以输出根解释小程序根导入、以当前样式解释相对导入，拒绝越界读取；缺失依赖保留导入方、请求、目标和原始 cause。循环通过 visited 去重，仅用于遍历，不宣称循环本身是合法的编译图。

等待仍允许构建替换文件期间的短暂缺失；若持续失败到超时，保留最近一次语义异常。读图恢复后清除旧错误；编译进程退出仍保留自身错误，不被旧读图异常覆盖。产品侧的样式所有权修复另行提交，不通过修改生成文件或忽略错误导入恢复测试。

## 验证

- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/frameworkIdeHotUpdateArtifacts.test.ts e2e/hbuilderx-local-styles.test.ts --update=none`：13 项通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-output-errors.unit.test.ts test/watch-hmr-class-evidence.unit.test.ts test/watch-hmr-regression.unit.test.ts --update=none`：161 项通过。
- 回归覆盖项目根与输出根不同、根导入、页面相对导入、越界但外层同名文件存在、缺失依赖、多条同行导入、注释与字符串、POSIX/Windows 路径和等待中的恢复/退出。
- 对保留的真实失败产物再次运行读取，明确报告 `app.wxss → uvue.wxss → main.wxss → ../../uvue.wxss` 的越界链。仓库正式 `pnpm typecheck`、改动文件 ESLint、`pnpm agents:check` 和 `git diff --check` 通过。额外的脱离项目配置的单文件 tsc 会遍历 PostCSS 源码并报告既有类型不一致，不将它计为通过，也不修改项目检查配置。

## 适用边界

这些结果证明产物读取与失败诊断准确，不代表已修复 WXSS 生成或通过真实设备 HMR。此次修改不改变 demo 或生成样式，因此不更新 static 基线。真实编译修复后仍需重新预检并验证 IDE。

## 规则评估

不新增规则。现有输出根身份、失败证据和跨平台路径规则已经覆盖本问题，以共享读取和持久回归落实。
