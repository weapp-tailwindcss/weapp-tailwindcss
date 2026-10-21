---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 4ea2684361a8080362eb796c7eae5c8a117fa804
regressions:
  - e2e/taro-vite-react-tailwindcss-v4.test.ts
  - e2e/taro-vite-vue3-tailwindcss-v4.test.ts
  - e2e/taro-webpack-react-tailwindcss-v4.test.ts
  - e2e/taro-webpack-vue3-tailwindcss-v4.test.ts
verification:
  - claim: 固定源码完成一次十五目标调度，存在失败、阻塞和未执行范围
    kind: integration
    status: failed
    sha: 4ea2684361a8080362eb796c7eae5c8a117fa804
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0、Tailwind CSS 4.3.3，CI=1，本轮 extended 预检、原生 Chrome computer use 和 verify 全部通过
    command: pnpm e2e:tailwind --preflight-report e2e/.artifacts/preflight/1b9d3cfc-b0ea-4a3a-8713-090df74430a1/report.json
  - claim: 四个 Taro demo 按真实输出定向更新并审查十五份 static 基线
    kind: integration
    status: passed
    sha: 085715cf953a85054350a7b177f98aa61f2a015c
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0，包含本记录对应未提交基线，CI=1、E2E_SKIP_OPEN_AUTOMATOR=1；只更新这四个项目
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/taro-vite-react-tailwindcss-v4.test.ts e2e/taro-vite-vue3-tailwindcss-v4.test.ts e2e/taro-webpack-react-tailwindcss-v4.test.ts e2e/taro-webpack-vue3-tailwindcss-v4.test.ts --update=all
  - claim: 审查后的四个 Taro static 回归以禁止更新模式全部通过
    kind: integration
    status: passed
    sha: 085715cf953a85054350a7b177f98aa61f2a015c
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0，包含本记录对应未提交基线，CI=1、E2E_SKIP_OPEN_AUTOMATOR=1
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/taro-vite-react-tailwindcss-v4.test.ts e2e/taro-vite-vue3-tailwindcss-v4.test.ts e2e/taro-webpack-react-tailwindcss-v4.test.ts e2e/taro-webpack-vue3-tailwindcss-v4.test.ts --update=none
---

# 2026-10-21 Tailwind 十五目标验收记录

## 症状

运行 `6d596b2e-fe30-4294-b14f-f1fabfdf5126` 固定于上述完整 SHA，十五个目标全部尝试。原始 v2 索引保留三 passed、一 failed、八 not-run、三 blocked，不能称为全面通过。报告根为 `e2e/.artifacts/tailwind/6d596b2e-fe30-4294-b14f-f1fabfdf5126/`，完整调度日志为 `.tmp/tailwind-full-4ea.log`。

本轮先完成 prepare `--extended`，真实原生 Chrome 交互时间为 `2026-10-21T11:38:46.660Z`，再完成 verify，预检报告只消费一次。微信登录态、HBuilderX 和模拟器未重置。结束后 prepare 服务退出；本任务创建的 Chrome 挑战标签已关闭，报告记载 `ownChallengeStillOpen: false`。

## 根因与纠正

WebKit 的真实 visited 点击、HTTP 200、导航返回、身份、几何和资源清理均通过，但 probe 与独立手写参考的四边仍为 RGB(1,2,3)，预期 RGB(18,52,86)，共二十四条颜色分量不符。不能只归因 Tailwind，也不能自动改判不支持。后续有界观察修复及原图重放见 [visited 复盘](tailwind-visited-observation-trace.md)，尚须新鲜端侧运行。

framework 的真实失败为四个 Taro demo 的 static 快照。`a7b1118` 的来源注释保护及根颜色保留已更新 generator 基线，遗漏旧 static 基线。按四项目真实重建，审查十五份 CSS 的全部 diff：只有 `/*! tokens: ... */` 来源注释，以及 Vite React/Vue 根中分别十/九条颜色声明；issue909 的转换基线新增七条保护来源注释，其它声明和选择器没有变化。不修改归一化器，不删除颜色掩盖差异。

framework 最终索引的 blocked 是另一个控制边界缺陷：已通过的 scheduler 负向测试打印模拟 Lynx/iOS 故障，父入口扫描整个聚合 stdout，把稍后的真实快照失败升级成环境阻断。保留原始索引，不回写历史为成功；后续修复必须按本次调用和生产者核验专属终态回执。

## 验证

表内数字来自本轮独立报告，P/F/B/N 分别表示通过、失败、阻塞和未执行；数量不能跨验证层级相加为平台支持数。

| 目标 | P | F | B | N | 证据范围 |
| --- | ---: | ---: | ---: | ---: | --- |
| static | 47,483 | 0 | 0 | 118,473 | 34,505 个样本实际生成/转换/编码；大量候选仍缺独立转换 oracle |
| authoring | 29 | 0 | 0 | 0 | 本轮作者指令与配置合同 |
| 普通 Web Chromium | 1,354 | 0 | 0 | 0 | 基础127、注册1205、history1、真实源码18、生命周期2、HMR1 |
| 普通 Web Firefox | 1,354 | 0 | 0 | 0 | 同上，独立引擎报告 |
| 普通 Web WebKit | 1,353 | 1 | 0 | 0 | 唯一失败为真实 visited 像素 |
| Expo 三浏览器，各自 | 118 | 0 | 0 | 1,260 | 各自26正向运行时、5编码、87负向；注册能力未执行 |
| 微信 | 18 | 0 | 0 | 1,282 | 已有夹具实际执行；未登记能力不以构建代证 |
| RN Android、iOS，各自 | 118 | 0 | 0 | 1,260 | 各自26正向运行时、5编码、87负向；servedBundle 仍未捕获 |
| Lynx Android、iOS，各自 | 17 | 0 | 101 | 1,496 | 10运行时、7像素；101缺独立判定器，205原子与1291注册夹具缺失 |
| mini-builds | 40 | 0 | 0 | 20 | 四十个真实构建及即时归档；十九Taro与一个uni-app x入口缺失 |
| framework-regressions | 3,662 | 4 | — | 49跳过 | 360文件：335通过、4失败、21跳过；21分48秒 |

Lynx 两端的原始宿主均输出 `completion: complete`、118案例、无 pending candidate；这只是宿主采集协议完成。Android 原始54支持/64拒绝、iOS 53支持/65拒绝，均不能替代适配报告的独立语义判定。最终101阻塞细分为55编码、18运行时、19像素、9生成层缺判定器；1496未执行仍保留。

RN/Expo 原始31支持、87预声明拒绝，不能写成118项正向运行时支持。mini-builds 的 Vitest 六十项测试体表面 passed，但 afterAll 正确拒绝二十项 not-run；不能用测试体通过数绕过总门禁。

四个 static 更新后，`CI=1`、`--update=none` 为四文件二十三项通过。更新日志 `.tmp/taro-static-085-update.log`，审查后复验 `.tmp/taro-static-085-verify.log`。这次定向成功不覆盖原十五目标或旧五十七阶段的失败。

## 适用边界

本轮验收仍为 partial。后续源码须重新 prepare `--extended`、当前会话真实 computer use 和 verify，再开始新的全面调度；不能复用旧预检 lease。新登记 Taro/HBuilderX 构建、RN 实际 HTTP/WS served bundle、设备安装/HMR回执、Image/ScrollView 语义、原生注册能力、独立转换 oracle、动态颜色限制的微信负向运行时及其余 Web 媒体场景仍须补齐。

此前五十七阶段流程与性能门禁的首次失败继续保留，不能以本轮部分运行或 CI 通过撤销。#1307/#1308/#1309 的根因修复仍在 PR，未合并到起始 main；详见 [根因复验](lynx-main-root-verification.md)，本记录不关闭 Issue。

## 规则评估

不新增 AGENTS。使用现有逐端证据、禁止旧报告放行、资源收尾及基线审查规则，新增回归约束报告归属，不降低阈值或支持预期。
