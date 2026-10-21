---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 269585f809bd424aaa7bb8164a603fb17c296ef4
regressions:
  - packages/postcss/test/handler-cache-preparation.test.ts
  - packages/postcss/test/css-source-trace-cache.test.ts
  - packages/postcss/test/root-cache.test.ts
---

# CSS 热更新的缓存与来源边界

## 症状

PR #1314 的性能工件把 Taro Vite React 热更新退化定位到 CSS task：中位数从 1724.518ms 增至 2337.642ms，解释 generateBundle 623ms 增量中的 613.124ms。工件未记录底层解析次数，不能据此断言某一个函数是完整根因。

## 根因与纠正

样式结果缓存原先在颜色权重分析、变量保护及特征探测后查询。相同文本连续处理四次，保护函数也执行四次。现在先核对完整原始文本和配置，命中直接返回；短内容 hash 只作索引，不作为等价证明。文本与 Root、原始与作者插件完成后的输入分别建键，配置和静态变量映射的原位变化仍使缓存失效。

来源追踪原先每条规则都重新解析选择器。100 条相同选择器规则会解析 100 次，另一个资产和热更新继续重复。现在只缓存精确完整选择器的不可变类名记录，不缓存 AST、路径或来源对象。每次查询当前来源 Map，支持同一 Map 和数组的原位修改及删除；属性字符串不能被误认成 class。LRU 同时限制 4096 个条目和 1048576 个字符，超长结果不驻留，完整解析失败不提供部分归属。

### 来源合同

等价 Root 命中仍需匹配完整来源、位置、source map 和扩展字段，克隆输出并绑定本轮 Input。静态颜色预处理重新解析的合成 Input 无法安全绑定到原快照，因此不保存该 Root 结果。警告消息可能引用已删除节点；在可靠重绑实现之前，带消息的 Root 结果也不缓存。两种旧 Input 复用均有先失败的回归。

外部作者插件保持逐轮执行，不为不可缓存的阶段深度计算无用配置指纹。确定性的内置平台阶段在作者阶段完成后单独判断缓存。

## 验证

以 269585f809bd424aaa7bb8164a603fb17c296ef4 为基线的工作树中，`pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none` 为 156 文件、1830 项通过，3 项既有跳过；PostCSS 构建通过。主包 PostCSS、生成、Vite 消费及增量兼容定向回归为 17 文件、137 项通过。定向回归约束解析次数、配置和来源失效、无效选择器、容量淘汰及作者插件副作用。先失败记录包括相同选择器解析 100 次、缓存命中反复准备、静态颜色的旧 Input 和警告的旧节点来源。

## 适用边界

上述结果只能证明缓存边界和输出合同；固定配置的三轮构建与三轮 HMR 对照仍须另行验证，不能把减少解析次数写成性能门禁已经恢复，也不能改变原有 5% 阈值。

## 规则评估

不新增规则。已有完整输入身份、来源证据与性能门禁规则足够约束本次修复；解析缓存留在 PostCSS 所有者包，不进入主包或构建器适配层。
