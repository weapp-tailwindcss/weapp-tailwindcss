---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 1434e96979532f40d690d1fac3b09e438f46033b
regressions:
  - e2e/react-native-ios-build.test.ts
  - e2e/tailwind-scheduler.test.ts
---

# React Native iOS 命令与启动身份边界

## 症状

新 iOS 链路绕过 Expo 的 Simulator GUI 发现后，CocoaPods 参数解析、已有应用进程以及设备故障传播仍需独立验证。仅核对已安装文件不能证明运行中的进程已加载本轮二进制。

## 根因与纠正

CLAide 将 `--project-directory` 与后续路径当作不同参数，必须使用 `--project-directory=<路径>`。通过真实 Ruby CLAide 解析器确认这一合同，再固定命令回归。

安装并核对本轮二进制后，向预检设备的测试 bundle 执行 `simctl terminate`，成功后才打开深链。命令边界保留退出码和原始 stdout/stderr；只有明确的 NSPOSIXErrorDomain code=3、Application termination failed 和独立 No such process 行组合可作为应用未运行继续。其它终止失败结构化阻断，不吞掉工具、设备或服务错误。

CoreSimulator 的 Shutdown 与服务连接失效消息原先未被调度器识别，导致后续目标继续执行。增加精确错误模式和跨真实普通 Node 子进程的调度回归，保留产品样式与几何断言的失败类别。

## 验证

使用 `CI=1`、禁用本工作树依赖自动修复的 `--config.verifyDepsBeforeRun=false` 设置，执行 `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-scheduler.test.ts e2e/react-native-ios-build.test.ts --update=none`。CocoaPods 命令合同先失败 1 项，CoreSimulator 调度合同先失败 2 项；修复后包含终止身份和子进程日志合同的 20 项定向回归通过。ESLint、定向严格 TypeScript 检查与 diff 检查通过。测试使用临时目录和普通 Node 子进程，没有操作设备或安装应用。

## 适用边界

当前结论覆盖 CocoaPods CLI 参数、iOS 构建命令合同、进程终止错误分类与调度阻断。尚未执行真实 Xcode 构建和模拟器启动，原生验收由统一预检后的主任务执行；不据此声明 React Native iOS 渲染通过。未修改 demo 或样式输出，无需更新 static 基线。

## 规则评估

不新增 AGENTS 规则。命令语义和错误分类以持久回归维护，继续遵循本轮预检和设备归属边界。
