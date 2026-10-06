---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: c53b5029a729efe881e8763d6a6e1505dd3d7998
regressions:
  - e2e/react-native-ios-launch.test.ts
  - e2e/react-native-native-wait.test.ts
---

# iOS 深链超时与应用实际启动状态必须分别核对

## 症状

[RN iOS 运行 37356795778](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37356795778/job/111921134568) 构建和安装成功，随后 Expo 的 `simctl openurl` 返回 `NSPOSIXErrorDomain code=60`。60 是 errno，不是 60 秒预算。

模拟器日志显示 18:50:57.267 收到深链请求，SplashBoard 随后出现快照超时；18:51:07.340 LaunchServices 返回 ETIMEDOUT。应用却在 18:51:13.028 完成 bootstrap，18:51:14.838 接收 URL，18:51:15.022 才开始请求 Metro。因此不能归因于 Metro 冷编译，更不能以预热打包掩盖原生启动问题。

## 根因与纠正

原编排把 Expo 的非零退出直接当成应用未运行。LaunchServices 超时只表明调用未及时完成，服务端原请求仍可能继续。重新运行 Expo 或终止应用再启动会重复冷启动过程。

现在仅对同一 UDID、同一完整深链、成功构建且唯一产物完成安装后的精确错误进入核对。读取已安装容器，比较本轮主程序、Info.plist 和根目录 dylib 的文件集合与哈希，再在既有启动预算内最多等待 15 秒确认唯一运行 PID，并以进程实际 executable 路径绑定该容器。全部满足后只补发一次相同深链，不终止、重装或重新构建应用。

首屏和两轮 HMR 共用同一个记忆化核对结果。首屏报告不能绕过尚未完成或已失败的启动命令，子进程的输出关闭等待也受原有预算限制。首次日志与退出码保持原样，核对结果另存 `ios-launch-reconciliation.json`。失败、身份不一致、歧义 PID、预算耗尽或第二次深链失败继续阻断。

## 验证

- 使用真实首次失败的 expo-run.log 验证精确识别成功。
- 定向 Vitest 覆盖错误设备/URL/错误域/退出码前缀、阶段顺序、CRLF、晚到 PID、旧二进制与 Debug dylib、错误容器、单次补发及共享失败结果。
- 等待状态回归覆盖首屏报告门禁、管道未关闭的截止时间和计时器释放。
- 新回归接入 RN 兼容入口及 iOS CI 原生构建前步骤。

## 适用边界

这些回归只证明编排边界，尚不能证明模拟器已恢复。实际首屏、像素截图、TSX HMR 和 CSS HMR 仍须在新提交的原生 CI 中通过；不刷新支持基线或放宽验收条件。

## 规则评估

不涉及公开包行为，不新增 AGENTS。原生启动状态归编排层核对，报告与截图验收继续独立执行。
