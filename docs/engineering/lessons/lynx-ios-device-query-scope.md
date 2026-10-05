---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: ce65d062656a8a116d0891f76b46ef5d2d4f512a
regressions:
  - e2e/lynx-native-device.test.ts
---

# 显式 iOS 目标不应触发全设备发现

## 症状

4bef01ed7 与 ce65d0626 两轮 Lynx iOS CI 在成功 create、boot、bootstatus 后，首条 `simctl list devices available --json` 均于 30 秒超时。命令已 spawn，退出前没有输出；诊断 sample 也超时。历史成功查询返回 72,498 字节，包含 xrOS 和大量未启动设备。

## 根因与纠正

设备发现存在一个可确认的边界问题：已有明确的 `LYNX_IOS_DEVICE_ID` 或 destination ID，仍然枚举全部可用设备，且冲突配置直到查询完成才检查。

现在先解析和校验请求身份，显式目标通过 `simctl list devices <ID> --json` 查询自身；未指定时保留全量发现及多设备歧义拒绝。simctl 的过滤为不区分大小写的 contains，返回后仍执行精确 ID、Booted、available、runtime 与 destination 校验；失败、超时、未启动或缺失均不回退其他目标。30 秒预算保持不变。

## 验证

- 3 项查询边界断言先在旧实现失败，修复后定向设备回归通过。
- 覆盖指定第二台模拟器、destination-only、冲突配置零子进程、未指定多设备、查询失败不回退、缺失/Shutdown/unavailable 和绑定的诊断文件。
- 本机以 `xcrun simctl help list` 核对真实 CLI 的过滤参数语义，并以所选模拟器 ID 做只读定向查询；没有启动、停止或安装应用。
- 定向类型、ESLint、agents 和差异检查随提交执行。

## 适用边界

本次修正查询范围，不宣称已证明远端超时根因。两轮 boot 后普通 shell、pnpm 和 sample 也迟滞；94fa019d6 的 RN iOS 甚至在测试脚本启动前触发 pnpm updateConfig worker 的 30 秒超时。仓库 pnpmfile 仅同步 readPackage，没有 updateConfig 或 I/O。需要新 CI 的实际结果及有界主机诊断，不能靠提高超时、反复重启或扩大重试消除失败。

## 规则评估

不新增 AGENTS，不改变公开包或固定设备矩阵。继续保留真实失败与所有权边界。
