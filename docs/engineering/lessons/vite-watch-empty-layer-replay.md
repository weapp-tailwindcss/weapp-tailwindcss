---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1248
baseline: 5356d4ef02c88614e1cb6a437e621051b471eee5
regressions:
  - packages/postcss/test/vite-css-empty-ancestors.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-web-layer-order.test.ts
  - benchmark/performance/test/watch-lifecycle.test.mjs
---

# Vite watch 重放产生空 layer 外壳

## 症状

发布分支从 main 重新生成后，[PR Gate 单测分片 3](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/36396337977/job/108845822554) 在真实 Vite watcher 基准失败。连续修改候选、作者样式与主题，再恢复相同源码，CSS 偶发多出 Tailwind 注释、layer 顺序声明和空 `@layer base {}`，产物哈希不一致。本地同一测试和 30 轮采样均复现过失败。

## 根因与纠正

沿生成、缓存和产物注入追踪发现：主产物与来源缓存的规则相同，但来源追踪注释使它们仍进入合并流程。规则去重删除了嵌套 `@supports` 内的规则；`removeEmptyAtRules` 使用 PostCSS 的前序遍历，先检查非空的 `@layer`，随后才删除空 `@supports`，留下未再次检查的空父层。残留外壳无法通过完整节点包含检查，便被再次追加；watch 事件合并时序决定了是否走到这一状态。

在拥有 CSS AST 处理职责的 PostCSS 包中，收集 at-rule 后反向清理，保证子节点先于父节点删除。保留无块的 layer 顺序声明、有有效内容的分支和声明型 at-rule。没有改变 watcher 等待条件、哈希断言或性能阈值，也没有通过跳过缓存来源掩盖合并缺陷。

## 验证

- 修复前新增的两项 AST 回归和一项 Vite 注入回归稳定失败，产物与 CI 中的空外壳一致；修复后通过。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/vite-css-empty-ancestors.test.ts test/vite-css-rules.test.ts --update=none`：43 项通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-web-layer-order.test.ts test/bundlers/vite-processed-css-assets.unit.test.ts test/bundlers/vite-css-finalizer.unit.test.ts --update=none`：72 项通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-plugin.bundle.unit.test.ts test/bundlers/generator-css.unit.test.ts --update=none`：382 项通过。
- 已重新构建 `@weapp-tailwindcss/postcss` 和 `weapp-tailwindcss`，真实 watcher 消费当前 worktree 的构建产物。
- 对 Vite 项目执行 `CI=1 pnpm exec node benchmark/performance/scripts/watch-lifecycle.mjs --bundlers vite --sizes 3 --warmups 0 --runs 30 --update-static --output .tmp/pr-1248-watch-fixed.json`：30 轮恢复产物哈希一致。重新生成的 static 基线仅删除两行空 `@layer base {}`，有效样式和 layer 顺序不变。

## 适用边界

本次是嵌套空节点清理与 Vite 缓存重放的定向验证，不代表本地全端验收。发布分支 CI 必须在 main 修复落地、工作流重新生成后重新检查；上述旧 head 的失败链接仅用于记录来源。

## 规则评估

不新增规则。沿用现有的 CSS 处理所有权、稳定回归、static 基线和发布分支必须从 main 生成的约束。保留真实 watcher 的跨轮哈希验证，使事件时序差异继续作为缺陷信号。
