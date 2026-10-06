---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 62d46fc5a001ad4d5e81b23c87457911ba5db920
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-bundle-markup-query-reuse.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-bundle-markup-candidates.unit.test.ts
---

# Vite 模板候选查询的本轮复用

## 症状

一次真实 HBuilderX 微信增量编译的诊断样本中，`getCombinedSourceCandidatesForEntries` 出现 75 个采样点，按采样间隔加权约 102.583ms；其来源匹配链有 72 个采样点，最大间隔 4.5ms。这是重复工作线索，不是函数实际 CPU 时间，也不能用该数字断定 500ms 门禁的根因。

随后用仓库两份真实 WXML fixture 提取候选，连续执行两个内容相同、对象不同的范围查询。修复前候选输出一致，但真实 matcher 被调用 4 次，第二次仍重复首轮的 2 次来源匹配。持久回归在原代码上以 `expected 2 calls, got 4` 失败。

## 根因与纠正

主来源候选 store 已有按版本与查询键复用的视图。Vite 产物中的模板候选补充集合没有对应复用：每个范围查询都重新遍历所有输出，并对来源文件和范围目录解析真实路径。

生命周期边界在 `collectBundleMarkupCandidates`。提取完成后深复制本轮查询数据，复用现有最多保留 64 项的候选视图 memo；每次查询返回新的 Set。提取器返回的 Set、本轮查询快照、交给下一轮的可变 Map 各自拥有候选数据，避免修改一处令命中和未命中的查询看到不同内容。下一轮创建新的 collection 和 memo，不跨构建缓存路径匹配结果。

未改变 CSS 生成或来源匹配规则，也没有新增全局真实路径缓存。

## 验证

定向回归覆盖真实 fixture 的等价查询复用、正向与否定范围、显式空范围、排除范围修改、Set 和持久状态修改隔离、提取器保留的引用、下一轮候选删除和替换、删除文件的父目录身份、符号链接改向，以及 POSIX、根目录、Windows 盘符、UNC 和相对路径。

验证命令与结果：

- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-bundle-markup-query-reuse.test.ts test/bundlers/vite-bundle-markup-candidates.unit.test.ts test/bundlers/vite-empty-source-scope.unit.test.ts test/bundlers/vite-source-candidates.unit.test.ts test/tailwindcss/source-scan-contract.test.ts test/tailwindcss/source-scan-path-identity.test.ts test/bundlers/vite-plugin.bundle.unit.test.ts --update=none`：7 个文件、280 项通过，无失败或跳过。
- `CI=1 pnpm --filter @weapp-tailwindcss/engine --filter @weapp-tailwindcss/postcss build`：更新该 worktree 的依赖产物后通过。
- `CI=1 pnpm --filter weapp-tailwindcss build`、`CI=1 pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false`：ESM/CJS/声明构建与严格源码类型检查通过。重建依赖前的类型检查因陈旧声明报 10 项缺失导出或参数错误，未通过修改源码规避。
- `CI=1 pnpm exec eslint --no-ignore packages/weapp-tailwindcss/src/bundlers/vite/generate-bundle/bundle-markup-candidates.ts packages/weapp-tailwindcss/test/bundlers/vite-bundle-markup-query-reuse.test.ts`：通过。
- `CI=1 pnpm architecture:check`、`CI=1 pnpm agents:check`、`CI=1 pnpm release status`：通过，change intent 纳入主包 patch。

有界微基准使用仓库 `test/fixtures/wxml` 中的 14 个真实模板及真实候选提取结果，比较修复前查询循环与修复后的集合查询；每份样本执行 120 次查询，三种范围依次循环，包括全部文件、`mpx*` 和排除 `mpx*`。预热 2 轮、采样 5 轮，交替两种实现的测量顺序，每个结果均在计时外做 Set 全量等价断言。原循环样本为 94.408、97.224、84.028、94.380、85.108ms；复用后为 2.089、2.284、2.765、2.778、2.597ms，中位数分别为 94.380 与 2.597ms。

该微基准只测已有候选集合的重复查询，不包含候选采集、构建、IDE 或设备流程，不证明真实 HMR 已低于 500ms。真实流程仍需新一轮预检、相同验收门槛和实际执行证据。

这里的基线 SHA 表示缺陷复现所用代码。全任务的性能比较基线仍固定为 `4488cabc9`；此处未运行 `perf:guard`，也不以局部微基准替代固定基线的性能验收。

## 适用边界

查询视图只属于一个已经提取完成的 bundle 集合。跨轮状态可以继续删除或替换输出；这些修改在下一次 collection 创建后生效。同轮已经返回的查询 Set 不与缓存共享。文件系统和符号链接的后续变化在新一轮重新匹配，不将旧轮结果当作新轮身份。

只调整内部查询过程，未修改 demo、样式输出或 static 基线。

## 规则评估

不新增规则。现有生命周期、可变状态隔离、跨平台路径和性能证据要求已经覆盖问题；本次补持久回归落实边界。
