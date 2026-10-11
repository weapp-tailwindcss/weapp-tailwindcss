---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1244
baseline: 2b9b50be2d76790140000891b80765c1fd6ab2b4
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-scoped-generator-sources.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-scoped-generator.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-plugin.bundle.unit.test.ts
---

# Vite 来源签名与产物归属的类型边界

## 症状

本地全面 workflow 的构建、单测和 lint 通过后，`pnpm typecheck` 在 CSS 生成签名链路报告 TS2345 与 TS2379。单测通过不代表严格类型检查通过；构建配置默认启用 `noCheck`，全面流程会另外关闭它进行检查。

## 根因与纠正

来源签名只需要 `rawSource` 与 `sourceFile`。多来源分支返回完整的 remembered source，单来源分支则返回当前源码的最小记录；消费方却给回调参数标注了要求 `outputFile` 的完整类型，导致联合数组的回调契约不成立。

此外，辅助层复制了一份候选签名函数类型，但没有保留实际实现允许显式 `undefined` 的参数约定，在 `exactOptionalPropertyTypes` 下产生了第二处错误。

修复明确来源签名的最小结构，复用实际函数的类型，并让 CSS 入口调用已有的多来源签名辅助函数。没有伪造产物路径、放宽类型检查或引入后置文件读取。回归覆盖无 remembered source、没有产物归属的来源，以及主入口标记为 true、false、undefined 时的签名语义。

## 验证

- 修复前：全面流程第 4 阶段稳定报告上述两处类型错误并停止。
- 修复后：`pnpm typecheck` 通过。
- 在修复提交 `172c25e33a15713dcc4c1128d65c1cbd99ab54c4` 上重新通过全端预检后，完整 workflow 的构建、6454 项单测（37 项既有跳过）、lint、typecheck、architecture、文档构建、规则、release status、diff 检查及矩阵断言均通过；随后在 static 基线比较停止，相关后续修复见 [CSS 快照层叠顺序复盘](css-snapshot-cascade.md)。
- `pnpm exec vitest run --project=weapp-tailwindcss packages/weapp-tailwindcss/test/bundlers/vite-scoped-generator-sources.unit.test.ts packages/weapp-tailwindcss/test/bundlers/vite-scoped-generator.unit.test.ts packages/weapp-tailwindcss/test/bundlers/vite-plugin.bundle.unit.test.ts --update=none`：223 项通过，无跳过。
- 改动源码的 ESLint 检查通过；测试目录被现有 lint 配置忽略，测试通过 Vitest 验证。
- `pnpm release status` 通过。此次修复统一内部类型与签名编排，未改变公开 API 或输出语义，不新增包版本 intent。

## 适用边界

这份记录证明类型错误已修复，不代表后续全端流程通过。完整验收需基于修改后的 checkout 重新预检。首次运行的 6450 项单测通过、37 项跳过属于修复前记录，不能充当修复后的全量验收。

当前会话已通过原生 Chrome 应用入口完成预检的读取、截图、输入与点击，服务端回执与 verify 均通过。专用浏览器接口的认证状态不应成为原生入口的先决条件；具体流程仍以多端手册为准。

## 规则评估

不新增规则。沿用已有来源边界、严格类型检查、持久回归和新鲜全端预检要求；原生 Chrome 入口已在本 PR 的根规则和多端手册中明确。
