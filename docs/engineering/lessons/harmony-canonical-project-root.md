---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 6300019672793344d98c32b7b3c011c7207a0c12
regressions:
  - e2e/hbuilderx-app-project.test.ts
  - e2e/hbuilderx-app-process-cleanup.test.ts
  - e2e/app-visual-lifecycle.test.ts
  - e2e/hbuilderx-alias-consumers.test.ts
---

# Harmony 编译入口与模块图的真实路径身份

## 症状

在 HBuilderX `5.31.2026093020-alpha` 的本轮 Harmony VDOM 验收中，初次启动完成后，首轮热更新报告 `10310009 ArkTS: INTERNAL ERROR`：`Failed to find module info with '.../weapp-tailwindcss-hbuilderx-projects/<alias>/unpackage/dist/dev/app-harmony/entry/src/main/ets/entryability/EntryAbility.ets' from the context information`。相邻编译警告使用工作树的真实路径。

首轮产物位于 `e2e/.artifacts/uni-app-x-alpha/harmony-vdom-diagnostic-8e097fef4/uni-app-x-vdom-tailwindcss-v4-harmony/`；错误同时记录在 HBuilderX 当轮 `.log` 的 20:45:30 输出中。这是取消前的模块查询失败，与[取消后 alias 释放竞态](harmony-cancel-alias-boundary.md)分别记录。

## 根因与纠正

本轮只读核对了已安装的 Alpha 插件与 DevEco 编译器。以下是静态机制证据，不代表设备对照已通过；压缩文件的位置是零起始字符偏移，升级后需要重新核对。

| 来源 | 证据 |
| --- | --- |
| `uniapp-extension/out/index.js`，偏移 776846 | `resolveCliWorkspaceFolder` 支持绝对项目路径。先查询已打开的 workspace；未找到时按该路径构造 `cli-<md5>` 临时身份，无需 `project open`。 |
| `launcher/out/main.js`，偏移 1291100–1295100 | 补丁配置中的 `aceModuleRoot` 由传入的 Harmony 工程路径直接生成；传入 alias 时配置继续保留 alias。 |
| DevEco `ets-loader/main.js:513` | `setAbilityFile` 用 `path.resolve` 构造 ability entry，没有执行 `realpath`。 |
| `hvigor-arkts-compose/dist/src/arkts-pack.js`，偏移 16375 | 实际 Rollup 配置明确为 `preserveSymlinks: false`；解析器通过 `resolveSymlink` 使用真实文件路径。 |
| `ets-loader/lib/fast_build/ark_compiler/module/module_mode.js`，偏移 5311、6111 | 构造阶段生成编译上下文，并用原始 entry 字符串调用 `getModuleInfo`。入口保留 alias、模块图使用真实路径时不能命中。 |

旧入口已经对 Harmony 传入绝对 alias，单纯把项目名改成绝对路径不能消除身份差异。新的 `scripts/hbuilderx-app-project.ts` 统一主 HMR、视觉验收和两个 issue #1164 Harmony 静态入口：仅对已握手的 Alpha 5.31 起的 Harmony 使用真实根，cwd、源码变更与 launch 项目身份采用这一根。真实项目不获得 `project open/close` 权限，避免干扰用户已导入的同名项目；其启动进程仍由本轮调用者停止。

旧版与其他 App 平台继续创建独占 alias。只有尝试过打开的 alias 才执行严格关闭，关闭失败保留 alias；尚未打开时只释放本地 alias。视觉入口保留完整受管 launch 并等待 `stop()`，不能用根进程已退出或固定等待代替进程树清理。独占临时原生对照项目也不再吞掉关闭失败后直接删除目录。

## 验证

先在基线添加真实目录符号链接的消费者回归，绝对与相对输入两例均失败：`--project` 为临时 alias，cwd 仍是符号链接路径。修复后定向回归覆盖版本边界、POSIX/Windows/UNC/相对路径传递、同名不同目录、打开及关闭失败、启动后日志初始化失败、根进程先退出、停止失败与源码恢复。

执行命令：

```bash
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hbuilderx-app-project.test.ts e2e/hbuilderx-app-process-cleanup.test.ts e2e/hbuilderx-alias-consumers.test.ts e2e/app-visual-lifecycle.test.ts --update=none
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/hbuilderx-local-matrix.unit.test.ts --update=none
pnpm agents:check
```

定向回归四个文件共 73 项、核心矩阵 12 项通过；新 helper 与回归通过包含 `exactOptionalPropertyTypes` 的严格类型检查，ESLint 与规则检查通过。

以上工程回归没有修改 demo、样式断言或 static 快照，不代表设备 HMR 通过。

主任务在 `43d546478` 完成新的预检、后台真实输入/点击/截图和 verify，以轮次 `aad1b95a-6fe0-4de2-b9cc-83ab201f8d66` 单独执行 VDOM Harmony 根因对照。实际 Alpha 为 `5.31.2026093020-alpha`，OpenHarmony 模拟器为 `127.0.0.1:5557`。身份日志为 `canonical-root`，项目根、launch 参数、`compileConfig.aceModuleRoot` 和 patch 路径均为同一任务工作树的真实路径；本轮没有再出现 `Failed to find module info`。原始 `buildConfig.json`、厂商日志、首屏与更新截图/布局保存在该轮 `harmony-canonical-diagnostic` 目录。

首屏 marker 及截图通过；第一次更新完成后，新 marker 也可见。但日志在 `23:08:55.451` 首次 App Launch 后，`23:09:01.631` 报热更新完成，`23:09:02.006` 再次 App Launch，结构探针 PID 从 `10691` 变为 `10755`。因此严格 HMR 判为 `restarted`，未执行第二轮更新，不能把页面更新可见或编译错误消失写成不重启 HMR 通过。本轮是独立根因对照，不计入此前已在 watch 阶段停止的完整编排。

只读复查同版本厂商实现后，保存的 `vendor-log.txt:78` 调用栈 `pushResource → restartAppHelper` 与 launcher 的成功路径一致：`launcher/out/main.js` 零起始字符偏移 `1156731` 的 quickFix 成功分支等待 `restartAppHelper`，后者在偏移 `1136068` 执行 `stopApp → startApp`。此次 PID 变化有明确机制证据，不能归为本库 CSS 生成错误或仅推测为失败 fallback。该结论只适用于所记录的 Alpha 版本，不替代当前提交的设备验收。

真实验证需重新预检，并串行记录本轮 host、版本和 `[hbuilderx-app-project]` 身份，核对输出工程、patch 配置的 `aceModuleRoot`、编译错误路径都使用同一真实根。检查初次启动、连续两轮 HMR、恢复后的页面与产物；确认没有错误 workspace 的项目类型提示或旧 alias 路径，也没有 native fallback。停止后仍需确认任务状态，不能依据不再删除 alias 推断 native 任务已结束。

## 适用边界

能力门槛仅来自已核对的 Alpha 5.31 实现；stable、未知版本和较旧 Alpha 保留原兼容路径。未来插件若修改绝对路径协议，应重新核对能力门槛。厂商 `getWorkspaceFolder` 可能优先返回已打开的祖先 workspace，实际输入目录与编译日志仍须匹配任务工作树；本次没有发明项目列表解析或全局取消协议。

首次 native 构建为何成功、patch 在哪一处重新引入 alias 尚需运行时配置证据。`hotReload` 会进一步把未规范化的 changed-file 列表赋给 entryObj，`coldReload` 没有这一赋值，不能混为同一调用栈。真实根入口没有修复厂商的迟到 fallback、共享 IDE 停止屏障或全部符号链接依赖问题。

厂商停止协议也不能作为 native idle 回执：同版本 `uniapp-extension/out/index.js` 偏移 `766833` 的取消回调不等待 `c.stop()`，偏移 `786827` 的 Harmony stop 吞掉 launcher 错误；`launcher/out/main.js` 偏移 `1325345` 的导出 stopRun 不等待内部 stopRun，偏移 `1138407` 的内部实现未等待已进入的 pushResource。因此 CLI 退出与项目关闭均不证明迟到的更新/重建已结束。遇此失败应停止后续原生调度，保留任务现场，不执行共享 IDE 全局停止；将来若实现自动恢复，需要独立的完成证据及源码/产物清理屏障，不能仅在“收集错误后继续清理”的 helper 前加一次检查。

## 规则评估

不新增或放宽 AGENTS 规则。通过统一入口和持久回归落实既有路径身份与资源归属约束；运行步骤补充到已有多端手册。工程脚本变化不触发公开包版本提升。
