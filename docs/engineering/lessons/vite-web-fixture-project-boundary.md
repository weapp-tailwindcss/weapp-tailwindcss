---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1303
baseline: 9401317080484a204ece4be39792b8a89d02770c
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-web-css-only.integration.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-app-type.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-dispatcher.unit.test.ts
---

# Generic Web 测试项目的边界

## 症状

[main CI 38687605168](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38687605168) 的第二单测分片中，全部测试断言通过，但 RSS 增量超过 4608MB 预算。相同 SHA、相同配置的首次与一次定向复测分别为 4893MB 和 5001MB；不继续重跑或提高预算。

两轮日志和采样均显示主入口的 Generic Web 构建期间出现大进程峰值。构建输出仅 0.81KB，而专用 Web 入口为 4.84KB；原断言只检查工具类存在，因此没有发现实际走入小程序框架链路。

## 根因与纠正

临时项目位于当前工作目录下，却没有自己的 `package.json`。真实 Vite root 的框架识别允许向上查找最近的 package 边界，以支持 root 指向包内源码目录；从仓库根目录运行测试时，该 fixture 继承了仓库的 `weapp-vite` 依赖，并按框架链路收集仓库级运行时类集合。从包目录运行时外层框架身份不同，掩盖了问题。

初步怀疑 dispatcher 错误扫描；核对 `src/framework/vite-root.ts` 及现有嵌套源码目录回归后，纠正为测试项目缺失边界。为构建和 HMR fixture 写入独立的私有 ESM manifest，保持生产框架识别行为。扫描断言同时覆盖主入口和专用入口；产物断言要求保留 Web 的 `:root`、`:host`，拒绝小程序 `page` 选择器。

## 验证

环境为 macOS、Node 24.18.0、Corepack pnpm 12.9.1、Vitest 5.0.4。结果来自 baseline 加本轮未提交测试修复；定向测试不等于完整 CI 分片。

补强扫描断言但未增加 manifest 时，仓库根目录执行稳定复现主入口一次 `collectRuntimeClassSet` 调用。补齐边界后两入口均不调用该收集器，5 项真实构建/HMR 回归通过。根目录原始四项用例耗时约 9 秒、进程树 RSS 峰值 1941MB、最大单进程 1502MB；修复后五项约 2 秒、进程树峰值 610MB、最大单进程 273MB。采样间隔为 1 秒、仅一次本地对比，不能据此推算完整分片的准确内存降幅。

```sh
CI=1 pnpm ci:memory --label pr1303-web-css-only-root-fixed --out-dir .cache/pr1303/local-memory -- pnpm exec vitest run --project=weapp-tailwindcss test/bundlers/vite-web-css-only.integration.test.ts --update=none --coverage.enabled=false
```

原始 CI 两次日志、JSON/Markdown 采样及本地前后报告存于忽略的 `.cache/pr1303/`。完整分片与重新生成版本 PR 的最新 head 仍需远端验收，不能把本地内存改善视为全矩阵通过。

## 适用边界

仅修正集成测试 fixture 与断言，不改变公开 API，不新增发布 intent。测试自行构建和检查临时 CSS 产物，未修改 demo、持久快照或 e2e static 项目。本轮未执行本地全面或设备验收。

## 规则评估

不新增规则。保留现有 package 边界语义和内存门禁，以真实构建回归约束测试身份，避免仅凭工具类存在宣称 Web profile 生效。
