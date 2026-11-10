---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1340
baseline: d42ba198d475e70ee26634bc234abc19ea864b5c
regressions:
  - packages/weapp-tailwindcss/test/compiler/compilation-session-pool.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-web-css-stage.test.ts
  - e2e/issue-1340-static.test.ts
verification:
  - claim: 129 个同时生成的 scope 均提交，完成后池回收到 128
    kind: unit
    status: passed
    sha: d42ba198d475e70ee26634bc234abc19ea864b5c
    environment: macOS，Node 与 pnpm 使用本机仓库工具链；验证包含该基线上的未提交修复
    command: CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/compiler/compilation-session-pool.test.ts --update=none
  - claim: uni-app x 原生 @apply 缺少生成结果时失败，匹配快照仍可回放
    kind: integration
    status: passed
    sha: d42ba198d475e70ee26634bc234abc19ea864b5c
    environment: macOS，Node 与 pnpm 使用本机仓库工具链；验证包含该基线上的未提交修复
    command: CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-web-css-stage.test.ts --update=none
  - claim: 151 个页面和 151 个组件 scope 的真实 Tailwind 生成结果均有样式声明
    kind: integration
    status: passed
    sha: d42ba198d475e70ee26634bc234abc19ea864b5c
    environment: macOS，Node 与 pnpm 使用本机仓库工具链；引擎生成 CSS 后按模拟的 Vapor 模板/样式包边界核验
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1340-static.test.ts --update=none
  - claim: 用户提供的复现工程在 5.7.3 下连续三次 Android Vapor 冷编译且产物检查均通过；每轮 302 个模板缺失样式包和空样式包均为 0，三轮聚合产物哈希一致
    kind: native
    status: passed
    sha: d42ba198d475e70ee26634bc234abc19ea864b5c
    environment: macOS、Node 24.22.1、pnpm 12.18.0；隔离副本 /tmp/issue-1340-android-vapor.DSo8GE；HBuilderX 5.34.2026102909 stable、Android 设备 L204203G00581，151 个页面和 151 个组件
    command: HBuilderX cli launch app-android --deviceId L204203G00581 --compile true --cleanCache true --vaporRenderTarget bytecode（连续三轮）；每轮 pnpm check；日志和产物见 /tmp/issue-1340-android-vapor.DSo8GE/evidence/acceptance.json
  - claim: 全端环境预检报告顶层保持 blocked，未作为全面测试放行
    kind: ci
    status: failed
    sha: d42ba198d475e70ee26634bc234abc19ea864b5c
    environment: macOS、Node 24.22.1、pnpm 12.18.0；该轮报告中的 base、微信 IDE、HBuilderX、iOS、Android、Harmony、Web 与当前会话 computer-use 单项检查均为 passed，但报告顶层 status 为 blocked 且 verifiedAt 为空
    reason: 该报告没有形成全面测试放行；用户明确要求的 Android 冷编译作为单独的定向设备验收执行。
    command: pnpm e2e:preflight prepare；按本轮报告执行 verify；报告见 e2e/.artifacts/preflight/af124024-3837-4959-a0a7-7aba42210031/report.md
---

# Issue #1340 Android Vapor 样式作用域淘汰

## 症状

用户提供的 151 页、151 组件 uni-app x 工程在 HBuilderX Android Vapor 冷编译时，模板仍引用 `wtu-*`，但部分 `.style.bytes` 没有对应声明。重编译后缺失位置会变化，H5 对照正常。

## 根因与纠正

`CompilationSessionPool` 原先将 scope 数限制为 128。第 129 个 scope 到达时直接淘汰 LRU entry 并将其设为 inactive，没有检查 `executions`。该 entry 的 CSS 生成即使成功，`runEntry()` 也会因 inactive 拒绝提交，之后 PostCSS 消去未展开的 `@apply`，留下空选择器。

现在容量限制只约束空闲 entry：有 execution 的 entry 不参与淘汰；所有 entry 都活跃时允许短暂超限；每个 execution 结算后按 LRU 淘汰空闲条目，缓存最终收敛到 128。显式 scope 失效和 owner dispose 仍会撤销提交资格，并等待既有 execution 后释放 session。该改动没有新增公开 API，也不以扩大常驻容量作为修复。

另一条失败路径也变得可见：uni-app x 原生生成请求确实包含 `@apply`，生成结果为空且没有指纹匹配的快照时，Vite 管线立即报错。配置失效、生成器主动跳过和非当前 CSS owner 不因此误报；已有有效快照仍可回放。

## 验证

`CompilationSessionPool` 单测覆盖 129 个同时挂起 scope、完成后缓存收敛、空闲 entry LRU 回收、重入创建 scope，以及显式失效、revision 和 dispose。Vite CSS 阶段单测覆盖无快照冷启动失败、有效快照回放和非 uni-app x 合法跳过。

新增 `e2e/issue-1340-static.test.ts` 使用真实 Tailwind v4 引擎生成 302 个局部 `@apply flex` 规则，并与 151 个页面、151 个组件 scope 的模拟字节码模板引用逐一核对。限定更新后的 static 基线显示 302 个模板均有工具类规则，空包、缺失规则、裸 `@apply` 和未提交 scope 都为 0，任务结束后池大小为 128。该测试证明引擎生成与会话提交的静态边界，不等同于 HBuilderX Vapor 真实产物。

发行包压力对照已确认 5.7.2 为 128/129 个 scope 提交、5.7.3 为 129/129，排空后池为 128；Issue #1340 在本复盘记录时仍 OPEN。当前轮全端预检报告的单项检查均通过，但其顶层状态仍为 `blocked`，因此没有启动全仓/全端全面测试。用户单独要求的 Android Vapor 冷编译在复现工程隔离副本中执行三轮，每轮 151 个页面、151 个组件均编译成功；302 个模板引用的样式包缺失数为 0、空包数为 0，聚合产物 SHA-256 均为 `66136c477aab5bb068cdd2b48d0d9a7c4fefc265421385485e9051b476bc8fd2`。证据见 `/tmp/issue-1340-android-vapor.DSo8GE/evidence/acceptance.json` 与每轮日志。该验收证明冷编译产物，不包含应用安装后的运行时检查。

## 适用边界

该修复针对 scope 并发数超过空闲缓存上限、且旧 scope 尚在执行时的提交丢失。真实生成返回空但没有可复用快照的原生 `@apply` 现在会失败关闭，便于定位其他生成故障；它不会把这些故障伪装成空 CSS 成功。三轮冷编译均使用已发布版 5.7.3，因此属于发行版验证，不代表尚未发布的 PR 源码已在 HBuilderX 上完成相同设备验收。

## 规则评估

不新增 AGENTS 规则。现有 execution 生命周期、失败回归、static 基线和原生设备证据要求已覆盖本次边界。
