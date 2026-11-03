---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1319
baseline: 80efee1e22769557c4c73308c546f446c929320a
regressions:
  - packages/weapp-tailwindcss/test/uni-app-x/compiler-border-preflight.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/compiler-preflight.unit.test.ts
---

# 原生模板最终宿主的边框基础类

## 症状

原工程 `cq112233/unibestX@b239192f46611f51877aef48ca851b4c67c47f44` 的首页在 HBuilderX 5.34.2026102909、Harmony Vapor 字节码模式、Pura 90 new 上正式复现额外三边框。B R6 使用运行时源码 `49e347ee8dd6e3a652139a590179014c4ed04ecf` 的完整闭包；当前仓库 `c4e0901993422cdef750ae0423887681342bdec0` 未改变该闭包的产品源码。

首败 `b-r6-harmony-vapor-original-v7-20261103021900` 保留原 bundle、当前 token、App Launch 1 次、稳定真实节点、截图前后进程与几何合同。内层预期四边 `[1,0,0,0]`，像素测得约 `[0.857,2.857,2.857,2.857]`，符合顶部约 1px、其余三边约 3px。首次 JPEG、像素剖面、完整转换追踪、4478 项原生产物 hash 与原始日志均保留，未用后续结果覆盖。

## 根因与纠正

完整 SFC 的早期 `nvue` transform 使用 `order:'pre'`，早于普通 `enforce:'pre'` 的 HTML 转换插件。当时原 `AiSkillSection.uvue` 的目标和卡片仍为 `div`，默认只向 `view/text` 注入的基础类未命中。HTML 插件随后把标签变为 `view`，没有再次补类。重置 CSS、两个真实 style 索引、load 返回与原生产物均完整，首次偏离是基础类与最终宿主脱节。

原 Git 对象独立核对：组件为 4047 字节，SHA256 `0ad190b0dca53137b86d91b6eb3043269252e1dcebd22adc441ec6d4fd2ab40b`。目标原本即使用 `border-t-[1px] border-solid border-[#e2e8f0]`；验收器没有把普通类替换为 arbitrary 类。早先相反的排查假设已撤回。

修复保留早期 SFC 与样式事务，通过真实 `vite:vue` 公开 `api.options` 注册实例自有 compiler nodeTransform。回调位于作者列表首位，退出时等作者和平台映射完成、宿主 props 生成前，按最终节点补齐基础类。不猜测 HTML 标签映射、不调整用户插件顺序、不修改厂商文件，也不合并 style 或关闭 preflight。

watch 每轮结束释放当轮回调，下一轮 buildStart 复装，最终 closeWatcher 释放配置。清理从最新 options 只移除本实例回调，保留编译器与作者后续原地更新的字段和 transforms，不恢复旧快照覆盖它们。

## 验证

修复前真实 Vite hook 链的三个行为用例失败：HTML 插件位于配置前后及多个作者 style。修复后 root 的 31 文件、414 项定向回归通过，包括 POSIX、Windows 盘符、UNC、相对来源、动态 class、重复编译、作者映射和 watch 生命周期。

```sh
pnpm --filter weapp-tailwindcss exec vitest run test/uni-app-x test/bundlers/vite-plugin.uni-app-x.unit.test.ts test/bundlers/vite-plugin-slots.unit.test.ts test/ci/architecture-contract.test.ts test/ci/framework-boundaries.test.ts --update=none
pnpm --filter weapp-tailwindcss build
pnpm architecture:check
pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.build.json --noCheck false --noEmit --pretty false
```

Node 24.22.1、pnpm 12.15.0、自有 worktree 依赖；root 在上述提交加本次未提交修复上执行，Vitest 实际由根目录以 `--project=weapp-tailwindcss` 选择同一包和过滤项。ESM/CJS/声明构建、架构与五个产品/测试文件的 ESLint 通过。源类型检查仍为既有五项诊断，无新增，不能写成类型检查通过。

HBuilderX 5.34 实际 VDOM compiler-sfc 3.4.21 与 Vapor compiler-sfc 3.6.0-rc.9 的静态/动态 class、作者退出映射两例均无编译错误；完整输出独立复算 hash。Vapor 经实际 createUniOptions、descriptor 与模板 extra options 进入编译，最终 createViewElement/createTextElement 消费的共享 class 含基础类。这只是厂商纯编译兼容，不能代替原平台运行态。

本次没有修改 demo 源码。真实新闭包、对应 static 基线与 Harmony 更新矩阵仍待验收；R6 首败和旧 CI 结果不能替代新源码验收。

## 适用边界

默认范围仍为 `view/text`，显式 `all`、`cssPreflight:false` 与作者覆盖保持原语义，H5 和小程序不启用新增原生挂点。Android VDOM 有独立编译选项路径，不能由本次厂商纯编译外推通过。#1319 与 #1325 继续分别判定，未完成原平台矩阵前均不标记全面根治。

## 规则评估

不新增规则。现有编译生命周期、配置所有权、真实产物和原生证据边界已覆盖本次风险，新增可执行回归固化它们。Refs #1319，Refs #1325。
