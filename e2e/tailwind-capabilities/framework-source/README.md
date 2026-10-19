# 真实 React / Vue 源码执行

`runFrameworkSource(context, engine, borrowedBrowser?)` 输出 `framework-source/report.json`。统一 Web 调度传入本引擎共享的 Browser；runner 只创建并关闭自己的 context 和单个工作页面，独立调用时才创建并关闭自己的后台 Browser。真实浏览器执行由主调度负责，本目录的协议单测使用 mock。

React JSX 和 Vue SFC 各有条件、数组、对象、静态模板、映射、merge、cva、variants 和动态插值负向，共 18 例。每例使用独占的任意宽度候选，防止同一页面其它语法补足扫描结果。CSS 的 `source(none)` 配合单一 `@source "./Probe.tsx"` / `Probe.vue`；预期数据、运行器和运行时依赖目录都不作为扫描来源，不注册官方 Tailwind 生成插件，不传 inline source 或显式 candidates。

样式由 `WeappTailwindcssWeb` 生成。React 和 React DOM 复用已安装的 Taro React demo 依赖，JSX 由 Vite 转换；Vue 复用现有 Vue 与官方 `@vitejs/plugin-vue`。merge/cva/variants/runtime/escape 通过精确别名绑定当前工作树源码；Web 夹具显式使用 `escape:false, unescape:false`。此处证明 Web raw 模式下的动态合并、变体切换和 A→B→A 缓存消费，不能代证小程序转义、React Native 或 Lynx 原生宿主。

夹具从 initial 空宽度开始，实际保存 added、replaced、deleted 源码并刷新；每轮执行按钮切换的 before、after、restored。保存前先登记自动更新信号：React 等待默认 Vite 完整导航及准确 marker，Vue 等待真实 SFC marker 更新，两者网络空闲后才执行明确刷新，避免自动导航与手动刷新竞争。断言覆盖完整 class token、宽度、padding、活动分支、准确源码 marker、服务实例、当前文档 session 及同轮节点身份。明确刷新必须换文档，按钮切换必须保留文档和节点。源码 CSS 同时检查两支候选及动态插值排除；动态拼接会在 DOM 形成类名，但其宽度必须仍为 80px 基线，不能假装可静态扫描。

这组用例验证真实框架消费和刷新后的源码增删替换，不声明 WebSocket、同页面 HMR 或像素通过。通用 HMR 由独立 runner 提供。截图只作人工审查材料；源码、最终 CSS、逐态测量、日志和失败页面一并保存。

现有 `framework-regressions` 执行 `e2e:frameworks:mp`，覆盖 Taro/Mpx/uni/weapp-vite 的小程序构建、转义、IDE 标记和既有 watch 用例；它没有为本目录 18 种写法逐例声明浏览器分支、节点、缓存和 computed style 合同。因此这两套报告应分别汇总，不能把已有框架回归成功扩大为这里逐项通过。

CLI 接入时将 `frameworkSourceProfiles` 纳入 Web 组选择，调用 `runFrameworkSource(context, engine, sharedBrowser)` 并把返回报告纳入严格汇总；异常报告读取路径为 `framework-source/report.json`。
