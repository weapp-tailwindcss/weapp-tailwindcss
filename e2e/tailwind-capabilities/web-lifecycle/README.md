# Web 原生生命周期夹具

本模块补充 `starting` 与 `details-content`，借用统一入口传入的后台 `Browser`。只创建一个 context/page，成功、失败和清理异常均在报告中保留；不启动浏览器、不修改用户 profile。

`runLifecycleWeb(context, engine, browser)` 将 schema v2 报告写到本轮目录的 `lifecycle/`。案例为 `runtime/lifecycle-starting` 与 `runtime/lifecycle-details-content`。公开夹具数据为 `lifecycleWebProbes`、`lifecycleWebCandidates` 和 `lifecycleWebFixtureCss`；主调度、coverage 与 static 更新由统一入口接线。

`starting:opacity-0` 的最终状态为 opacity 1。第一轮完整记录自然 rAF 帧与 transition 事件；第二轮移除后重新插入，记录自然前进，再暂停唯一的原生 `CSSTransition` 采样起点与中点。截图使用 `animations: 'allow'`，前后核对同一原生对象的目标、属性和暂停时间。恢复到保存的自然进度后播放至原生结束，再采样准确终点。白底、`#123456` 前景与中点 RGB `[137,154,171]` 均预先声明，不从实测 opacity 反推预期。

`details-content:bg-[#123456]` 放在原生 details。候选与无 class 对照分别经过可信点击打开、关闭、键盘打开、键盘恢复关闭，每一步等待该目标新产生的 toggle。固定槽中的内容像素、summary 空白区域、原生 open、UA 伪元素背景、content-visibility 与布局高度共同判断。关闭时伪元素仍命中背景声明，但内容区域应恢复白色且布局收缩；内容子节点保持透明。

合同从原始帧、事件、像素和恢复记录重算关键结论。功能探针、超时或浏览器差异保留 failed/blocked 原因，不把本轮失败改为 unsupported。HTML、布局 CSS、观察脚本、运行 URL、run ID、fixture hash、独立期望与产物回执进入同一报告身份。

纯合同入口：`pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-web-lifecycle.test.ts e2e/tailwind-web-lifecycle-runner.test.ts --update=none`。它验证原始证据缺失、错误状态、对照污染、快进与资源清理，不启动浏览器，也不代表跨引擎验收通过。实际运行需本轮统一预检及生成 CSS/static 基线接线。
