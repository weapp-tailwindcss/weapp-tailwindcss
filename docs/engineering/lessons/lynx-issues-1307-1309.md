---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1307
baseline: 89a1c7ddf5130baa94e01734ffb7888f2c492d14
regressions:
  - packages/postcss/test/web-css-compat.test.ts
  - packages/postcss/test/web-css-runtime-vars.test.ts
  - packages/postcss/test/lynx-css-compat.test.ts
  - packages/lynx/test/diagnostics.test.ts
  - packages/lynx/test/plugin.test.ts
verification:
  - claim: PostCSS 与 Lynx 单元回归覆盖动态变量安全分析和 encoder 诊断
    kind: unit
    status: passed
    sha: 245bf5dba44c7e69098cbd0e3a30816ec7116888
    environment: macOS arm64，Node 24.18.0、CI=1、禁止更新快照
    command: CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/web-css-compat.test.ts test/web-css-runtime-vars.test.ts test/lynx-css-compat.test.ts --update=none --coverage.enabled=false && CI=1 pnpm --filter @weapp-tailwindcss/lynx test -- --update=none --coverage.enabled=false
  - claim: Lynx 包、ReactLynx 示例和网站契约检查通过
    kind: integration
    status: passed
    sha: 245bf5dba44c7e69098cbd0e3a30816ec7116888
    environment: macOS arm64，Node 24.18.0、pnpm 12.11.2，串行构建
    command: pnpm --filter @weapp-tailwindcss/lynx build && pnpm --filter @weapp-tailwindcss/example-react-lynx build && pnpm --filter @weapp-tailwindcss/website run check:config-docs && pnpm --filter @weapp-tailwindcss/website run check:docs-i18n && pnpm e2e:lynx --update=none
  - claim: PR 当前 head 的 GitHub Actions 仍待创建并逐轮复核
    kind: ci
    status: pending
    sha: 245bf5dba44c7e69098cbd0e3a30816ec7116888
    environment: GitHub Actions，PR 创建后以准确 head SHA 追踪
    reason: PR 尚未创建，暂无当前 head 的 run ID、job 和 required checks 证据
  - claim: Android/iOS 原生验收等待本轮完整环境预检
    kind: native
    status: pending
    sha: 245bf5dba44c7e69098cbd0e3a30816ec7116888
    environment: 本机多端预检与受管 Android/iOS runner
    reason: 尚未执行 pnpm e2e:preflight prepare；历史 baseline 只作为文档事实
---

# Lynx 动态变量与构建诊断交付复盘

## 症状

Lynx 兼容链路同时暴露出两个边界。Web CSS 兼容层在解析颜色自定义属性时，无法区分可以在构建期固定的稳定主题 token 与仍受层叠关系影响的应用变量。局部规则、条件规则、重复定义、`!important`、别名和 fallback 都可能改变 `var()` 的最终值；过早替换会把运行时覆盖变成错误的静态颜色。

ReactLynx/Rspeedy 的另一个缺口是 encoder 拒绝信息只存在于构建日志。日志没有稳定地关联到生成 CSS 的模块、selector、property、utility 或来源位置，因而无法判断被删除的声明属于 preflight、Tailwind 默认规则还是业务规则，也无法为严格构建提供可审计的失败条件。

文档还把适配器、核心依赖链、Rspeedy/ReactLynx/Tailwind 版本和设备证据混在一起描述，动态变量静态化范围、CI runner 与已提交原生报告设备之间的边界不清楚，版本和设备升级后容易漂移。

## 根因与纠正

1307 在 `@weapp-tailwindcss/postcss` 的 Web CSS 兼容阶段加入级联安全分析。只有唯一、顶层、无条件、无 `!important` 的 `:root` 或 `:host` 声明，且其值可以沿安全别名链完整解析时，才允许静态化；存在局部或条件覆盖、重复声明、优先级竞争、fallback、循环或动态依赖时，保留使用处的 `var()`。颜色定义本身仍可降级为 Lynx 可接受的兼容颜色，稳定 Tailwind theme token 的构建期静态化行为保持不变。

1308 在 `@weapp-tailwindcss/lynx` 增加构建生命周期内的结构化诊断。CSS 生成阶段登记模块、selector、property、value、utility/class 和来源位置，模板插件的编码收尾 hook 解析 encoder 记录并按 `generated`、`encoder-rejected`、`unknown` 分类，同时区分 preflight、Tailwind 默认规则和业务规则。`pluginLynxTailwindcss({ diagnostics: { strict, ignore, onReport } })` 默认只输出 warning/报告；`strict: true` 只让未忽略且确证被 encoder 删除的业务规则写入 compilation error。未知日志格式或 `unknown` 诊断永远不会在严格模式下自动失败，诊断也不扫描 `dist` 或把 bundle 进入等同于原生支持。

1309 同步 packages/lynx 双语 README、网站 quick-start 与 ReactLynx 配置参考，并把 package metadata、baseline、workflow 与文档事实纳入定向一致性检查。文档分别说明适配器 Node 最低要求与核心依赖链 Node 要求，记录当前 package、Rspeedy、ReactLynx、Tailwind 和 Lynx Engine 版本，区分 CI runner、已提交原生报告（含 `verifiedAt`/`catalogHash`）与 capture-only 设备，并明确同一 CSS 中可见覆盖与跨文件/inline 覆盖的静态分析边界。

## 验证

- **Unit：已通过。** PostCSS 的 Web/Lynx 兼容回归覆盖 `:root`/`:host`、组合 selector、局部/条件覆盖、别名/fallback、`!important`、重复定义、幂等处理和三组颜色组合链；Lynx 包覆盖 encoder property/selector 日志解析、未知格式、去重、来源分类、默认 warning、strict、ignore、unknown 不失败及插件 hook。已通过 `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/web-css-compat.test.ts test/web-css-runtime-vars.test.ts test/lynx-css-compat.test.ts --update=none` 与 `pnpm --filter @weapp-tailwindcss/lynx test -- --update=none --coverage.enabled=false`。
- **Integration：已通过。** Lynx 包构建、ReactLynx 示例构建、网站配置/文档一致性检查和 `pnpm e2e:lynx --update=none` 均在本 worktree 串行完成；Lynx 静态 gate 为 11 个文件、194 项通过，未产生 static evidence 改动。
- **CI：待完成。** PR 创建后以当前 head 记录 GitHub Actions run ID、失败 job 和提交 SHA；旧 head 的结果不能替代新 head 验证，只重跑确认需要重试的 job。
- **Native：待完成。** 本轮应先执行 `pnpm e2e:preflight prepare`；Android/iOS 仅在完整预检通过时运行。历史 baseline 的设备和 `verifiedAt` 只作为文档事实，不能作为本轮原生验收证据。

## 适用边界

该修复验证的是构建期 CSS 解析、Tailwind 生成与 Lynx encoder 诊断契约，不宣称 Lynx runtime 对所有 CSS 变量或 encoder 拒绝项提供原生支持。跨文件 stylesheet 与 inline style 的覆盖关系不在当前静态分析保证范围内。`strict` 只处理能够可靠关联到业务 CSS 且确认被 encoder 删除的声明；无法解析的日志和 `unknown` 诊断保留为报告，不因严格模式失败。未完成本轮预检前，不得把历史 Android/iOS 报告写成本轮 native 通过。

## 规则评估

不新增 AGENTS 规则。级联安全边界由 PostCSS 回归约束，诊断分类、strict 失败条件和未知日志处理由 Lynx 单测与插件 hook 回归约束，版本与设备事实由文档一致性检查约束；继续遵守本仓库的 worktree、中文 intent、static evidence 和新 head CI 证据要求。
