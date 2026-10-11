---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 6300019672793344d98c32b7b3c011c7207a0c12
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-local-css-replay-ownership.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-plugin.bundle.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-remembered-css-replay-root-shell.unit.test.ts
---

# 增量样式重放保留局部产物的导入归属

## 症状

uni-app x Alpha 的微信 IDE 热更新首次修改模板后，根 `main.wxss` 出现页面原有的 `@import "../../uvue.wxss"`，而 `uvue.wxss` 又导入 `./main.wxss`。组件的 `/app.wxss` 导入也被追加到根样式，形成越界路径和循环依赖。首次失败产物保存在本轮 `e2e/.artifacts/uni-app-x-alpha/742b8b31-d1d0-433e-93b9-1968abf8e335/wxss-first-failure/`；持久回归不依赖这些文件或特定框架文件名。

## 根因与纠正

`shouldInjectCssIntoMainFromOutput` 在增量模式下将全部主包来源判为可注入根样式，只排除了分包。页面、组件的完整编译产物因此被记录为 `injectIntoMain: true`，后续 processed CSS 收集与 finalizer 将局部规则及导入一起复制到根资产。相同 CSS 在初始构建时仍留在局部，导致第一次 HMR 才破坏导入图。根资产随后按导入覆盖清理时，还可能因自引用丢失原有规则。

自动根注入现在必须先满足实际 bundle 根样式输出身份，再判断主入口或增量主包资格。页面与组件仍通过原来的生成、缓存和 emit 链路写回自己的产物。显式框架根目标及 WebView 目标走已有独立关系，不依赖把所有主包局部 CSS 提升到全局。使用已有输出路径规范化与样式后缀判定，不按 `app`、`main`、`uvue` 或页面目录特判，也不删除、改写特定导入来掩盖错误。

原有 remembered replay 测试同时要求页面自身 emit 及复制到根样式；其中复制预期固化了错误行为。保留页面与分包的独立 emit 断言，改为验证两者均不泄漏到全局。

## 验证

- 新回归先在修复前失败，真实 `createGenerateBundleHook`、共享 processed registry 和 finalizer 注入链在第二轮复现根资产出现自身绝对导入、页面的两级相对导入及根规则丢失。
- 修复后，微信 `wxss` 与支付宝 `acss` 后缀均连续通过初始、替换、恢复三轮；局部导入关系、当前规则、框架导入壳及根规则保持正确。路径用例覆盖 POSIX、Windows 反斜杠、盘符、根路径、相对路径和查询参数。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-local-css-replay-ownership.test.ts test/bundlers/vite-processed-css-assets.unit.test.ts test/bundlers/vite-remembered-css-replay.unit.test.ts test/bundlers/vite-remembered-css-replay-root-shell.unit.test.ts test/bundlers/vite-processed-css-replay-order.test.ts test/bundlers/vite-plugin.bundle.unit.test.ts --update=none`：6 文件、279 项通过，包含显式框架根目标及缓存重放的正向保护。
- `pnpm --filter weapp-tailwindcss build`、`pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false` 及源码和新增测试的显式 ESLint 检查通过。构建保留既有 mixed exports 提示。
- 主任务整合后重新构建，限定 `uni-app-vite-vue3-hbuilderx-tailwindcss-v4`、`uni-app-x-vdom-tailwindcss-v4` 和 `issue-1144-static` 三个 static 入口执行 `--update=all`，审查确认基线内容无变化，再执行 `--update=none`：3 文件、4 项通过。命令保持 `CI=1 HBUILDERX_CHANNEL=alpha E2E_SKIP_OPEN_AUTOMATOR=1`，使用实际 Alpha CLI；编译验收不操作微信账号。实际 CLI/host 路径由本机环境传入。
- 在 `43d546478` 完成新一轮 prepare、真实后台 computer use 输入/点击/截图与 verify，轮次 `3f1640ae-5082-41ef-a990-cf22201b0f4c` 的微信 IDE 连接、模板类与脚本类更新共 3 项通过。实际 `main.wxss` 不再包含被搬入的 `../../uvue.wxss` 和 `/app.wxss`。该用例保留既有 `devtoolsVisible=artifact` 边界，不计为完整可视 HMR。
- 同轮 watch 在第一次 `space-y-2.5` 新增时失败并停止后续阶段，首次产物保存在 `watch-first-add/`。WXML 已消费 safe class，页面 CSS 也存在完整规则；其 `8rpx` 与全局参考规则的 `var(--spacing)` 被现有签名判为不同。根变量实际声明为 `--spacing:8rpx`，因此该失败与本节的局部导入归属缺陷分别处理，不通过修改生成产物或删除断言消除失败。完整 watch 及后续阶段仍待修复断言后重新预检验收。

提交 `fd81fee3c` 的新预检轮次 `edab1850-3352-4d60-8eb1-56ece3a3875a` 再次通过实际微信 IDE 的连接、模板类更新和脚本类更新 3 项（54.99 秒），WXSS 路径错误未复现。模板 watch 三轮新增/删除及 added-class 步骤随后完成；脚本动态类的证据校验失败另行修复，完整 watch 仍未通过。测试退出后源码恢复、所属 compiler/预检服务退出、临时浏览器标签关闭，现有微信 HTTP 服务只读检查仍为已登录。

- 代码 `d0f3d5b3b`、新预检 `004ca84c-cf6c-4c69-a312-decedb1f7e63` 再次通过 Alpha 5.31 的微信 IDE 连接、模板及脚本更新共 3 项，WXSS 相对导入错误未复现。该轮 IDE 阶段耗时约 231 秒，仍保留 `devtoolsVisible=artifact` 限制；随后的完整 watch 在 420 秒总时限退出，不能据此宣称整个 watch 或多端流程已通过。退出后源码干净、测试服务及临时标签页已回收，已有微信服务只读登录检查仍为 true。

## 适用边界

修复限于自动注入资格，不改变公开 matcher、导入文本或显式根目标语义。调用方显式登记跨产物注入时，仍需拥有正确的目标与导入关系。测试中的 Windows 路径覆盖不代表 Windows 实机编译验收。

## 规则评估

不新增 AGENTS。既有构建图归属、根因回归和禁止硬编码输出文件名的要求足够，本次通过输出所有权条件及连续增量回归落实。
