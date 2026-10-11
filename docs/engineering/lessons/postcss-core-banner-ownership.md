---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1217
baseline: 287239cd7f65cd569b02853536066f1268ed7473
regressions:
  - packages/postcss/test/tailwind-banner-comments.test.ts
  - packages/weapp-tailwindcss/test/compiler/core-compiler-banner.test.ts
  - packages/weapp-tailwindcss/test/ci/architecture-contract.test.ts
---

# Core 注释清理的样式归属补漏

## 症状

#1217 合并后重新审计，发现主包 `core/compiler/transforms.ts` 仍通过 `walkComments` 删除 Tailwind banner。此前架构契约既未列入该入口，也没有检查注释遍历，因此样式转换归属审计遗漏了这条链路。

## 根因与纠正

将原有匹配规则和 AST 删除操作迁入 PostCSS 的 `stripTailwindBannerComments`，与既有 banner 工具放在同一模块，从稳定入口导出。主包只负责目标平台和 `finalize` 开关判断，继续复用当前 Root 或 Document，不增加解析、克隆或跨调用缓存。没有将 AST 清理改为字符串替换，声明中的 banner 字面量与其他版权注释保持原样。

架构契约纳入公开 core 入口，并在全部已列入的迁移文件中检查 `walkComments`，防止同类逻辑回流。

## 验证

- 先运行新增架构断言，迁移前为 1 失败、6 个过滤跳过，失败点是主包中的 `walkComments`。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/architecture-contract.test.ts test/compiler/core-compiler-banner.test.ts test/compiler/core-compiler.test.ts --update=none`：3 文件、23 项通过。覆盖 weapp 默认与显式 finalize、关闭 finalize、Web/Tailwind 显式 finalize、字符串与 Root API、输入 AST 隔离。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/tailwind-banner-comments.test.ts test/style-transform-ownership.test.ts test/tailwind-v4-user-css.test.ts --update=none`：3 文件、13 项通过。覆盖嵌套注释、大小写、Document、多次调用、空 Root、无关注释和声明节点身份。
- `CI=1 pnpm --filter weapp-tailwindcss... build`：主包、PostCSS 及其工作区依赖构建通过，保留既有 CJS/mixed exports 提示。
- `pnpm release status`：两包中文 patch intent 被正确识别。
- 构建产物的 ESM/CJS 稳定入口均可调用新导出并正确清理 banner；改动的六个 TypeScript 文件以 `eslint --no-ignore` 检查通过，`pnpm agents:check` 为 0 errors，`git diff --check` 通过。

## 适用边界

本次没有改变 demo、IDE 用例或 CSS 输出预期，测试使用内存输入，不涉及项目 static 基线。它补齐 core 注释转换的归属，不代表整个重构的本地多端验收完成。完整验收仍见[样式转换迁移记录](postcss-style-ownership.md)，本轮按同机串行协调要求没有启动新 E2E。

## 规则评估

不新增 AGENTS 规则。现有样式归属要求已覆盖该问题，本次补充可执行契约与针对性回归。
