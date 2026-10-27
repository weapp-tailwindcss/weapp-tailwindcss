---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: c6812c05e68987a4968d2e76ead8614fbfaba46b
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-injector-output-generation.integration.test.ts
  - packages/weapp-tailwindcss/test/bundlers/style-injector-integration.unit.test.ts
  - e2e/multiplatform-build-output.test.ts
  - e2e/subpackage-uni-app-vite-tailwindcss-v4.test.ts
---

# Vite injector 资产必须先于生成与收尾提交

## 症状

PR #1316 的 Ubuntu core smoke 在 uni-app 独立分包样式中发现 `@media source(none)` 空块和 generator placeholder。对应 CI 为 run `39942217133`、job `120377051741`。本地用同一项目的微信 isolated 场景复现相同失败；新增真实 Vite 构建回归在旧实现下的微信和支付宝两组均失败，输出仍包含未生成的 Tailwind 指令。

## 根因与纠正

旧内置 injector 聚合包装遗漏了独立插件的 `generateBundle.order: 'post'`，因此 Rollup 实际先运行 injector，再运行本包带 post 元数据的生成及 CSS finalizer。逐插件代理补回元数据后，旧数组顺序使 injector 改在 finalizer 之后运行；分包资产后发，错过生成和清理。

修复保留公开插件的 hook 元数据，并显式将资产提交放到 post 输出阶段之前。静态描述将转换阶段与输出阶段分开；运行时也先插入资产生产者，再执行框架输出处理、主生成器和 finalizer。uni-app-x 的 style-placeholder 同样消费这些资产，其顺序一并约束。所有输出仍由 bundle/emitFile 提交，没有文件系统兜底。

## 验证

在 macOS arm64、Node 24.18.0、pnpm 12.14.0 上，使用当前工作树修复和 `CI=1` 验证：

- `pnpm --filter weapp-tailwindcss run build` 通过。
- 主包严格源码 TypeScript、源码 ESLint、`pnpm architecture:check` 通过。
- injector、dispatcher、通用框架、重复构建、真实资产生成，以及 uni-app-x、局部样式、最终 CSS 和 Harmony 的定向回归：14 个文件 / 165 项通过。
- `E2E_MULTIPLATFORM_BUILD_CASE='subpackage-uni-app-vite-tailwindcss-v4 mp-(weixin|alipay|toutiao)' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/multiplatform-build-output.test.ts --update=none`：三个平台各 isolated/single，共六组产物及矩阵契约通过。
- `E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/subpackage-uni-app-vite-tailwindcss-v4.test.ts -u` 重新生成对应 static 基线；随后将 `-u` 改为 `--update=none` 验证，两项通过。

Static 差异仅五个 CSS 文件中共 21 处 token source trace 注释从 `/* tokens:` 统一为 `/*! tokens:`，没有选择器、声明、preflight 或分包顺序差异。保留注释语义由此前 `49b61ded48` 的 source trace 生成实现引入，本次只同步诊断快照。该 demo 显式启用了 `cssSourceTrace`；生产压缩保留诊断注释是已有语义，不改变 CSS 执行规则，默认未开启 trace 的用户不产生这些注释。

## 适用边界

这份记录只证明插件组装和定向产物回归通过，不代表微信 IDE、HBuilderX 或真实设备全面验收。完整设备验收仍按本轮 preflight 门禁执行。插件数组顺序与钩子 order 共同决定 Rollup 的实际顺序，不能仅检查数组下标而忽略元数据。

## 规则评估

不新增 AGENTS 规则。用真实 Vite 产物回归和明确的组装阶段保护既有职责边界，避免再次依赖包装器丢失元数据形成的偶然顺序。
