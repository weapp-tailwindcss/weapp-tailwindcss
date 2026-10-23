---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417
baseline: fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417
regressions:
  - packages/weapp-tailwindcss/test/ci/framework-boundaries.test.ts
  - packages/weapp-tailwindcss/test/ci/framework-public-entries.test.ts
  - packages/weapp-tailwindcss/test/context-framework-isolation.test.ts
  - packages/weapp-tailwindcss/test/context/framework-environment.integration.test.ts
  - packages/weapp-tailwindcss/test/framework-policies.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-framework-isolation.test.ts
  - packages/weapp-tailwindcss/test/bundlers/style-injector-isolation.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-isolation.unit.test.ts
---

# 框架目录不能替代依赖与状态边界

## 症状

主包已按框架组织适配目录，但共享 Vite 资源处理、样式收尾与 HMR 仍直接操作 uni-app-x 实现，Webpack loader 流程仍包含 Mpx 处理。旧边界用例只检查外层文件的字符串，无法发现子模块、类型引用和聚合导出形成的依赖。

交叉复核还发现：显式指定同一 `tailwindcssBasedir`，先以 `MPX_CLI_MODE=web` 创建 context，再切换为 `wx`，会得到同一 context，平台仍为 `web`。重新解析策略已能得到 `mp-weixin`，但缓存命中跳过了策略解析。

## 根因与纠正

框架专属行为没有形成完整所有权，目录包装隐藏了实际依赖。改为由框架分支注册来源、资源任务和阶段回调，构建器拥有调度及产物提交；编译核心接收中立策略。style injector 工厂与通用生命周期包装分开。真正共用的 uni 协议明确归属同一家族，其他框架不能引用。

架构门禁复用完整 AST 图，检查类型、动态导入、重导出以及跨 workspace 的框架 injector 入口。公开分派与兼容解析仅按具体入口登记，普通 facade 和 preset 共享 helper 不豁免。

显式 basedir 被误当成完整的上下文身份。缓存键现在始终包含生成目标环境，来源目录稳定时仍能区分框架平台；相同环境继续复用缓存。

只隔离 context 缓存还不够：原有生成与 Web 单位转换会重新读取全局环境。实例现在保存环境事实，内部生成、Vite 样式平台、uni-app-x 原生目标和 Taro 资产处理消费此快照；显式配置仍可在后续调用中更新。Web 单位兼容决策进入增量缓存与 utility 排序缓存身份。框架 JS 资产接口提供绑定到当前资产的转换与缓存操作，不再暴露核心 cache 或候选集合。

## 验证

- 新缓存回归在修复前 7 项全部失败，其中 Mpx 平台实际返回 `web`；修复后与既有缓存、选项、框架策略回归一起验证。
- 架构检查器用合成 workspace 验证直接/间接引用、跨框架与跨包类型引用、合法组装和路径归属，覆盖 POSIX、Windows 盘符与 UNC。
- Webpack 和 injector 验证交错实例的 loader、registry 与生命周期归属；核心配置归一化保持原公开返回形状。
- 本轮在 macOS、Node 24.18.0、pnpm 12.14.0 的独立工作树验证整合改动，使用 `CI=1` 和 Vitest `--update=none`。没有修改 demo 或已有 CSS/JS 快照基线。
- `pnpm architecture:check`：37 个包、1475 个源码文件通过。`pnpm agents:check`、生产源码 ESLint、`git diff --check` 通过。
- `pnpm --filter weapp-tailwindcss build`、`pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.build.json --noEmit --noCheck false --pretty false`、`pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false`、`pnpm --filter weapp-tailwindcss tsd` 通过。
- 策略、实例环境和依赖图：`pnpm --filter weapp-tailwindcss exec vitest run test/context-framework-isolation.test.ts test/context/framework-environment.integration.test.ts test/context-cache.test.ts test/framework-policies.test.ts test/ci/framework-boundaries.test.ts test/ci/architecture-graph.test.ts --update=none`，86 项通过。
- Vite：`pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/framework-plugins.test.ts test/bundlers/vite-framework-isolation.unit.test.ts test/bundlers/vite-plugin.uni-app-x.unit.test.ts test/bundlers/vite-js-processing.unit.test.ts test/bundlers/uni-app-x-postprocess.unit.test.ts test/bundlers/vite-generate-finalize.test.ts test/bundlers/vite-source-candidates-hmr.unit.test.ts test/bundlers/vite-dispatcher.unit.test.ts test/bundlers/vite-plugin.bundle.unit.test.ts test/bundlers/vite-build-reuse.integration.test.ts test/bundlers/vite-framework-universal.integration.test.ts test/uni-app-x/vite.test.ts --update=none`，335 项通过。
- Webpack/Rspack/Gulp 真实编译与 injector：`pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/source-generation-contract.test.ts test/bundlers/webpack-framework-isolation.test.ts test/bundlers/style-injector-isolation.test.ts test/bundlers/webpack.v5-loader-preparation.test.ts test/bundlers/style-injector-hooks.test.ts test/bundlers/webpack-style-injector-integration.unit.test.ts test/ci/package-module-exports.test.ts test/exports-alias.test.ts test/vitest/dts.test.ts --update=none` 对应的 41 项通过。
- Mpx、发布入口与核心生命周期：`pnpm --filter weapp-tailwindcss exec vitest run test/shared/mpx.test.ts test/ci/framework-public-entries.test.ts test/compiler/framework-compiler-session.test.ts test/compiler/core-compiler-lifecycle.test.ts test/compiler/core-compiler-source-invalidation.test.ts test/compiler/core-compiler-invalidation-race.test.ts test/compiler/tailwind-generation-invalidation.integration.test.ts --update=none`，55 项通过。
- 默认选项、runtime branch 与原架构契约：`pnpm --filter weapp-tailwindcss exec vitest run test/options.test.ts test/runtime-branch.test.ts test/ci/architecture-contract.test.ts --update=none`，66 项通过。
- Vite watch：`pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-plugin.template-delete-watch.test.ts test/bundlers/vite-plugin.hmr-version-matrix.test.ts test/bundlers/vite-uni-app-x-css-watch.integration.test.ts test/bundlers/vite-uni-app-x-css-hash.integration.test.ts --update=none`，33 项通过，覆盖 Vite 4–8、模板删除和 uni-app-x 样式更新。整合验证共覆盖 41 个文件、616 项测试。

发布回归最初尝试完全关闭 Node 的同步 ESM 支持，被现有 `postcss-preset-env` 纯 ESM 依赖阻断。此设置超出包声明的 Node 运行语义，不能据此归因为框架隔离回归。正式测试使用受支持的 Node，同步加载公开入口和 loader，并单独拦截 `@tailwindcss/vite`、`@tailwindcss/postcss`；实际 HBuilderX 与设备验收仍由多端预检和对应流程证明。

多端环境预检结果在本轮收尾时补充；单测通过不代表 IDE 或设备验收通过。

## 适用边界

这是同包内部隔离，包名、入口和框架/构建器支持组合保持兼容。Rspack 复用 Webpack，Gulp 保留 native。通用生成、CSS 转换与扫描能力继续由原所有者维护；不复制到各框架。

## 规则评估

更新主包规则，要求新增框架与兼容入口补依赖图和行为回归；策略目录增加就近规则。可执行门禁取代对外层文件字符串的检查，不增加全目录豁免。
