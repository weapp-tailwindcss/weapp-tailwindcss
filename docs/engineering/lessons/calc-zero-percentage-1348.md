---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1348
baseline: 64a777413fcf3790b9b90f6c5fa2d352b7f87f35
regressions:
  - packages/postcss-calc/test/index.test.ts
  - packages/postcss/test/calc-auto.test.ts
  - packages/weapp-tailwindcss/test/core.test.ts
---

# calc 零百分比归约语义

## 症状

`@weapp-tailwindcss/postcss-calc` 会把 `calc(1px + 0%)` 化简为 `1px`，也会把 `calc(10px + 50% - 50%)` 化简为 `10px`。在微信小程序 Tailwind CSS v4 的 `cssCalc: auto` 路径中，`calc(10rpx + 0%)` 随后会被识别为纯 rpx 长度并改写为 `10rpx`。这会丢失 `<length-percentage>` 的百分比参与语义。

## 根因与纠正

加减归约原来按数值是否为零过滤所有值，因而同时删除了 `NumberValue`、长度值和 `PercentageValue`。`0%` 虽然数值为零，仍携带百分比类型；在父尺寸不确定的属性中，保留它与直接输出纯长度并不等价。

归约器现在只删除可安全移除的零值，保留 `PercentageValue(0%)`，并继续删除 `0px` 等同长度类型的零值。这个边界让相同单位的普通零值仍可归约，同时阻止自动 rpx 适配器把混合长度百分比表达式误判成纯 rpx。

## 验证

- 基线 `64a777413fcf3790b9b90f6c5fa2d352b7f87f35` 上稳定复现四个 issue 输入：`calc(1px + 0%)`、`calc(10px - 0%)`、`calc(10px + 50% - 50%)` 和 `calc(var(--a) + 0%)` 均丢失 `0%`。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss-calc exec vitest run test/index.test.ts --update=none --coverage.enabled=false`：190 项通过，3 项既有跳过，验证提交为 `0612d88330ae9356e60a6cf4194a7cb3b3b23ce1`。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/calc-auto.test.ts --update=none --coverage.enabled=false`：27 项通过，验证提交为 `0612d88330ae9356e60a6cf4194a7cb3b3b23ce1`。
- `CI=1 pnpm exec vitest run --project=weapp-tailwindcss test/core.test.ts --update=none --coverage.enabled=false`：14 项通过，验证提交为 `0612d88330ae9356e60a6cf4194a7cb3b3b23ce1`。
- `pnpm agents:check` 与 `git diff --check` 在验证提交 `0612d88330ae9356e60a6cf4194a7cb3b3b23ce1` 上通过；PR #1350 旧 head 的 CSS compatibility、架构、Release Gate 和核心单测门禁已通过，更新 head 后需重新核对全部检查。

## 适用边界

本修复只调整 `postcss-calc` 的加减归约，不改变乘除、未知变量或非零混合单位的既有处理。当前记录的远端 CI 证据属于 PR #1350 的旧 head；合并前以最新 head 的检查结果为准。本次没有修改 demo 或 static 产物，因此无需重建 static 基线。

## 规则评估

不新增 AGENTS。现有 CSS AST 所有权、先固化回归再修根因、中文 change intent 和远端当前 head 复核规则已覆盖本次问题。
