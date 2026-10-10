---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1279
baseline: 39e1b6477a7107e06834e311e2eff7870ff4d9cc
regressions:
  - e2e/package-homepages.test.ts
  - packages/css-compat/test/package-versions.test.ts
  - e2e/lynx-structural.test.ts
  - e2e/lynx-text-flow.test.ts
  - e2e/lynx-fixture-diagnostics.test.ts
  - packages/weapp-tailwindcss/test/ci/release-trigger-workflow.test.ts
---

# #1279 版本 PR 的 CI 修复

## 症状

#1279 的初始 head 为 `b4a92649a93c1d38f2c4dcd9649323aba4802310`。
六个 css-compat portability job 均失败，PR Gate 后续被队列收尾取消。
main 的 homepage 契约和 Lynx 浏览器对照也存在真实失败。
本轮按 run、attempt 和 head 区分结果，不把同一名称的旧运行状态当作新 head 验收。

## 根因与纠正

- [旧版本 PR 的 Ubuntu Node 22 job](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38040696783/job/114180403561) 在 verify-package.mjs 中把待验证 tarball 版本硬编码为 0.1.0。生成版本 PR 后包已经是 0.1.1，实际产物正确，但断言错误；PostCSS 消费包的依赖检查也有相同硬编码。验证应从当前 source manifest 获取版本，并检查消费包产物传播了相同版本，初始公开版本维持 0.1.0。
- 主页检查的 expectedHomepages 遗漏 css-compat；包 manifest 的首页本身正确。修复公共包注册表，并保留真实 manifest 与网站路由校验。
- [旧 Benchmark 汇总](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38040696456/job/114180184017) 的错误来源是 `benchmark-shard result: cancelled`。最新旧-head Benchmark 38040696811 成功；此前 main 已修正汇总取消生命周期。该失败不构造性能代码补丁，不反复重跑旧 head。
- [当前 main static shard 1](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38045020396/job/114192781063) 再次确认主页登记遗漏，首次失败前已有 601 个测试通过。
- [当前 main Lynx focused job](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38045020396/job/114192781157) 的原始截图显示 Linux LCD 抗锯齿按 RGB 通道分别混色，结构字形的单 alpha 投影假设不成立。正常字形每行约 397 个边缘像素偏离模型，最大通道残差 72.76，像素 `(52,30)` 为 `[168,93,51]`。需要在依赖该模型的捕获入口固定灰度抗锯齿，同时保留原始严格阈值、真实 utility 消费和负向回归，不能靠纯版本范围判定宣称修复。
  结构与文字流入口共享 `textPixelBrowserOptions()`，显式后台启动并传入 `--disable-lcd-text`；原始 PNG 诊断同时保存实际启动参数。保留拒绝 LCD 色边污染的回归和真实截图的灰度残差检查；dark、grid、flex、skew 入口未改变。

## 验证

本地只执行受影响包、打包脚本和浏览器夹具的定向验证，正常测试设置 `CI=1`、`--update=none`。
css-compat 的 131 个包测试通过，包含 4 组真正调用 pnpm workspace pack 的版本传播回归：升级、预发布、`workspace:^`、`workspace:~`，并拒绝陈旧的 `0.1.0` 产物与消费依赖。
包 typecheck、build、独立 tarball 的四入口 ESM/CJS、双端声明与隔离安装依赖树验证通过；main 的 CSS Compatibility 38045020418 全部 8 个 job 成功。
集成后定向重跑 `packages/css-compat/test/package-versions.test.ts` 和 `e2e/package-homepages.test.ts`，各 4 个测试通过；5 个变更文件显式 ESLint 通过。
Lynx 定向验证命令如下，两个集合分别通过 40 和 24 个测试；后者实际重建 public Lynx 包与 RSpeedy 编码 bundle，覆盖 DPR 1/2.625/3、三字体文字流，以及删除 utility、错误换行、同步伪造粗体等反例。

```sh
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-structural.test.ts e2e/lynx-text-flow.test.ts e2e/lynx-fixture-diagnostics.test.ts --update=none --coverage.enabled=false
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-rspeedy.test.ts --update=none --coverage.enabled=false
```

7 个 Lynx 变更文件显式 ESLint、受影响入口 strict 类型检查与 diff 检查通过。测试浏览器使用 `try/finally` / `afterAll` 关闭，临时目录清理完成。
fixture 样式、生成 CSS 和 static 基线没有变化；当前本地证据来自 macOS，灰度修复效果仍须由新 Ubuntu focused CI 确认。

全部修复先提交 main，然后人工启动 Release prepare 重新生成 #1279；不向 `release/pnpm-version` 手工推送。
prepare 保留完整 native、质量和产物验证；不执行 npm 上传。

远端最终验收必须绑定重新生成的 PR head，核对全部触发运行而非只看 required checks；记录成功、跳过、取消与未完成。
旧 head 的成功、排队状态、或新运行的条件跳过均不写成已执行的测试通过。

## 适用边界

不发布 npm、不自动合并版本 PR、不关闭 issue、不启动本地全端验收。
保留 OIDC、branch protection、完整源码验收和 native 生命周期钩子。
不会通过降低浏览器阈值、删除失败断言、改 skipped 状态或篡改历史台账达成绿色。

## 规则评估

生成分支所有权、从真实版本推导验证目标、先复现再修复和取消生命周期均已有规则与契约测试，本轮优先补持久回归，不放宽门禁。
