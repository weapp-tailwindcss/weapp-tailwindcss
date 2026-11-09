---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1340
baseline: 0e99c0f1d96bb7848ff8c76e749fe80c02597f35
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-web-css-stage.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-uni-app-x-css-watch.integration.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/vite-native-style-requests.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/vapor-style-demo.test.ts
  - packages/weapp-tailwindcss/test/context/generation-snapshot-reuse.test.ts
verification:
  - claim: 原生 CSS 生成短暂返回 undefined 时保留同一编译快照中的已展开规则
    kind: unit
    status: passed
    sha: 0e99c0f1d96bb7848ff8c76e749fe80c02597f35
    environment: macOS，Node 24，pnpm 12，当前工作树
    command: pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-web-css-stage.test.ts --update=none
  - claim: 生成管线、uni-app x/Vapor 定向回归和架构契约通过
    kind: integration
    status: passed
    sha: 0e99c0f1d96bb7848ff8c76e749fe80c02597f35
    environment: macOS，当前工作树
    command: pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-web-css-stage.test.ts test/bundlers/vite-uni-app-x-css-watch.integration.test.ts test/uni-app-x/vite-native-style-requests.test.ts test/uni-app-x/vapor-style-demo.test.ts test/context/generation-snapshot-reuse.test.ts test/ci/architecture-contract.test.ts --update=none
  - claim: HBuilderX 与 Android 设备预检可用，但完整多端门禁未放行
    kind: native
    status: blocked
    sha: 0e99c0f1d96bb7848ff8c76e749fe80c02597f35
    environment: HBuilderX 5.34.2026102909，Android L204203G00581 / Android 7.1.2；预检 run f1d5ccdd-05e1-4121-9fad-1dbc5295dc64
    command: pnpm e2e:preflight prepare
---

# Android Vapor 原生 CSS 快照保留

## 症状

uni-app x Android Vapor 的多个独立 `<style>` 请求并发生成时，部分 Tailwind 工具类偶发消失。列表页可能丢失 `flex-1`，详情页可能丢失图片尺寸和 `flex-row`；H5 浏览器链路正常。

## 根因与纠正

`generateTailwindV4Css()` 的 `undefined` 有意表示无需处理、请求过期，也可能表示局部请求暂时没有结果。原生 CSS 调用方没有保存并校验上一份有效 CSS 快照，短暂空结果可能覆盖或清空已展开规则。

修复为原生快照保存来源和编译指纹：目标分支、输出文件、runtime revision、scope dependency revision 及候选集合。只有源码和指纹全部一致时才重放上一份已展开 CSS。源码删除或变化、配置/候选 revision 变化、Web/transient 请求和强制全量 HMR 均保持 no-op。生成管线各个 `undefined` 分支增加诊断信息，区分 no-op、过期和无结果。

## 验证

本地单元、uni-app x/Vapor 定向回归、架构契约、类型检查和核心包构建均通过。回归覆盖首次生成、短暂 `undefined`、源码删除、源码变化和编译 revision 变化。

本轮预检报告位于 `e2e/.artifacts/preflight/f1d5ccdd-05e1-4121-9fad-1dbc5295dc64/report.md`。HBuilderX 与 Android 探针通过；微信 IDE 连接失败、iOS 未指定唯一目标、Harmony 无目标、computer-use 未运行，故未宣称完成 Android Vapor 冷编译/增量编译和真机验收。

## 适用边界

当前记录只证明插件生成结果生命周期的通用修复和本地回归，不等同于已复现用户项目的全部页面，也不把 HBuilderX 内部编译器风险归因到插件。issue #1340 保留实际 IDE 产物的后续验收入口。

## 规则评估

不新增 AGENTS 规则。新增原生快照元数据、可观测日志和构建器回归已覆盖结果生命周期边界。
