---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1332
baseline: 8dda6d4d0e75fbe44d96152f498d2b43520286dc
regressions:
  - packages/postcss/test/color-mix-dynamic-alpha.test.ts
  - packages/postcss/test/color-mix-alpha-semantics.test.ts
  - packages/weapp-tailwindcss/test/compiler/core-compiler-dynamic-alpha.test.ts
  - e2e/tailwind-weapp-alpha.test.ts
  - e2e/tailwind-weapp-dynamic-alpha-static.test.ts
  - e2e/tailwind-weapp-replay.test.ts
---

# Issue #1332：动态透明度默认使用 rgba 兼容模式

## 症状

从 5.6.3 升级到 5.7.0 后，小程序的动态透明度不再变化。公开 Core 的 `generate().css` 和 `rawCss → transformCss()` 都会删除 `color-mix(in srgb,#123456 var(--opacity),transparent)`，仅保留不透明兜底；`var(--opacity,50%)` 同样受影响，静态 `50%` 正常。

## 根因与纠正

`49b61ded4` 收紧颜色语义，删除了动态 alpha 降级，未解析的现代颜色随后被小程序清理删除。旧降级会覆盖底色原有 alpha，也可能冻结动态主题，因此不能直接恢复。

增加只接受嵌套配置的 `cssOptions.colorMixDynamicAlpha: 'strict' | 'rgba'`。小程序默认 rgba，可显式选择 strict 保持原有严格边界；rgba 仅将可证明不透明的固定底色、完整 `var()` 权重和 transparent 转为 legacy rgba，原样保留变量与 fallback。静态百分比继续走原解析路径，非法静态权重、未知或动态底色、半透明底色不借兼容模式变成有效颜色。

颜色转换统一在 PostCSS AST 规范化层完成，配置传递到生成、用户 CSS 预处理、handler、prune 与 finalizer。完整 var 验证复用共享工具，防止序列化器自动补括号把非法输入变为有效颜色；包含转义的现代颜色 fallback 也须拒绝。直接输出 rgba，不恢复旧占位机制，变量依赖仍对后续分析可见。

只降低已有可识别的 Tailwind 单一颜色能力分支，保留媒体、顺序、注释和 important。strict finalizer 不新增 supports 展开；复杂 supports 仍按原平台策略处理。Core 除 snapshot target 外还检查实际样式目标，避免 weapp snapshot 的 finalizer 绕过 Web/uvue 隔离。

Core 生成使用请求的 `styleOptions.cssOptions`；transform 继承实例或调用覆盖；显式 finalizer 使用自己的 options。生成和转换缓存包含完整嵌套配置，回归覆盖 strict → rgba → strict 和原位修改。

默认选择 rgba 是为了恢复小程序常见的变量透明度行为，避免现代声明被删除后只剩不透明色。共享颜色解析器仍默认 strict，只有小程序入口解析缺省值；实际 Web/uvue 目标在生成预处理、handler 和 Core finalizer 之前统一排除。默认值的纯解析与框架目标解析分层，避免低层颜色清理反向依赖框架编排。作者 CSS 的嵌套配置按字段合并，空对象和无关选项不能覆盖请求中的显式 strict；公开 PostCSS 插件、构建器组装与 legacy 补充链路遵循相同优先级。

## 验证

本轮使用基线加未提交修复，macOS、Node 24.22.1、pnpm 12.15.0、Tailwind CSS 4.3.4；基线 SHA 不代表包含修复的提交。

- 新增回归先红：PostCSS 9 项、公开 Core 2 项行为断言失败；内部依赖首次构建缺失后，在原源码上重新运行得到行为失败。
- Node 24.22.1 下，颜色、配置、变量验证定向 PostCSS 回归 9 文件 271 项通过；公开 Core 生成、字符串/Root 转换、显式清理、缓存与平台边界 4 文件 43 项通过。
- `pnpm turbo run build --filter=weapp-tailwindcss...` 通过；主包 `tsc -p tsconfig.typecheck.json` 通过。
- PostCSS 额外严格检查 `tsc -p tsconfig.build.json --noEmit --noCheck false` 报 4 个既有错误，位于未修改的 `compat/native/compile.ts` 和 `compat/scoped-css/signature.ts`。使用 TypeScript compiler host 将本任务改动覆盖为 HEAD 源文后得到同样 4 项诊断，确认基线已有；未扩大本任务修改范围。
- `pnpm e2e:tailwind:static:update` 只改变微信基线及索引。runner 和 baseline 共用模式分组，新兼容候选独立于原 strict 限制用例，模式进入 fixture 身份；静态禁止更新复验、合成证据回放、篡改反例及 runner/CI 契约共 9 文件 59 项通过。合成图仅验证协议，不作为实际微信运行结果。
- `.github/workflows/tailwind-capabilities.yml` 在 Chromium 分片单次执行微信定向契约，包含 static 禁止更新、回放与模式身份反例；新增 CI 契约先红后绿。创建 PR 后另行记录远端验收，不能用远端结果替代原生验收。
- 文档站中英文构建、定向 ESLint、`pnpm architecture:check`、`pnpm agents:check`、`git diff --check` 通过；`pnpm release status` 确认 PostCSS 和主包的中文 patch intent。未执行 npm 发布。

用户确认默认开启后，新增缺省模式与实际平台隔离回归先红（PostCSS 3 项、Core 2 项）。最终复验为 PostCSS 11 文件 333 项、Core/生成编排 6 文件 220 项、static/契约 9 文件 59 项，共 612 项通过；受影响包重建、主包类型、网站中英文构建、lint、架构与规则检查通过。微信基线按缺省、strict、rgba 三组重新生成后禁止更新复验；运行时 probe 分别覆盖真正省略配置和显式 rgba，历史限制 probe 显式 strict。完整 PostCSS 额外运行退出为 0 但未输出测试汇总，不将其计为已验收范围。

### 实际命令

下列本地复验使用已安装的 Node 24.22.1，并通过任务进程的 PATH 选择，不改机器全局配置：

```sh
CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/color-mix-dynamic-alpha.test.ts test/color-mix-alpha-semantics.test.ts test/color-mix-static-supports.test.ts test/color-mix-compat.test.ts test/modern-color-function-analysis.test.ts test/framework-pipeline.test.ts test/options-resolver.test.ts test/web-author-values.test.ts test/calc-escaped-identifiers.test.ts test/coverage-extra.test.ts test/generator-plugin.test.ts --update=none
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/compiler/core-compiler-dynamic-alpha.test.ts test/compiler/core-compiler.test.ts test/tailwindcss/v4-style-context.test.ts test/ci/architecture-contract.test.ts test/bundlers/generator-css.unit.test.ts test/ci/generation-ownership.test.ts --update=none
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-weapp-dynamic-alpha-static.test.ts e2e/tailwind-mini-program-alpha-limit.test.ts e2e/tailwind-weapp-alpha.test.ts e2e/tailwind-weapp-replay.test.ts e2e/tailwind-weapp-capture.test.ts e2e/tailwind-weapp-environment.test.ts e2e/tailwind-runner.test.ts e2e/tailwind-capabilities-ci.test.ts e2e/tailwind-fixtures.test.ts --update=none
pnpm turbo run build --filter=weapp-tailwindcss...
pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false
pnpm --filter @weapp-tailwindcss/website build
```

### 环境阻塞与未执行范围

首次 extended 预检 `37b69292-6d19-48c8-a5be-2d040b1315e8` 的 shell 使用旧 Node 24.18.0。显式选择已安装的 24.22.1 后，新预检 `267087a1-e688-4b9e-a21b-2b2725b7e768` 的 base、微信 DevTools 探针、Harmony 和 runtime-ios 工具检查通过，但整体仍为 blocked：

- HBuilderX 持久原生会话登记来自 2026-11-05，记录 Harmony 的 reinstalled/native fallback 尚无按 session 停止证明。本任务未创建该会话，不删除登记或关闭其资源。
- iOS 和 Android 各存在多个可用目标，未指定唯一设备。
- 当前 Playwright 所需 Chromium revision 1248 未安装，Web 探针启动失败。
- extended Android 工具检查找不到可执行 Gradle。

本轮报告保存在忽略目录 `e2e/.artifacts/preflight/<run-id>/report.json` 和 `report.md`。失败后服务已退出，没有可用的本轮 Chrome 探针 URL。按本地门禁停止调度，未执行当前会话 Chrome 真实交互、verify 或微信透明度的计算样式/独立参考/像素专项验收；微信基础探针通过不能替代它们。没有本任务 Chrome 标签页需要保留；未操作用户登录态。

## 适用边界

rgba 模式采用 alpha 的数字、百分比与钳制语义，不保证任意变量值与 color-mix 等价。Web、Lynx、React Native 不应用该模式。支持真实运行前不得把微信样式/像素验收写成通过。

## 规则评估

不新增 AGENTS 规则。既有 CSS 所有权、先回归后修复、环境预检和证据重放规则已能覆盖该问题，新增持久测试落实这些约束。
