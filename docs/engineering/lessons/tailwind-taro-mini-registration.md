---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 4ea2684361a8080362eb796c7eae5c8a117fa804
regressions:
  - e2e/tailwind-taro-mini-registration.test.ts
  - e2e/tailwind-taro-mini-artifacts.test.ts
verification:
  - claim: 原矩阵缺少十九个已维护 Taro 小程序的真实构建入口
    kind: unit
    status: failed
    sha: 8a2f5551a6669c3dd3cefbb12b483f95e00a55ef
    environment: macOS arm64，包含新增未提交回归，Vitest 5.0.4，快照更新 none
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-taro-mini-registration.test.ts --update=none
  - claim: 四项目六平台逐项绑定真实脚本、样式及模板后缀，并保留支付宝专项合同
    kind: unit
    status: passed
    sha: 8a2f5551a6669c3dd3cefbb12b483f95e00a55ef
    environment: macOS arm64，Node 24.18.0、pnpm 12.14.0，包含本记录对应未提交修复，CI=1，Vitest 5.0.4，快照更新 none
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-taro-mini-registration.test.ts e2e/tailwind-taro-mini-artifacts.test.ts e2e/tailwind-build-matrix.test.ts e2e/e2e-matrix.test.ts e2e/taro-ci-coverage-matrix.test.ts --update=none
  - claim: 新登记的十九个入口仍须消费新鲜预检后实际构建及归档
    kind: integration
    status: pending
    sha: 8a2f5551a6669c3dd3cefbb12b483f95e00a55ef
    environment: 本机 Taro Vite/Webpack React/Vue3 六平台
    reason: 本片仅补入口和可执行产物合同，不能以登记、纯单测或其他平台成功代证
---

# Taro 小程序矩阵入口缺口

## 症状

固定于 4ea 的全面运行中，mini-builds 实际构建四十项，二十项保留 not-run；严格报告门禁正确失败。其中十九项属于仓库已维护的 Taro Vite/Webpack、React/Vue3 六平台组合，另一个是 uni-app x 的 HBuilderX 入口。不能缩小矩阵或只选 CI 条目消除失败。

## 根因与纠正

复用现有 Taro 工厂，增加 swan、qq、jd 的真实样式和模板后缀，登记四项目六平台命令及转义类断言。原有专项优先，新入口按项目和平台补缺，保留支付宝 issue998 的逐文件断言及原 CI 状态。新增入口全部仍为 local，不扩默认 hosted CI。现有统一 runner 负责逐例构建、立即归档和 hash 验真。

审查又确认三个产物合同缺口：空模板仅凭文件存在可通过；正确标记落在错误平台后缀里可代证空的目标样式；六种非空 Tailwind 指令残留未被拒绝。先用临时伪产物固化八项真实失败，再补模板结构断言、按声明后缀读取样式和完整指令拒绝合同。正向完整产物仍须通过；不以同目录其它平台文件补足当前平台证据。

## 验证

新增二十五项登记回归在修复前为十九失败、六通过；九项伪产物回归在修复前为八失败、一通过。最终连同矩阵合同五文件八十八项通过；另以测试名过滤验证静态矩阵一致性，一项通过、五十四个真实构建明确未执行。日志保存在任务忽略目录 `.tmp/taro-mini-registration-*` 和 `.tmp/taro-mini-artifacts-*`。

一次定向验证误选包含真实构建的 `multiplatform-build-output.test.ts`，中断外层后又检查并确认自有 worker 全部退出。这批额外构建不计验收成功；后续纯合同运行显式限定文件，静态矩阵断言使用测试名过滤。

## 适用边界

本片没有改 demo 源码或样式输出，不更新 static 基线。新增入口仍待新的 prepare、真实 computer use、verify 和实际矩阵执行；不得提前写成五十九项构建通过，也不代替微信或设备渲染。uni-app x 入口和整体四端验收仍为 partial。

## 规则评估

不新增 AGENTS；现有占位保持未执行、构建证据不能替代运行时、逐例归档和新鲜预检规则已覆盖该边界。
