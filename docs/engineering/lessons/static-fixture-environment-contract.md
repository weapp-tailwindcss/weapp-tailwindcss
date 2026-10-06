---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 87e1628127ab27eda402213768d70b1c2988166f
regressions:
  - e2e/app-visual-lifecycle.test.ts
  - e2e/framework-ide-watch-lifecycle.test.ts
  - e2e/app-target.test.ts
---

# 静态回归夹具的设备环境与项目路径契约

## 症状

完整扩展轮次 `521b648e-7f3d-4dd1-aa3a-d7ff5d0b46f9` 在 static 阶段发现两类夹具失败。`workflow.log:5137` 的 Harmony 视觉生命周期用例在启动前报“设备配置存在歧义”，目标同时为 `test-harmony` 和预检绑定设备；`:5196` 起的三个 IDE watch 生命周期用例在 `entry.project.name` 读取处失败，没有进入各自期望的 watcher 启停与原始错误断言。

同一提交在带有完整运行设备绑定变量的定向验证中复现 4 项失败、32 项通过。此处是两个测试文件的四项失败，不代表完整 static 的其他失败也已修复。

## 根因与纠正

Harmony 夹具只通过 `vi.stubEnv` 替换 `E2E_HBUILDERX_HARMONY_DEVICE_ID`，完整预检还会传入 `DEMO_VISUAL_HARMONY_DEVICE_ID` 和 `DEMO_VISUAL_HARMONY_SCREENSHOT_DEVICE_ID`。真实入口正确拒绝了执行与截图身份不一致。修复在夹具内同时覆盖三个别名，并由既有 `vi.unstubAllEnvs()` 恢复外部环境，不修改生产设备选择逻辑。

该消费者回归分别模拟未预选和完整预选环境，在进入实际 `runAppCase` 前建立夹具身份。仍验证 Alpha 真实项目根、launch 参数、启动失败原错、源码恢复，以及不打开、关闭或释放用户项目；预选环境构造与夹具覆盖分开，遗漏截图别名时该用例会再次失败。

IDE 夹具把只有 `name` 的对象强制断言成完整 `FrameworkSupportCase`，掩盖了缺少 `fixturesDir` 和 `project` 的事实。生产消费者开始沿真实项目关系解析 `miniprogramRoot` 后，这个不完整夹具在 watcher 启动前失败。改为从未过滤的 `FRAMEWORK_SUPPORT_CASES` 读取真实记录，并断言模板、脚本两次增量操作收到真实的 `dist` 小程序根。测试通过 Node 路径 API 规范化比较，兼容 Windows 与 POSIX 分隔符。

## 验证

在原实现上注入与完整运行相同的 Android、iOS、Harmony 设备及截图别名，执行两个生命周期文件：4 项失败、32 项通过，复现相同首次偏离。修复后保持该设备环境，加入既有设备冲突回归：

```bash
CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/app-visual-lifecycle.test.ts e2e/framework-ide-watch-lifecycle.test.ts e2e/app-target.test.ts --update=none
pnpm agents:check
```

修复后的三个文件共 59 项通过，无失败或跳过。Harmony 的两个参数化场景也使普通无设备配置的测试环境持续覆盖预检变量污染；设备回归继续拒绝多目标、目标缺失、重复参数和执行/截图冲突。ESLint（禁用 Prettier 规则）、规则和差异检查通过。

所有设备枚举、子进程、截图、IDE 与 watcher 操作都由原测试 mock 处理，只使用临时目录保存夹具；没有操作设备、浏览器或微信登录态，没有重新构建或执行全面流程。

## 适用边界

本次只纠正测试隔离和夹具数据，不代表 Alpha 5.31 的实际设备 HMR 已通过，也不处理同轮快照或 issue #1241 的失败。未修改生产模块、demo、static 基线或发布行为，因此没有新增 change intent。

## 规则评估

不新增或放宽 AGENTS 规则。复用真实矩阵契约与完整设备身份夹具，保留既有多设备歧义门禁；测试边界问题在测试层修复。
