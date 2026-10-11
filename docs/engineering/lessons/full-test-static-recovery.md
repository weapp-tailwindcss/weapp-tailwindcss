---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss
baseline: 712e9647507a76799ea6abe98c7f29fea5af60e3
regressions:
  - e2e/uni-app-vite-tailwindcss-v4-layer-output.test.ts
  - e2e/apps-generator-mode-compare.test.ts
  - e2e/preflight-evidence.test.ts
  - e2e/preflight-gate.test.ts
  - e2e/preflight-probes.test.ts
  - e2e/watch-command-budget.test.ts
  - e2e/watch-command-lifecycle.test.ts
---

# 全面测试中的静态基线与门禁诊断

## 症状

完整 static 批次执行 112 个文件，571 项通过、33 项既有条件跳过、2 项失败。uni-app H5 生成器报告的主入口比基线少 1735 字节；门禁集成回归在领取报告时报告身份变化。

## 根因与纠正

uni-app 的主包 Tailwind 配置显式排除了 pages-order，但旧 H5 基线仍在主入口保留该分包专用的 18 个选择器。当前产物将它们保留在订单页引用的 CSS 中，完整选择器集合仍为 324 项。两种 H5 模式均补充主样式排除、页面样式保留及产物 JS 引用断言。

限定 uni-app 项目重新生成基线时，还确认 App 基线遗漏此前 5.26 编译器升级的变化：checkbox、radio、slider 暗色样式及 rich-text selectable 规则增加，订单页专用工具类从 app.css 移入页面 CSS。仅更新该项目的生成器产物及汇总报告，未修改生成器或放宽快照断言。

门禁失败曾在定向运行中再次出现，后续诊断运行未重现，根因尚未确认。身份比较增加变化字段名称，保留原有阻断条件，不输出配置值、不自动重试、不复用已领取报告。该诊断改进不代表间歇失败已修复。

完整复测继承真实设备绑定后，Android 探针单测暴露环境隔离遗漏：模拟列表只有 emulator-test，但真实运行和截图设备变量仍被读取，导致测试先进入歧义或指定设备缺失分支。测试在 beforeEach 清空 Android 目标变量，再由各用例显式设置，并通过已有 afterEach 恢复；真实探针与门禁继续使用已绑定设备，所有原断言保留。

8 个 demo 的直接热更新链路全部通过后，watch 套件的 Webpack Vue3 场景在普通分包阶段被命令执行器取消。总命令预算只按 demo 数量计算，将主包、两个分包及 Web 的串行验收合并成一个 420 秒预算。修复按所选主包、分包和 Web 验收面累计总预算，并复用 runner 的用例选择器处理平台和分片；显式命令超时覆盖、单次更新、插件处理及内存门槛不变。原公式在新增回归中失败，修复后预算、scope 和取消清理的 14 项定向测试通过，真实完整 watch 复测已通过：9 个文件、12 项测试通过，5 个文件、12 项既有条件跳过，耗时 2959 秒。

## 验证

- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-vite-tailwindcss-v4-layer-output.test.ts --update=none`：5 项通过，包含 webCompat=0/1。
- `CI=1 E2E_PROJECT_FILTER='^uni-app-vite-tailwindcss-v4$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/apps-generator-mode-compare.test.ts -u`：限定该 demo 重新生成 36 份快照；审查 H5 与 App 的选择器、组件样式和归属差异。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/preflight-gate.test.ts e2e/preflight-evidence.test.ts --update=none`：34 项通过，身份变化仍严格拒绝。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/watch-command-budget.test.ts e2e/watch-command-scopes.test.ts e2e/watch-command-lifecycle.test.ts --update=none`：14 项通过；旧预算公式的 2 项失败已保存。
- 本地直接热更新 `pnpm e2e:hot-update`：8 个 demo 全部通过，165 个计时样本；后续 watch 执行器超时仍作为独立失败保留，不用该结果替代 watch 契约验收。

## 适用边界

App 静态 CSS 通过不能代替设备运行、结构探针、HMR 或截图验收。本记录不宣称全面验收通过，也不将 Windows/Linux 视为本机实测。

## 规则评估

不新增或放宽 AGENTS 规则。已有配置、产物归属断言和限定项目的基线足以表达此次 CSS 语义；门禁后续故障应依靠变化字段和原始证据继续定位。
