---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1217
baseline: 2fc66317e6783fa085e5f8e631568ee93b67a57e
regressions:
  - packages/weapp-tailwindcss/test/bundlers/author-function-boundaries.test.ts
  - packages/weapp-tailwindcss/test/bundlers/author-function-context.test.ts
  - packages/weapp-tailwindcss/test/bundlers/generator-author-functions.test.ts
  - packages/weapp-tailwindcss/test/ci/architecture-contract.test.ts
---

# 作者函数编译不能按样式长度或标记文本跳过

## 症状

主包会将超过 8192 字符、包含 `weapp-tailwindcss` 或 `tailwindcss v4` 文本的 CSS 判为无需编译 `--spacing()` / `--alpha()`。四个真实 Tailwind 编译上下文回归在修改前失败：大文件、工具名称字符串、版本字符串以及生成标记与未编译作者值混合时，均遗留 `padding:--spacing(3)`。

## 根因与纠正

生成标记和文件长度不能证明全部声明已完成编译。尤其工具名称可能只是 `content` 字符串。PostCSS 已经提供无函数字符串的快路径，并用 CSS AST 与 value parser 区分声明、条件、注释和字面量；主包额外的正则与长度判断没有必要。

移除主包预筛选，直接调用 `compileTailwindAuthorFunctions`。主包只保留 Tailwind 上下文选择、探针生成调用和上下文内的值缓存。不增加新的公开 API、解析器或全局缓存。

旧测试将带标记但仍有 `--spacing(1)` 的源码当作“已经生成”，改为真实生成形式 `calc(var(--spacing) * 1)`，并新增混合场景回归。这样验证的是编译状态，而不是延续错误跳过条件。

## 验证

- 新增用例修改前 4 失败、1 通过；修改后通过。追加大文件重复 `--alpha()` 回归，确认 500 条声明都编译且只调用一次 Tailwind，同一上下文后续相同值继续命中缓存。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/author-function-boundaries.test.ts test/bundlers/author-function-context.test.ts test/bundlers/generator-author-functions.test.ts test/bundlers/generator-css.unit.test.ts test/ci/architecture-contract.test.ts --update=none`：5 文件、189 项通过。
- 主包构建与改动 TS 的 `eslint --no-ignore` 通过。
- 持久 benchmark 覆盖 1000 条生成规则、字面函数字符串及已缓存的作者值；作者值先预热编译上下文，避免把初次 Tailwind 加载计入重复处理成本。
- macOS、Node 24.18.0：`CI=1 pnpm perf:guard --baseline-ref 2fc66317e6783fa085e5f8e631568ee93b67a57e --build-runs 3 --hmr-runs 3 --only demo-uni-app-vite-tailwindcss-v4__mp-weixin --result-dir .tmp/author-functions-vite-local` 通过。独立副本的构建中位数 3806.58 → 3827.71 ms（+0.56%），HMR P95 1751.16 → 1758.17 ms（+0.40%），构建插件 947 → 945 ms（-0.21%），构建峰值内存 1074.20 → 1083.70 MB（+0.88%）。只覆盖一个 demo、各 3 个样本，不推断全平台性能。

## 适用边界

本次保留 PostCSS 已有作者函数语法范围和错误处理。未验证设备效果，不把编译器单测当作全端验收。没有修改 demo 或 static fixture，未更新 static 基线。大文件含真实作者函数时，现在必须承担必要的解析与编译成本，不能拿之前错误跳过的耗时作为等价优化基线。

## 规则评估

不新增 AGENTS。沿用 CSS 语法归属 PostCSS、不能按文件大小跳过必要处理的规则，补充可执行回归并将编排模块加入架构契约。
