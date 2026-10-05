---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 3707ae0e897c1afed4898a80504d5800995a3565
regressions:
  - e2e/lynx-ci.test.ts
  - e2e/react-native-ci.test.ts
---

# Lynx Android hosted runner 的加速与失败传播

## 症状

794fc35c4 的 [Android job 111899508078](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37350396917/job/111899508078) 显示成功，但实际 adb 安装返回 `Can't find service: package`，没有原生验收报告。

## 根因与纠正

完整 job 日志显示 `/dev/kvm` 存在，但 `This user doesn't have permissions to use KVM`。action 的 auto 探测因此添加 `-accel off`，模拟器软件启动用了 340985ms。原工作流把这种情况描述为 hosted runner 没有硬件加速，并以 continue-on-error 隐藏原生失败；这些判断不足以支持成功结论。

复用仓库 React Native 工作流已经采用的权限边界：只在临时 Ubuntu runner 为当前用户授予 KVM 读写 ACL，先验证访问权限，再由 action 安装 emulator 后执行 `-accel-check`。显式启用加速；使用 2 核、4096M 内存和 512M heap，与已有 RN 流程保持一致。设备固定为 action 创建的 emulator-5554。

移除 continue-on-error 与误导性诊断说明，安装、运行或验收失败必须让 job 失败；artifact 上传继续 always() 执行。权限或加速不可用时直接失败，不自动退回软件模拟。本地用户设备不执行该 ACL 命令。

## 验证

3 项新增测试在原工作流均失败；修复后连同 RN 的 9 项已有回归共 12 项通过。执行型回归在中文、空格和特殊字符 SDK 路径下运行实际启动钩子，分别验证 0/7 退出码，且无真实模拟器或 sudo 调用。

- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-ci.test.ts e2e/react-native-ci.test.ts --update=none`
- `CI=1 pnpm exec eslint e2e/lynx-ci.test.ts .github/workflows/lynx-native.yml`

## 适用边界

日志明确证明 KVM 权限和失败隐藏问题；它没有证明 package service 消失的全部因果链。提交后的真实 hosted 模拟器仍需完成安装、运行、截图和几何证据验收。如 package service 故障持续，需要继续追查 emulator/system_server 日志，不能改成允许失败。

## 规则评估

不新增 AGENTS，不修改性能或原生支持基线。通过工作流与持久回归使 CI 状态如实反映执行结果。
