---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 1d5668fcfc29b660794cb695463b5df7adddfb2b
regressions:
  - e2e/tailwind-web-autofill.test.ts
  - e2e/tailwind-web-autofill-protocol.test.ts
  - e2e/tailwind-web-autofill-replay.test.ts
  - e2e/tailwind-web-autofill-runner.test.ts
verification:
  - claim: 首轮正式运行取得原生 Autofill 三阶段证据，但固定零宽基线断言失败
    kind: integration
    status: failed
    sha: 1d5668fcfc29b660794cb695463b5df7adddfb2b
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0、Tailwind CSS 4.3.3、完整 Chromium 156.0.8078.4，headless；fresh extended 预检、当前会话原生 Chrome computer use 和 verify 通过
    command: pnpm e2e:tailwind --preflight-report e2e/.artifacts/preflight/c62c86d6-8f93-4e72-835a-34e63596dad7/report.json --target web-chromium --case '^runtime/autofill-native-outline$'
  - claim: 固定宽度基线与证据拒绝回归七文件五十三项通过
    kind: unit
    status: passed
    sha: 1d5668fcfc29b660794cb695463b5df7adddfb2b
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0，包含本记录同批未提交的显式零宽夹具及负向回归；CI=1、--update=none
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-web-autofill-protocol.test.ts e2e/tailwind-web-autofill.test.ts e2e/tailwind-web-autofill-replay.test.ts e2e/tailwind-web-autofill-runner.test.ts e2e/tailwind-browser-lifecycle.test.ts e2e/tailwind-inventory-web.test.ts e2e/tailwind-fixtures.test.ts --update=none
---

# Chromium 原生 Autofill 三阶段验收

## 症状

默认 headless-shell 没有 Autofill 域。可行性诊断分别保留该失败与完整 Chromium 的成功；正式 suite 在选中本组时复用 extended 预检已检查的完整 Chromium，保持无头和临时隔离 context，不读取用户 profile 或保存虚构地址。

首轮正式 run `911021b2-dbad-40a1-845d-5f0a3cf9cd7d` 固定于上述完整源码 SHA。全部一百三十八条断言中十条失败，均为初始、无 class/未填充对照或恢复阶段的 outline width：实际 `3px`，预期 `0px`。原生事件、renderer 字段值、标准 `:autofill`、协议顺序、可信键盘恢复、几何及全部 PNG 断言通过，无 console warning。保留完整原始失败报告，不回写成功。

## 根因与纠正

夹具以 `outline:none` 表示固定零宽基线，但 shorthand 未声明宽度，保留 `medium`。Chromium 在 style 为 `none` 时仍返回该计算宽度；不绘制描边不意味着计算宽度必须为零。把真实返回值调整为预期或放弃对照检查都会掩盖夹具语义错误。

夹具改为显式 `outline:0 none`，保持原预声明的零宽、无样式和白底像素合同；候选和独立 reference 在标准伪类匹配时覆盖为三像素实线。新增反例证明，即使没有描边像素，初始宽度仍为 medium 也不能满足固定零宽合同。正式三阶段 runner 本身就是先失败的持久回归，不把合成证据当作修复后的实际运行。

## 验证

首轮原件在 `e2e/.artifacts/tailwind/911021b2-dbad-40a1-845d-5f0a3cf9cd7d/web-chromium/autofill/`，包括原始 CSS、三张 PNG、measurement、v2 report 与 coverage。extended 预检 `c62c86d6-8f93-4e72-835a-34e63596dad7` 只消费一次，结束后服务已退出；新建的 Chrome 探针标签已明确关闭并核对返回原页面，未操作用户业务内容。

定向七文件五十三项通过，日志 `.tmp/autofill-explicit-zero-checks.log`。通过 `CI=1 pnpm e2e:tailwind:static:update` 正式生成并逐项审查，仅 `autofill.css` 的一条基线声明、该文件摘要与 fixture hash 变化，其余四十八份样式字节不变；随后调用 `fixtureBaseline(process.cwd(), false)` 禁止更新比较。固定零宽版本须重新完成 fresh extended 预检、真实 computer use、verify 与正式运行，不能复用首轮报告。

## 适用边界

仅验证 Chromium 地址 Autofill 与一个 outline 候选。Firefox/WebKit、密码/支付卡和保存地址 profile 未验证；不能从该结果推广到所有 Autofill utility。Chromium 85/88、Firefox/WebKit 83/88 的登记数量是 fixture-defined，不能当实际成功数。WebKit visited 仍保留正向失败；RN served bundle/HMR 传输、Image/ScrollView、完整原生注册夹具与独立转换 oracle 等未完成，总体验收继续 partial。

## 规则评估

不新增 AGENTS。沿用固定预期、真实三阶段、原始证据重放、fresh 预检与浏览器资源归属规则，补可执行反例；不放宽任何支持预期、像素阈值或证据门禁。
