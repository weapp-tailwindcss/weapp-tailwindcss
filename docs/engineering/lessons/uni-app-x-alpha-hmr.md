---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1164
baseline: 6873b33a5b396ec3155f4c9d28d30286473ccb6e
regressions:
  - e2e/issue-1144-alpha.test.ts
  - e2e/issue-1144-static.test.ts
  - e2e/issue-1144-runner.test.ts
  - e2e/hbuilderx-hmr-lifecycle.test.ts
  - e2e/issue-1164-native-static.test.ts
  - e2e/issue-1160-mini-static.test.ts
---

# uni-app x：5.25 alpha 与 Harmony 更新证据

## 症状

本记录补齐 [Issue 1144 记录](issue-1144.md) 中未验证的 alpha / 原始 setup 环境，以及 [Issue 1164 记录](issue-1164.md) 中“产物更新但自动重装”的边界。旧记录的 Sass、SCSS 解析修复仍有效；本次没有复现需要新增产品解析补丁的失败。

2026-09-08，从上述最新 origin/main 创建仓库外 worktree，分支 `codex/uni-app-x-alpha-hmr-root-fix`。Node 24.18.0、pnpm 11.25.0，冻结安装成功，锁文件未改。聚合包构建完成后直接重建 postcss 与主包；demo 解析到该 worktree 的 `packages/weapp-tailwindcss/dist/vite.cjs` 与 `packages/postcss`，消费 npm 版 tailwindcss-patch。

固定使用正在运行的 HBuilderX **5.25.2026082902-alpha**、host `HBuilderX`，CLI 位于 alpha 应用内。Harmony 为 Pura 90 模拟器、OpenHarmony 6.1.1.125，DevEco Studio 6.1.1.280；编译日志明确为 5.25、VDOM、样式隔离策略 1.0。

## 根因与纠正

### #1144：补齐原始 setup，纠正 static 读取器

同一 alpha 服务中，Options 与公开复现仓库原始 `script setup lang="uts"` 两种写法分别完成 16 轮保存、第 12/16 轮后刷新。每轮检查真正消费 `pt.root` 的组件 class、CSS、computed padding、important 竞争样式与本轮 marker；交错新增/删除 important，并切换 scoped、非 scoped、无 style 和恢复 style。没有 Sass/PostCSS 错误。

static 的 setup 首次运行失败在测试读取器：编译器将 pt 包装成 `new UTSJSONObject({ root: ... })`，旧读取器只接受直接对象字面量，读不到类名。仅解开这个确定的编译器包装后，相同产物通过，两种脚本共用的语义基线未变化。未放宽 class/selector/声明断言，也未改产品行为。

这替代旧记录中“alpha 会话冲突，尚未验证”的限制，以及 demo README 对 setup 普遍不支持的推断；不扩展成任意第三方组件包均已验证。

### #1160：小程序测试需要明确打开项目

旧专项直接传入未打开的 worktree 路径，CLI 返回后不存在 mp-weixin 产物，12 个探针全部缺失。测试改用现有独立项目别名，显式打开、固定本轮 runner 的 alpha/host、清理旧目标产物后编译并关闭自己的项目。同用例修复前 0/12，修复后 12/12，原有 border 基线不变；没有修改任何产品边框行为。

### #1164：分开符号链接失败、增量重启与纯 HMR

有插件的原 demo 四组首次渲染正确。通过旧 runner 的项目根符号链接启动时，删注释、加注释并改蓝色/120px/12px、恢复三轮均出现：

```text
热更新失败
安装 .hap 到鸿蒙设备 ...
App Launch
```

CLI 隐去的 HBuilderX 内部日志同时包含：

```text
hvigor ERROR: 10310009 ArkTS: INTERNAL ERROR
Failed to find module info with '<project-alias>/unpackage/dist/dev/app-harmony/entry/src/main/ets/entryability/EntryAbility.ets' from the context information.
```

随后在外部独立真实目录复制同一项目（仅 node_modules 链接），固定同一 IDE/compiler/device，重复三轮。每轮增量完成，没有 `.hap` 重装，但仍重新 App Launch。项目根符号链接与 realpath 混用是本轮 ArkTS 模块身份失败的触发条件；这属于测试启动边界，不能归为 Tailwind 生成器缓存失效。直接打开嵌套 worktree 路径曾返回“不支持运行到鸿蒙”，本记录不把这进一步推断为特定的项目名称冲突。

再用 [原生 CSS 最小对照](../../../e2e/fixtures/issue-1164-native/README.md)，完全不注册 Tailwind 插件。四组首次样式正确，三轮增量仍会重启，点击按钮得到的内存状态在首次更新后清零。

| 场景 | 初始 PID | 删除注释 | 加回注释并修改样式 | 恢复 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 插件、真实目录 | 23681 | 23773 | 28495 | 29558 | 增量完成，无重装，但重启 |
| 原生 CSS、真实目录 | 2970 | 3051 | 4595 | 5789 | 同上，且 state=1 → state=0 |

原生对照关键时序（本机日志时区）：

```text
10:33:25.902 App Launch
10:34:32.026 开始热更新 ...
10:34:36.750 热更新完成
10:34:37.615 App Launch
10:35:30.767 开始热更新 ...
10:35:35.008 热更新完成
10:35:35.813 App Launch
```

因此本次不为“纯 HMR 通过”修改插件语义。修正两条验收入口：每轮源文件写入前订阅 stdout/stderr，保留完整日志（32 MiB 上限）；失败、重装、App Launch 都不能被后续成功信息覆盖。传输完成后另查设备当前 marker、布局、截图与同一 PID，避免“产物新、运行时旧”的假成功。单测覆盖日志分片、超过旧 160 片段窗口、迟到的 App Launch、旧 marker 与 PID 变化。

## 验证

完整命令输出与设备原始证据位于忽略目录 `e2e/.artifacts/alpha-hmr`，Web 每轮证据位于 `e2e/.artifacts/web-hmr`。版本化基线只保留语义声明，不含本机路径或构建哈希。

```sh
pnpm install --frozen-lockfile
pnpm build:pkgs
pnpm --filter @weapp-tailwindcss/postcss build
pnpm --filter weapp-tailwindcss build
pnpm exec cross-env CI=1 HBUILDERX_CHANNEL=alpha HBUILDERX_HOST=HBuilderX E2E_HBUILDERX_CASE=issue-1144-uni-app-x-web E2E_HBUILDERX_WEB_TIMEOUT_MS=45000 pnpm e2e:hbuilderx:h5
pnpm exec cross-env CI=1 HBUILDERX_CHANNEL=alpha HBUILDERX_HOST=HBuilderX E2E_ISSUE_1144_ALPHA=1 E2E_HBUILDERX_WEB_TIMEOUT_MS=45000 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1144-alpha.test.ts --update=none
pnpm e2e:windows-utilities
pnpm exec cross-env CI=1 pnpm exec vitest run --project=weapp-tailwindcss --project=@weapp-tailwindcss/postcss --update=none --coverage.enabled=false
pnpm exec cross-env CI=1 pnpm exec vitest run --project=@weapp-tailwindcss/hbuilderx-runner --update=none --coverage.enabled=false
pnpm exec cross-env CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1144-static.test.ts -u
pnpm exec cross-env CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1144-static.test.ts e2e/issue-1144-runner.test.ts e2e/hbuilderx-hmr-lifecycle.test.ts --update=none
pnpm exec cross-env CI=1 HBUILDERX_CHANNEL=alpha HBUILDERX_HOST=HBuilderX E2E_ISSUE_1164_NATIVE=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1164-native-static.test.ts -u
pnpm exec cross-env CI=1 HBUILDERX_CHANNEL=alpha HBUILDERX_HOST=HBuilderX E2E_ISSUE_1164_NATIVE=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1164-native-static.test.ts --update=none
pnpm exec cross-env CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1160-static.test.ts e2e/issue-1166-webpack-radius.test.ts --update=none
pnpm exec cross-env CI=1 HBUILDERX_CHANNEL=alpha HBUILDERX_HOST=HBuilderX E2E_ISSUE_1160_MINI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1160-mini-static.test.ts -u
pnpm exec cross-env CI=1 HBUILDERX_CHANNEL=alpha HBUILDERX_HOST=HBuilderX E2E_ISSUE_1160_MINI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1160-mini-static.test.ts --update=none
pnpm typecheck
pnpm agents:check
git diff --check
```

通过：core + postcss 4,158 项、38 跳过；HBuilderX runner 19 项；static/setup/生命周期 14 项；最终运行器、渲染模式与视觉主题专项合计 37 项通过；原生四组 Harmony static 1 项；#1160 H5 与 #1166 webpack 合计 3 项；#1160 alpha mini 1 项。#1144 static 限定本项目重新生成后禁止更新复验，两种脚本共用原有基线；新增原生 CSS 对照同样先更新、后禁止更新复验。原生 static 首次清理遇到编译后台落盘的 ENOTEMPTY，测试清理加入有限重试后相同编译与断言通过。

#1159 独立 Taro 消费已通过：发布版 5.5.1 dev/prod、当前打包主包及运行时依赖闭包 dev/prod 四阶段均通过。此前 registry 安装阻塞本轮未再发生，未修改锁文件或弱化断言。本次操作系统是 macOS，不能表述为 Windows 原生复验。定向 lint 为 0 错误（仓库默认忽略的 Markdown/fixture 配置产生提示），`agents:check` 为 0 错误，`git diff --check` 通过。

## 适用边界

Harmony 保持运行状态的纯 HMR 尚未通过；无插件对照已复现，因此保留 Draft 交付与上游环境限制。旧符号链接 runner 的 ArkTS 失败也不能通过重新安装来自动转绿；通用项目暂存方案需保留配置相邻依赖与 source/output 身份，不能简单删除隔离机制。

公开包源码、API、默认配置、原生共享逻辑未改变，所以没有 change intent，也不扩大 Android/iOS/微信运行时验收范围。全仓 `pnpm typecheck` 仍在未改动的主包类型处失败，不宣称类型检查全绿。另在独立干净 HEAD worktree 对照 `pnpm exec tsc -p e2e/tsconfig.json --noEmit --pretty false`：基线与当前各 1,242 条诊断，按文件、错误码和消息比较无新增；不以忽略文件或改断言消除类型错误。修订后的真实 Harmony runner 在初始设备 marker 和截图通过后，于“热更新失败”处拒绝继续报成功；失败现场 `hot-update/state.json` 显示目标 marker 尚未出现在设备上，截图与布局保留。该设备测试保持失败是本次修正的预期结果。未等待远端 CI、发布 npm 或关闭 Issue。

## 规则评估

不新增 AGENTS 规则。把已有“设备证据、同进程连续更新、拒绝假成功”的要求变成验收代码，并保留最小无插件对照，比新增文字规则更直接。旧记录保留历史根因与证据，通过本记录明确补充和替代未验证边界。
