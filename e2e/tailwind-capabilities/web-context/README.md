# 独立浏览器上下文变体

`runContextWeb(context, engine, browser)` 借用统一 suite 已启动的同一个 headless browser，将本 runner 的报告保存到传入目录的 `context/report.json`。它按需复用 desktop、touch、noscript 三个独立 context，每个 context 只使用一个 page；全部在 finally 关闭，绝不关闭调用者的 browser。

本目录固定七条正向 runtime 合同。4 个 pointer/any-pointer coarse/fine 变体在 hasTouch false/true 设备上下文中核对全部六种 pointer 查询，并用真实 click/tap 的可信 PointerEvent 验明鼠标或触摸输入。noscript 使用 javaScriptEnabled false 上下文，同时检查 scripting 媒体、页面脚本是否运行和原生 noscript 内容可见性，再回到原脚本上下文做负向对照。

user-valid/user-invalid 使用原生键盘逐字输入、Tab 失焦、真实按钮提交和 form reset。合同明确要求 pristine、invalid-blurred、invalid-submitted、valid-blurred、valid-submitted、reset 六状态的颜色、CSS pseudo 匹配、原生 validity、值和可信 input/change/blur/invalid/submit/reset 事件。页面脚本只记录事件并阻止有效提交导航，不写入 value、不调用 setCustomValidity，也不 dispatchEvent。初始空值本来无效，不能据此提前通过 user-invalid。

每状态同时检查无候选 class 的 control 背景，保存原始测量、事件日志和 PNG。样式、环境及生命周期有任意缺失或错误都失败；浏览器不支持真实上下文/伪类时也按固定 supported 预期记录失败，不能在本轮自动改成 unsupported 或跳过。

`contextCandidateList` 和 `contextFixtureCss`（同源名称 `contextWebCandidates`、`contextWebFixtureCss`）是 source/static 基线的纯数据入口。接入现有统一 baseline 时应使用产品生成器 `target:web`、这七个候选和 `scanSources:false` 生成 `context.css`，将 probes/CSS 纳入 fixtureHash；根 runner 与 CI 由统一 suite 接入。fixture-defined 覆盖包括七个显式 `variant/static/*` feature，实际通过需要消费本轮报告。本目录不维护另一套基线命令。

pointer-none、any-pointer-none、contrast-less 和其它尚未实现的变体不在合同内，不伪造硬件或媒体能力。

定向协议验证：`pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-web-context.test.ts e2e/tailwind-web-context-runner.test.ts --update=none`。协议测试不启动浏览器；实际运行由统一 suite 在当前预检通过后执行。
