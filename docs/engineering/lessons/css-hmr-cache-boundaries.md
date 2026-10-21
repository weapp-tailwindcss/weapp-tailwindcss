---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 269585f809bd424aaa7bb8164a603fb17c296ef4
regressions:
  - packages/postcss/test/handler-cache-preparation.test.ts
  - packages/postcss/test/css-source-trace-cache.test.ts
  - packages/postcss/test/root-cache.test.ts
  - packages/postcss/test/custom-property-function-analysis.test.ts
  - packages/postcss/test/modern-color-function-analysis.test.ts
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

### 静态变量的函数分析

198014fb5 的固定三轮对照仍失败：Taro build plugin 中位 2389→2525ms（+5.693%），三个样本均增加，5% 门槛保持不变。CSS task 中位增加 56.756ms，候选准备墙钟增加 77ms。各执行一次的 base/current CPU 采样显示颜色清理和稳定变量分析在 normalize、prune、finalize 多条调用链中消耗时间；它不能证明同一 AST 被重复处理，也未解释候选准备的墙钟增量。

计数回归进一步复现：128 个不含变量的 `oklch()` 主题值触发 256 次 value-parser 调用及逐值 token 检查。函数分析现在先排除不可能含目标函数的无转义拼写；无变量依赖的稳定值保留原文，不再构造替换用 AST。潜在命中、大小写、转义函数及嵌套 fallback 仍完整解析；CSS-wide 关键字的注释和转义身份也继续参与资格否决。没有缓存可变 AST 或扩大静态化资格。

## 验证

以 269585f809bd424aaa7bb8164a603fb17c296ef4 为基线的工作树中，`pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none` 为 156 文件、1830 项通过，3 项既有跳过；PostCSS 构建通过。主包 PostCSS、生成、Vite 消费及增量兼容定向回归为 17 文件、137 项通过。定向回归约束解析次数、配置和来源失效、无效选择器、容量淘汰及作者插件副作用。先失败记录包括相同选择器解析 100 次、缓存命中反复准备、静态颜色的旧 Input 和警告的旧节点来源。

函数分析改动以同一命令验证为 157 文件、1842 项通过、3 项既有跳过；新增12项覆盖无关函数的零解析、完整主题、大小写和转义引用、嵌套依赖、attr 与 CSS-wide 关键字边界。首次新增回归中两项正确失败，修复后通过。计数减少仍不能代替新的固定性能对照。

源码 `2d73a95eb890375725ca113687eb575f93b09bf5` 对照固定基线 `7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5`，使用 `pnpm perf:guard --baseline-ref <基线> --build-runs 3 --hmr-runs 3 --timeout 180000 --poll-interval 30` 并定向 Mpx、Taro Vite React、weapp-vite 微信三项目，原5%阻断门禁通过，零违规。Taro build plugin 中位 2406→2515ms（+4.53%），构建总耗时中位 +0.048%；HMR plugin 中位 746→741ms、CSS task 中位 606.049→597.697ms。本轮没有重现旧 HMR CSS 增量，但构建期 CSS 仍增加45.565ms、候选准备墙钟仍增加61ms，不能宣布零成本或全部历史根因消除。Mpx 首轮 HMR RSS peak/steady 同步增加，门禁内置反向 current→baseline 核验未复现，作为两项观察保留，不改判为已查明宿主噪声。完整原始样本、反向核验、源码/锁文件身份及官方报告留在 `.tmp/perf-2d73a95/`，198失败留在 `.tmp/perf-198014/`；不以本轮成功覆写旧失败。

### bc4 当前 CI 的反例与后续分析

`bc4f4c546656a7e52f170433d7647cdb82227b23` 的 CI run `39564594524` 对照固定 `7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5` 仍失败：Mpx build plugin 中位 914→976ms（+6.7834%），RSS peak 1087.445→1224.375MiB（+12.5919%）、steady 1015.004→1162.109MiB（+14.4931%）；Taro Vite HMR plugin 稳态 P95 1751→1869ms（+6.7390%）。这否定了用此前本地通过替代当前 CI 的做法；原始失败和 5% 门槛保留，没有重跑该 head。

原工件保留在 `.tmp/ci-bc4-performance/`，Mpx ZIP SHA256 为 `ec6bed37170efe412f3a6b7d8aba84df96aa3d23b5286db152265dd1af232b49`，Taro Vite 为 `b8447ceff7b447e131ba9e75f9c012680d568a84339ef48160ae06f07ea59370`。GC 时序显示 current 后两次采样前没有与 base 同时点的后期 major GC，不能由 RSS 直接断言长驻泄漏，也不能据此抹掉门禁失败。

新的计数红例复现普通声明 15 次 value-parser 分配、嵌套普通函数逐节点重新 stringify/parse。改动只在无转义且明确不含已登记现代颜色函数时跳过解析；函数分类复用已有 FunctionNode。审查又以 `rgb(1 2 3 / var(--alpha, oklch(.6 .2 240)))` 固化一个新反例：转换器会保留动态 alpha 子树，替换后仅检查原 AST 会漏掉现代 fallback。最终仅未修改的输入复用原 AST，转换输出继续按真实字符串重验；没有把替换 word 当作已证明安全的颜色。

包含未提交优化的辅助工作树以 `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run --maxWorkers=1 --update=none` 验证为 158 文件、1859 项通过、3 项既有跳过；新计数红例、嵌套 alpha 红例及111项定向颜色回归分别保留在 `.tmp/modern-color-function-analysis-red.log`、`.tmp/modern-color-alpha-recheck-red.log`、`.tmp/modern-color-function-analysis-final.log`。该项仍需新的固定性能对照和准确 head CI，不能提前宣布性能失败已经修复。

同一工作树的 PostCSS 构建通过；主包 PostCSS、生成及 Vite 消费定向回归为6文件63项通过。ESLint、`pnpm agents:check`、`git diff --check` 和 `pnpm release status` 通过。后者确认已有中文 intent 覆盖 PostCSS 及依赖消费者，没有发布版本。

## 适用边界

上述结果只能证明缓存边界和输出合同；固定配置的三轮构建与三轮 HMR 对照仍须另行验证，不能把减少解析次数写成性能门禁已经恢复，也不能改变原有 5% 阈值。

## 规则评估

不新增规则。已有完整输入身份、来源证据与性能门禁规则足够约束本次修复；解析缓存留在 PostCSS 所有者包，不进入主包或构建器适配层。
