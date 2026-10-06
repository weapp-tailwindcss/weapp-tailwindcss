---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: cba75945b457e02f078d8d74daa495192dc20a30
regressions:
  - e2e/android-ui-hierarchy.test.ts
  - e2e/hbuilderx-local-helpers.test.ts
  - e2e/app-visual-lifecycle.test.ts
---

# Android UI 采集独占本轮设备文件

## 症状

`readAndroidUiHierarchy` 固定读取设备上的 `/sdcard/window.xml`，未检查 `uiautomator dump` 是否成功。dump 失败后仍能返回上次的节点和 marker；cat 失败时返回空字符串，也可能被视觉入口当作“未停留在调试壳”的依据。修复前新增的 15 项采集回归全部失败，其中故障 dump 仍返回旧 XML。

## 根因与纠正

设备文件没有采集所有权，命令失败和有效证据使用了相同返回通道。将采集边界拆入 `e2e/hbuilderx-local/android-runtime/ui-hierarchy.ts`，每轮用 UUID 创建独占远端路径，dump、cat 和 rm 始终绑定同一设备和文件。路径使用 `node:path.posix`，明确属于 Android shell 逻辑路径，不依赖宿主文件系统。

dump、cat、清理均检查退出码、信号和进程错误。读取内容必须具有完整的 hierarchy 外层及 node，拒绝空白、错误文本和截断的外层。任何采集失败都直接拒绝返回证据；清理失败也不报告成功，主体与清理同时失败用 AggregateError 保留两者及原始 cause。清理仅删除本次文件，不访问共享旧 XML 或其他任务文件。

## 验证

`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/android-ui-hierarchy.test.ts e2e/hbuilderx-local-helpers.test.ts e2e/app-visual-lifecycle.test.ts --update=none`：41 项通过，其中新增采集回归 17 项。

覆盖重复采集隔离、POSIX/Windows/相对宿主 PATH、dump 非零退出/超时/抛错、零退出但未写文件、cat 失败、空白/错误文本/截断内容、XML 声明、仅清理自身文件，以及主体与清理双错。目标文件 ESLint、新采集模块的严格 TypeScript 检查以及 `pnpm agents:check` 通过。没有修改 demo、样式输出或 static 基线。

将原 `android-runtime.ts` 和新测试一并纳入独立严格类型检查时，仍报该原文件已有的 `pngjs` 声明缺失及 `markerBounds` 可选属性赋值错误；本次未扩大范围修改这些已有问题。新模块检查命令为 `pnpm exec tsc --ignoreConfig --noEmit --target ESNext --module ESNext --moduleResolution Bundler --types node --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --skipLibCheck e2e/hbuilderx-local/android-runtime/ui-hierarchy.ts`。

## 适用边界

本次仅运行 mock 定向回归，未操作 Android 设备、模拟器或浏览器；真实 Alpha 5.31 多端验收仍需主流程在集成后重新预检执行。外层结构检查不等同完整 XML 校验，marker、边界和颜色等业务验收仍由现有运行时与视觉探针负责。

## 规则评估

不新增 AGENTS 规则。现有资源所有权、失败不可放行和本轮证据规则已覆盖该问题，通过独占采集实现与持久回归落实。
