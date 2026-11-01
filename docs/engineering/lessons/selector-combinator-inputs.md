---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: fa06fdd3b6ff32dd8116f49af07a6136cc14a8fd
regressions:
  - packages/postcss/test/selector-combinator.test.ts
  - packages/postcss/test/selectorParser.test.ts
  - packages/postcss/test/coverage-extra.test.ts
---

# 子代选择器替换的空输入边界

## 症状

严格类型检查发现 `composeIsPseudoAst` 直接读取数组首项，空数组可能得到 undefined。实际调用该 helper 也会生成 `undefined+undefined`，没有有意义的选择器替换语义。

## 根因与纠正

字符串、单项数组与多项数组都是有效输入，但 helper 没有为直接调用的空数组定义边界。现在先捕获首项，空数组明确抛出 RangeError，再进入原有单项或 `:is` 构造。没有添加默认替换值掩盖无效输入。

配置层 `getCombinatorSelectorAst` 原本只在数组非空时调用此 helper；空配置仍由配置层选择默认 view。配置缓存返回克隆，调用方修改一次返回结果不影响后续使用。内部 selectorParser 聚合导出可直接触达 helper，但当前包没有发布该聚合路径；不将内部修复声称为新增公开 API。

## 验证

在本任务独立依赖工作树、Node24.22.1/pnpm12.15.0、基线加本地改动下：

- 新回归先得到1项失败、4项对照通过，确认空数组原本不拒绝。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/selector-combinator.test.ts test/selectorParser.test.ts test/coverage-extra.test.ts --update=none`：3文件85项通过。覆盖直接空输入、字符串、单项、多项、空配置默认值及缓存克隆独立性。
- 两个修改的 TypeScript 文件显式 lint 通过。
- 原 `pnpm --filter @weapp-tailwindcss/scripts exec tsc --noEmit --pretty false` 从45降为44条诊断，整体仍失败；没有改变配置、源码范围或预算。

## 适用边界

这项回归证明内部 helper 的非法空输入会被拒绝。现有配置入口本来已隔离空数组，不能据此声称修复了正常配置的已观察 CSS 故障，也不能代替远端当前 head、原生事件、RSS 或全端验收。

## 规则评估

不新增 AGENTS 条目。已有根因回归和输入边界要求足够；默认配置应留在配置层，低层 helper 不应自行猜测替换值。
