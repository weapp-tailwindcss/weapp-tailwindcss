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
    sha: e8ec9f7f6de25e503e234d6e188744629044bcdf
    environment: macOS，Node 24，pnpm 12，当前工作树
    command: pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-web-css-stage.test.ts --update=none
  - claim: 生成管线、uni-app x/Vapor 定向回归和架构契约通过
    kind: integration
    status: passed
    sha: e8ec9f7f6de25e503e234d6e188744629044bcdf
    environment: macOS，当前工作树
    command: pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-web-css-stage.test.ts test/bundlers/vite-uni-app-x-css-watch.integration.test.ts test/uni-app-x/vite-native-style-requests.test.ts test/uni-app-x/vapor-style-demo.test.ts test/context/generation-snapshot-reuse.test.ts test/ci/architecture-contract.test.ts --update=none
  - claim: HBuilderX 与 Android 设备预检可用，但完整多端门禁未放行
    kind: native
    status: blocked
    sha: e8ec9f7f6de25e503e234d6e188744629044bcdf
    environment: HBuilderX 5.34.2026102909，Android L204203G00581 / Android 7.1.2；预检 run f1d5ccdd-05e1-4121-9fad-1dbc5295dc64
    command: pnpm e2e:preflight prepare
  - claim: iOS Vapor 目标生成订单相关原生样式并可启动真实页面
    kind: native
    status: passed
    sha: ca0d1e1652aec72f26c29007a3569b0fbc4e2feb
    environment: HBuilderX 5.34.2026102909，iPhone 17 Pro 模拟器
    command: HBuilderX CLI launch app-ios --compile false --iosTarget simulator --deviceId <本轮预检绑定的 iOS 模拟器>
  - claim: Harmony Vapor 目标生成订单相关原生样式，但 HAP 签名阻塞安装
    kind: native
    status: blocked
    sha: ca0d1e1652aec72f26c29007a3569b0fbc4e2feb
    environment: HBuilderX 5.34.2026102909，Harmony 设备在线
    command: HBuilderX CLI launch app-harmony --compile false --deviceId <本轮预检绑定的 Harmony 设备>
---

# Android Vapor 原生 CSS 快照保留

## 症状

uni-app x Android Vapor 的多个独立 `<style>` 请求并发生成时，部分 Tailwind 工具类偶发消失。列表页可能丢失 `flex-1`，详情页可能丢失图片尺寸和 `flex-row`；H5 浏览器链路正常。

## 根因与纠正

`generateTailwindV4Css()` 的 `undefined` 有意表示无需处理、请求过期，也可能表示局部请求暂时没有结果。原生 CSS 调用方没有保存并校验上一份有效 CSS 快照，短暂空结果可能覆盖或清空已展开规则。

修复为原生快照保存来源和编译指纹：目标分支、输出文件、runtime revision、scope dependency revision 及候选集合。只有源码和指纹全部一致时才重放上一份已展开 CSS。源码删除或变化、配置/候选 revision 变化、Web/transient 请求和强制全量 HMR 均保持 no-op。生成管线各个 `undefined` 分支增加诊断信息，区分 no-op、过期和无结果。

## 验证

本地单元、uni-app x/Vapor 定向回归、架构契约、类型检查和核心包构建均通过。回归覆盖首次生成、短暂 `undefined`、源码删除、源码变化和编译 revision 变化。

Android 冷编译产物已确认保留有效快照：订单列表模块 722 B、订单卡片 3574 B、待付款商品 3132 B、收货区 1860 B；详情金额和支付栏也保持完整。iOS 与 Harmony 的对应文件分别为 726/3562/3137/1868 B，Harmony 中间产物与 iOS 完整结果一致。样式字节码通过 `strings` 可见 `wtu-*` 工具类标识和 `--tw-*` 展开变量；未发现裸 `@apply`。

iOS 编译后使用调试基座真实启动，截图保存在用户案例隔离副本的 `evidence/ios-running.png`，显示首页已渲染，首次运行停在定位权限弹窗，因此未把订单页截图冒充为业务页面验收。Harmony 编译已生成 52 个 `.style.bytes` 文件并进入 Hvigor 打包，但在 `SignHap` 阶段因配置引用的签名证书文件不存在而失败；没有修改签名配置，也没有把在线设备误报为运行通过。

本轮预检报告 `e2e/.artifacts/preflight/678c317c-7895-4d05-87d7-e80f929cfd42/report.md` 仍未放行全面多端门禁：微信 IDE 连接和 Android UI 探针失败。该阻塞与插件层回归、Android/iOS 构建产物证据、Harmony 签名阻塞分别记录，不能用旧报告替代。

## 适用边界

当前记录只证明插件生成结果生命周期的通用修复和本地回归，不等同于已复现用户项目的全部页面，也不把 HBuilderX 内部编译器风险归因到插件。issue #1340 保留实际 IDE 产物的后续验收入口。

## 规则评估

不新增 AGENTS 规则。新增原生快照元数据、可观测日志和构建器回归已覆盖结果生命周期边界。
