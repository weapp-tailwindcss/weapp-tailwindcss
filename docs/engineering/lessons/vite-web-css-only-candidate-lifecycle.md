---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/commit/4ca235ff7aa54bf12c619a88aded8edd949361e9
baseline: 4ca235ff7aa54bf12c619a88aded8edd949361e9
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-web-css-only.integration.test.ts
  - packages/weapp-tailwindcss/test/vitest/vite.test.ts
---

# Vite Web CSS-only 的候选生成与 HMR 模块登记

## 症状

Node 24.18.0、Vitest 5.0.0、Tailwind CSS 4.3.3 下，普通全量单测通过，但核心覆盖、全量覆盖及单 worker 最小复跑均出现 4 项失败：Web CSS-only HMR 超时、两个 Vite 构建超时，以及随后缓存用例的快照差异。

## 根因与纠正

CPU 采样将主要耗时定位到 Tailwind `getVariantOrder` / `compare`。进一步记录真实生成参数发现，CSS-only 构建先从仓库根目录扫描 53686 个候选并生成项目级运行时类集合，再按当前 CSS 声明的来源处理实际需要的 8 个候选。覆盖采集放大了前一次无关生成的排序成本。

Web CSS-only 不承担 JS/template 类名转译，不需要提前生成这种运行时类集合。改为消费既有源码候选收集器；CSS 的显式来源、配置、内联候选继续由生成器负责。保留 runtime 初始化和配置刷新，不改变其他框架的运行时类集合路径。

移除冗余生成后，HMR 回归进一步暴露：CSS-only 插件创建了新的空 module id 集合，而入口登记器维护的是另一个集合。热更新因而找不到需要失效的 CSS 模块。改为直接复用登记器返回的 `moduleIds`，让首次登记与后续失效使用同一状态。

## 验证

- 原始 `CI=1 pnpm test:core --update=none`：3626 passed / 4 failed / 35 skipped。
- 原始两个文件带覆盖、单 worker 复跑：相同 4 项失败，未更新快照。
- 新增“CSS-only 不收集项目级运行时类集合”的真实构建回归，修复前失败。
- 中间修复移除重复生成后：Vite 构建用例通过，HMR 在 updated 阶段明确失败。
- 共用 module id 集合后：两个文件带覆盖、单 worker 验证 8 passed / 2 skipped，约 21 秒完成。HMR 同一实例中验证首次缺少未来类名、替换时删除旧类、最终删除候选。
- 修复后 `CI=1 pnpm test:core --update=none`：3631 passed / 35 skipped，语句覆盖率 94.53%、分支覆盖率 88.68%。
- 修复后 `CI=1 pnpm test --update=none` 和 `CI=1 pnpm test:coverage --update=none`：均为 5471 passed / 43 skipped；全量覆盖语句 83.07%、分支 78.63%。

本轮原始证据位于 `e2e/reports/local-full-run/2026-09-17-full/`：`core-minimal.cpuprofile`、`logs/candidate-source-trace-stderr.log`、`logs/web-runtime-scan-red.log`、`logs/web-runtime-scan-green.log`、`logs/web-runtime-hmr-green.log`、`logs/repair-test-core.log` 和 `logs/repair-test-coverage.log`。

## 适用边界

以上证据覆盖真实 Vite 构建和开发服务中的 CSS 请求、源码变化与失效，不替代浏览器计算样式、截图或原生设备验收。全端 E2E 尚在执行，因此本记录保留 partial 状态。未放宽超时、未更新失败快照、未改变小程序 classNameSet 精确命中原则。

## 规则评估

不新增 AGENTS 规则。已有构建图、生命周期和状态边界要求足够；通过共享入口登记状态和持续回归落实。
