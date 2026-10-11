---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: c04ca6a73389412e1d5fa5a9318d57602dc46ba1
regressions:
  - e2e/hbuilderx-ios-hmr-completion.test.ts
  - e2e/hbuilderx-ios-runtime.test.ts
  - e2e/app-visual-lifecycle.test.ts
  - e2e/hbuilderx-app-process-cleanup.test.ts
---

# iOS HMR 必须等到设备上的本轮样式证据

## 症状

Alpha `5.31.2026093020-alpha`、uni-app x VDOM、样式隔离 2.0 的定向诊断曾显示 `state: pending` 和“产物与传输检查通过”。原始日志在首次 `App Launch` 后开始差量编译，尚未出现本轮编译成功或同步成功就收到停止命令。这次通过记录只能证明中间转换产物更新，不能证明同步或设备 HMR。

独立视觉诊断记录了完整顺序：`20:43:53.682` 编译成功、`53.695` 同步成功、`55.181` 再次 `App Launch`。因此仅补同步等待仍会漏掉晚到的重启。原始记录分别在当轮 `e2e/.artifacts/uni-app-x-alpha/ios-diagnostic-8e097fef4/` 和 `visual-diagnostic-1791031410811/`，这些失败不作为新实现的设备通过证据。

## 根因与纠正

生命周期观察器原先对 Android 和 iOS 都立即返回，假定调用者提供运行时证据；App runner 实际只有 Android 和 Harmony 分支。修复让 iOS 完成契约显式要求设备取证回调，并先等当轮编译开始、编译成功和其后的同步成功。当前真实日志包含开始事件，缺证时保守失败。分别到达 stdout、stderr 的事件保留到达顺序；回调前后绑定相同编译与同步代次，取证期间新编译开始会使旧证据失效，必须重新同步并重新取证。取证完成后又开始编译也不能继续报告通过。运行时回调继承剩余等待预算。

runner 与 visual 共用绑定设备的异步 iOS 截图和样式标记探针。初始截图必须包含唯一目标色块；每一步按目标色、相对宽高比例及目标区域像素变化验收。只改变时钟或滚动条、旧帧、新图缺失、重复独立色块都不能通过。异步截图避免阻塞主事件循环而延迟接收 HBuilderX 生命周期日志。现有截图路径先清理本任务的旧文件，命令失败不能复用旧图。

回调前后、截图前后和进程停止后仍检查重启、重装和热更新失败。只有取证完成后，iOS 快照才记录 `runtimeVerified: true` 并将尚未收到显式热更新完成日志的 `pending` 转为 `updated`。visual 的观察器也保留到停止后，防止收尾期间到达的重启被遗漏。

## 验证

- 修复前先运行 6 项完成契约回归，全部失败，复现立即返回造成的错误通过。
- 定向命令：`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hbuilderx-ios-runtime.test.ts e2e/hbuilderx-ios-hmr-completion.test.ts e2e/hbuilderx-hmr-lifecycle.test.ts e2e/hbuilderx-app-process-cleanup.test.ts e2e/app-marker-visual.test.ts e2e/app-visual-lifecycle.test.ts --update=none`。
- 上述 6 文件、71 项通过，无跳过，包含取证期间和完成后再次编译的证据失效回归；ESLint、`git diff --check` 和 `pnpm agents:check` 通过。
- 回归模拟 CLI 和截图进程，使用真实 PNG 编解码与临时文件，覆盖未同步、错误日志顺序、旧帧、目标区域变化、截图失败、取证期间重启与停止期间重启，不启动真实 IDE 或设备。
- 类型检查未通过：按 E2E 编译选项对受改入口及依赖做基线比较，现有依赖已有诊断；新增探针及像素测试也触发仓库缺少 `pngjs` 类型声明的 `TS7016`，未新增其他诊断类别。不通过宽泛声明、忽略注释或改变全仓依赖来掩盖这一限制。
- 未调整 demo、样式预期或 static 基线；未修改公开包行为，不新增 change intent。

## 适用边界

新证据种类为 `visual-style-marker`：它验证可见样式标记，不提供 iOS 节点文字的结构证据。存在明确十六进制背景色时才允许这条视觉验收；没有可辨识标记直接失败。截图比例验证不等于设备逻辑像素的绝对尺寸测量。

严格 HMR 策略没有改变。当前工具链的真实重启仍应使验收失败；只有原本显式声明 `native-reload` 的用例保留其语义。定向回归通过不代表 uni-app x iOS 或全面测试已经通过；真实重跑仍由主任务完成当轮环境门禁后执行。

## 规则评估

不新增 AGENTS。既有“本轮保存标识、运行时证据和生命周期一致”的要求足够；通过明确完成契约和持久回归落实。
