---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: 9d10e3185d3657144752ae9fbd454e19d7a2b0b4
regressions:
  - packages/postcss/test/preset-env-contract.test.ts
  - packages/postcss/test/autoprefixer.test.ts
  - packages/postcss/test/handler-gradient-fallback.test.ts
  - packages/postcss/test/v4.test.ts
---

# preset-env 禁用 autoprefixer 的声明契约

## 症状

当前安装的 postcss-preset-env11.6.1 实际支持 `autoprefixer:false`，严格 TypeScript 检查却在两处正常禁用调用报告 false 不能赋给 Options。直接删除 false 或改为空对象会重新启用前缀生成，改变已有 CSS 行为。

## 根因与纠正

精确版本包的 README 明确说明 false 禁用，实际 index.mjs 也只在选项不是 false 时添加 autoprefixer；唯一发布声明 dist/index.d.ts 的 pluginOptions 却遗漏了 false。通过受管 pnpm patch/patch-commit，仅把该字段改为 `autoprefixer.Options | false`，没有修改运行时、改成任意 boolean 或在项目中强转。精确补丁登记与锁文件由 pnpm12.15.0 生成。

上游为 [postcss-preset-env](https://github.com/csstools/postcss-plugins/tree/main/plugin-packs/postcss-preset-env)，精确发布证据为 [11.6.1 README](https://unpkg.com/postcss-preset-env@11.6.1/README.md)、[11.6.1 声明](https://unpkg.com/postcss-preset-env@11.6.1/dist/index.d.ts) 与 [11.6.1 实现](https://unpkg.com/postcss-preset-env@11.6.1/dist/index.mjs)。本记录没有已提交的上游 Issue/PR 编号。

## 验证

在本任务独立依赖 worktree、Node24.22.1/pnpm12.15.0、基线加本地改动下：

- 修复前真实 tsc fixture 在 false 的变量和直接调用处准确报告2条 TS2559；真实插件默认开启、false 禁用、对象禁用的对照已经通过，证明是声明遗漏。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/preset-env-contract.test.ts test/autoprefixer.test.ts test/handler-gradient-fallback.test.ts test/v4.test.ts --update=none`：4文件55项通过。
- 新测试实际启动当前 worktree 的 tsc，使用 `packages/postcss/test/fixtures/preset-env-types/tsconfig.json` 和同目录 index.ts；fixture 显式 strict、noCheck:false、noEmit，独立于包内既有 noCheck 构建。false、合法对象及省略字段接受，true、错误字段值通过预期错误保持拒绝。skipLibCheck 只避免检查无关依赖声明体，不跳过 fixture 的调用赋值检查。
- 新的真实插件对照直接处理 `.x{display:flex}`，IE10 默认增加 -ms-flexbox；false 与 `{add:false}` 都保留原 CSS，没有经过平台清理隐藏差异。
- 原 `pnpm --filter @weapp-tailwindcss/scripts exec tsc --noEmit --pretty false` 从44降为42条，整体仍失败；原 flags、源码范围和 noCheck 未改。
- `pnpm install --frozen-lockfile` 通过。全部锁文件文档在移除这一个精确补丁身份后与修改前结构一致，未引入其他版本或 peer 图变化；安装的 index.mjs 大小与 SHA256 不变。

## 适用边界

补丁只覆盖11.6.1，旧10.6.1兼容链保持独立。它修复本仓库直接消费上游声明的严格契约，不改变已发布 PostCSS 包的运行时或为 npm 消费者安装补丁；不证明所有严格检查或当前 PR CI 已通过。

退出条件为上游正式版声明包含等价的 false 联合且保留实际禁用行为。届时升级、删除精确补丁和登记，用 pnpm 重新生成锁并重跑冻结安装、真实类型及插件对照回归；不能只因版本号变化就删除补丁。

## 规则评估

不新增 AGENTS 条目。已有精确版本、上游依据、回归与退出条件规则足够；不要用项目强转或删除有效选项掩盖上游声明遗漏。
