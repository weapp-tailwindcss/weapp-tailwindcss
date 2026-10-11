---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 4fdab21fa51bb4c658a0d2755c914650254307fc
regressions:
  - e2e/hbuilderx-alias-consumers.test.ts
  - e2e/app-visual-lifecycle.test.ts
  - e2e/issue-1144-runner.test.ts
---

# HBuilderX 调用者的项目与资源收尾

## 症状

全面测试中观察到的关闭超时暴露了多个相同调用模式：项目关闭使用 `allowFailure: true` 或吞掉异常，随后删除 alias。除 static 构建外，Web 服务、小程序编译、App HMR、视觉报告和独立开发脚本均存在这一模式。视觉报告还会在收尾前记录 passed；严格关闭开始抛错后，旧的串行 finally 可能跳过源码恢复，或覆盖原始运行异常。

## 根因与纠正

所有 alias 调用者统一使用共享项目生命周期边界，关闭明确指定 `allowFailure: false`。只有关闭成功才删除 alias；关闭失败保留其路径和底层 cause。Issue 1164 原来会保留 alias，但关闭异常会覆盖主体异常，也迁移至共享聚合逻辑。新 alias 无需预先关闭，移除冗余步骤。CLI 与 Issue 1160 先连接 runner 再领取 alias，避免连接失败留下无主资源。

App 和 Web 的独立资源通过顺序收尾器处理：浏览器、进程、源码、项目与日志的一个步骤失败，不阻断其余步骤，最终聚合全部异常。Issue 1210 先恢复本轮拥有的源码，再关闭项目。视觉报告延迟记录结果，关闭失败会将已完成验证的用例记为 failed，同时保留截图和运行诊断。

独立开发脚本的非零 launch 退出在项目收尾前转换为主体异常。信号处理显式接收 `stop()` 的失败并解绑监听器；即使根进程先触发 close，也等待已经发起的停止任务，避免后代进程清理失败被提前完成的 Promise.race 吞掉。

## 验证

- 将小程序与 Web 两个受测模块临时替换为基线版本，其余测试和 mock 不变，执行 `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hbuilderx-alias-consumers.test.ts --update=none -t '小程序|Web'`：3 项失败、1 项通过、5 项因名称过滤未运行。失败证实两条主异常丢失和一条关闭错误被当作成功；随后按原字节恢复本轮修改。日志为 `.tmp/hbuilderx-alias-consumers-before.log`。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hbuilderx-alias-consumers.test.ts e2e/app-visual-lifecycle.test.ts e2e/issue-1144-runner.test.ts e2e/project-build-hbuilderx-cleanup.test.ts e2e/hbuilderx-project-alias.test.ts --update=none`：5 文件、51 项通过，无跳过。日志为 `.tmp/hbuilderx-alias-consumers-after.log`。
- 新增消费者用例使用真实临时目录和符号链接，CLI/设备边界全部模拟。覆盖小程序、Web、App 打开失败后的源码恢复、严格关闭、独立脚本非零退出、信号失败、根进程先 close 而停止任务后失败。
- 视觉报告的 Android/iOS 模拟组合覆盖主体失败、项目关闭失败、日志关闭与项目关闭同时失败；检查源码原始字节恢复、alias 删除未执行、结果状态为 failed 且保留全部错误。
- 修改的 TypeScript 文件通过 ESLint；独立开发脚本与资源收尾器通过 `pnpm exec tsc --ignoreConfig --noEmit --target ESNext --module ESNext --moduleResolution Bundler --strict --skipLibCheck --allowJs --allowImportingTsExtensions scripts/hbuilderx-launch-mp-weixin-dev.ts scripts/hbuilderx-project-resources.ts`。

## 适用边界

本次修复资源所有权与失败传播，不证明 HBuilderX 的真实编译挂起已解决。验证未操作 IDE、模拟器、设备或浏览器；真实全端验收仍由全面测试流程在环境恢复后完成。没有修改 demo、样式转换或产物预期，无需重新生成 static 基线，也不新增公开包 change intent。

## 规则评估

不新增 AGENTS。既有资源归属和失败报告规则足够，本次通过共享生命周期入口及持久行为回归落实。
