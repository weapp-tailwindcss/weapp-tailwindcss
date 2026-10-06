---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: b5b52baff54ec28c0b2dfd67ba8b24a1fad9c8df
regressions:
  - packages/weapp-tailwindcss/test/watch-hmr-web-iconify.unit.test.ts
---

# Web Iconify 热更必须证明本轮源码已到达样式表

## 症状

Web Iconify 回归向源码写入图标和内容类，再检查活页面的样式标签是否包含对应选择器。原来的 before、after 内容类是固定字符串，与 demo 的 `@source inline` 重叠；页面初始样式就可能同时包含两个阶段的结果。编译完成信号也不能证明此次源码修改产生了检查到的选择器。

两个最小反例分别保留全部旧样式、只更新注入阶段却保留旧 after 样式。修复前两个反例均错误返回成功，记录的内容热更耗时为 0ms。

## 根因与纠正

抽出私有 `web/iconify.ts` 模块，每轮创建 UUID，分别加入注入和更新阶段的内容字面量。保留原内容文本、图标集合和报告中的项目标识。自定义内容类必须使用带引号的 `content-[...]` 字面量，不能把不可携带本轮内容的配置静默当成有效证据。

写入前确认活页面没有本轮两个选择器，注入源码不能提前包含更新阶段的类；第二次保存前再次确认更新阶段选择器尚不存在。每个阶段既检查对应新选择器，也保留图标 CSS 断言。编译稳定后重复检查，最终验收完成才计算有效耗时，避免临时产物短暂命中后又消失。

TS、TSX、JS、JSX 的默认注释载体继续承担源码候选扫描回归。该流程证明本轮源码候选到达活页面样式表，不将它描述为 DOM 消费或视觉验收。浏览器与源码恢复仍由外层 `finally` 负责。

## 验证

- 旧实现的两个假阳性反例均为红；修复后均正确拒绝旧 CSS。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-web-iconify.unit.test.ts test/watch-hmr-regression.unit.test.ts --update=none`：2 个文件、127 项通过，其中 11 项覆盖本问题。
- 新回归覆盖静态预生成样式、注入后停滞、正常两次源码保存、初始样式污染、提前生成下一阶段、编译稳定后样式消失、有效耗时包含编译稳定、自定义内容保留、跨轮隔离和默认 TSX 注释载体。
- 对修改的 TypeScript 文件执行 `pnpm exec eslint --no-ignore`，通过。
- `pnpm exec tsc --project tools/weapp-tailwindcss-scripts/tsconfig.json --noEmit` 未全绿；该配置连同传递源码报告 217 项诊断。通过 TypeScript compiler host 将 `web.ts` 替换为基线源码并排除新增模块进行对照，基线同为 217 项；按文件、错误码与消息逐项比较，新增和移除均为 0。未为本修复更改无关类型定义。

### 整合后的真实浏览器复验

代码 `886a43d98`、轮次 `5e2a3e08-c1ad-44f6-8e28-30720ba00b85` 完成新预检、当前会话真实输入/点击/截图、verify 与门禁后，运行 `e2e/watch/hot-update/demo/uni-app-vite-tailwindcss-v4.test.ts` 的 Web-only 链路。`CI=1`、`--update=none`、重新构建、仅一次尝试，1 项测试在 30.33 秒内通过。

活页面样式表包含本轮 UUID 的 inject/content 两种选择器，保留三个图标选择器，内容更新有效耗时 987ms。该用例的普通模板更新与回滚、标题颜色以及脚本绑定背景色也完成实际 DOM / 计算样式验证；Iconify 本身仍是样式表证据，不额外声称图标节点视觉验收。

证据为 `e2e/.artifacts/uni-app-x-alpha/5e2a3e08-c1ad-44f6-8e28-30720ba00b85/iconify-verified-fixes/web-report.json` 及同目录 `run.log`、`cleanup.json`。这是普通 uni-app Vite H5，不能计作 HBuilderX Alpha 原生 Web 验收。后续微信 watch 的性能失败不改变该独立阶段的通过事实，也不能合并称作全流程通过。

## 适用边界

工具契约已有单测及上述真实 Web 复验，其他框架的实际运行不由这一用例替代。未修改 demo、持久样式输出或 static 基线；未调整性能阈值、超时和默认覆盖。

## 规则评估

沿用现有“本轮保存标识必须可验证”的规则，不新增规则。热更验收需要排除基线已存在的结果，并在编译完成后确认结果仍成立。
