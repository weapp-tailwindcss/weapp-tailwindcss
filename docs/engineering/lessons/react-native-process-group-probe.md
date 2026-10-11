---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1218
baseline: 9fc9b4f21ecb36637b63bfba301dbd284e8d8832
regressions:
  - e2e/react-native-ci.test.ts
---

# 原生 E2E 进程组清理的权限边界

## 症状

PR #1218 的 Expo iOS 检查在功能验证后报 `kill EPERM`。失败 job 为 [106002918836](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/35482577436/job/106002918836)，调用栈位于 `stopOwnedProcess` 的进程组零信号探测。

产物包含初始报告、最终报告、三张截图及 `hmr.json`：TSX 标记从 `rn-hmr-baseline` 变为 `rn-hmr-updated`，CSS 颜色从 `#10b981` 变为 `#f59e0b`，三张截图哈希各不相同。代码仅在全部验证完成后写入这些报告，因此本次失败来自清理阶段。

## 根因与纠正

原实现只将 `ESRCH` 视为进程组探测结束，成功发送 `SIGTERM` 后遇到 `kill(-pgid, 0)` 的 `EPERM` 仍抛异常。对组发送信号时，只要存在有权限的目标就可成功；探测阶段的 `EPERM` 表示已无可发送信号的组成员，不应继续尝试终止不属于当前权限范围的进程。

只对零信号探测处理 `EPERM`。首次 `SIGTERM` 权限错误、未知探测错误继续传播；宽限期结束后仍可发送信号的组继续收到 `SIGKILL`。不扩大进程选择范围，不使用 sudo、名称匹配或全局进程清理。

## 验证

- 修复前，定向回归复现同一调用栈：1 项失败、8 项通过。
- 修复后，`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-ci.test.ts --update=none`：9 项通过。
- 新增 5 项覆盖终止后探测权限边界、首次终止拒绝、进程组消失、未知探测错误和超时强制清理。POSIX 进程组用例仅在 POSIX 平台执行，Windows 仍沿用原有 taskkill 分支。
- 未执行本地 IDE/设备验收；提交 `e11cd6a78eb5c89a3ea56ba3ac279a52489aa5ba` 的 [React Native CI](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/35484338754) 中 Expo iOS 18.5、Android 11 和 Web 全部通过。

## 适用边界

此修复只处理成功终止之后的进程组探测，不将权限拒绝概括为进程不存在，不掩盖应用验证失败。没有更改 demo、样式产物、static 基线或公开包行为。

同一 head 的 Taro Webpack 性能门禁另有构建峰值内存回归（1297.29 → 1469.60 MB，+13.28%），与本清理修复无关；原始样本保留在 CI artifact，须独立复测和处理，不因 iOS 修复宣称性能通过。

## 规则评估

沿用现有进程归属、定向回归及本地多端预检约束，不新增或放宽 AGENTS 规则。
