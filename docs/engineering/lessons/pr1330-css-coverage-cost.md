---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1330
baseline: 1d9d9f06a0590589ddf4540dae9461862313ca70
regressions:
  - packages/postcss/test/scoped-css-signature-storage.test.ts
  - packages/postcss/test/scoped-css-string-coverage.test.ts
  - packages/postcss/test/scoped-css-signature-lifecycle.test.ts
  - packages/postcss/test/scoped-css-demand-coverage.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-root-coverage-reuse.test.ts
---

# PR #1330 的 CSS 覆盖签名分配

## 症状

提交 `1d9d9f06a0590589ddf4540dae9461862313ca70` 的 [Uni 正式性能检查](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41796391305/job/126462551974)中，三轮 HMR 的峰值 RSS 中位数为 1162.43→1269.45MB，稳态为 1056.91→1151.46MB。内置反向确认仍超出原有 5% 与 64MB 门槛：峰值 1088.30→1168.78MB，稳态 980.39→1056.80MB。`finalize.rootCss` 各轮也持续多耗时数毫秒，需要定位处理成本，不能反复重跑直到通过。

## 根因与纠正

本地对真实 Uni CSS 的 CPU、分配与保留对象采样发现两项可重现成本：值签名保留完整 token 元组及长类型名；根覆盖索引建成后丢弃解析上下文，各组件又重新 tokenize 根中已经出现的值。coverage 对象数量相同只能排除显式条目增长，不能排除这些临时分配。

修复将值签名改为流式读取 token，以类型码和 UTF-16 长度前缀保存身份。字符串仍使用 CSS 解码值，空白 token 仍归一为单空格，其它 token 保留原文；有效与无效输入单独标记。规则、声明、优先级、祖先与节点结构继续使用原比较语义。

根覆盖索引通过私有 WeakMap 保留根值上下文。每个目标取得独立子上下文，只读查根值；未知值只进入自己的 Map，不反写根缓存。因此调用方长期复用 `preparedCoverage` 时，目标新值不会持续累积。容器和祖先按当前 AST 实时计算，禁止缓存清理前的子树。

尝试过的多层声明缓存、规则 tuple 编码与完整递归字符串编码没有稳定降低保留内存，未采用。

`95383ff6dacfca22dd11f30740e275bb2e765cc9` 的[正式基准](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41849289741)仍有两项失败。Taro Vite 构建峰值 RSS 中位数为 1610.30→1735.32MB，增加 125.03MB、7.76%；稳态 RSS 下降 0.63%，不能把峰值结论外推到整轮内存。Taro Webpack 的 HMR plugin 稳态门禁为 1521→1623ms，增加 102ms、6.71%。原有 5%、64MB、10ms 和多数样本门槛保持不变。

针对 Vite 再测发现，整条规则去重也会提前建立声明集合、声明顺序、属性值及条件索引，消费者却只读取规则签名。调整为由调用方明确选择 `exactOnly`：先建立整条规则签名，需要部分覆盖证明时，再用采集时保存的不可变源码补齐一次。普通采集仍立即建立完整索引；新模式不保留 AST，补齐后释放源码数组快照。Vite 同批次先遇到普通样式再遇到 scoped 样式时也能补齐，不因资产顺序漏掉覆盖证明。

此优化不经过 Webpack 的 HMR 调用路径。独立依赖、固定源码的本地三轮 Webpack 对照未复现正式失败：稳态 plugin 807→801ms，原门禁通过。但该诊断使用的 Node 22.22.3 低于根 engines 要求，不能作为受支持工具链的验收。demo、适配器、引擎、锁文件和基准入口的 Git 对象均相同；目前仍须核对正式执行波动，不能证明 CI 失败只是噪声。对照的 current 第二轮构建与一次约 551ms 的定向单测重叠，HMR 采样无重叠，因此也不以该构建耗时作因果结论。

## 验证

- macOS、Node 24.22.1，真实 8 份 Uni static CSS，总约 53KB。50 次相同流程的 heap sampling 中，原实现累计采样分配 670.9MB，紧凑值加只读根缓存为 435.9MB；中位耗时 6.40→3.79ms。另一个 29KB CSS 的 30 份覆盖索引保留对象测量为 18.01→13.61MB。两者是局部实验，不能直接换算进程 RSS。
- 1444 对值身份关系和真实 CSS 覆盖判断与旧实现一致。新增长 token 存储回归在旧实现得到 92180 字符，超出 32768 字符预算；修复后通过。新回归还验证根命中不重新 tokenize、目标独有值不回流、复制索引的兼容回退、祖先改名及节点重挂。
- 包级命令 `pnpm --filter @weapp-tailwindcss/postcss test --update=none --coverage.enabled=false` 在包含本次未提交修复的 worktree 通过 2190 项，3 项既有条件跳过；未执行本地全端设备验收。构建和当前新 head 的远端验收另外核对。
- [自然 GC 诊断](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41800195636)保持原预算。正向 RSS 上升，反向峰值差异变为 -0.38%，轮末 heap 大小也反转；两轮 current 均多约 34–36 次 minor GC。这说明相位会影响观察结果，也支持存在分配压力，但没有调用栈证据将全部 RSS 差异归因于覆盖签名。诊断通过不替代正式失败。
- 首次诊断 dispatch 错带仅供 weapp-vite input-only 使用的 `current_ref`，在 matrix 输入验证失败，未执行 Uni；修正后才得到上述诊断。配置失败记录保留于 [原 run](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41799786635)。
- 以 `95383ff6dacfca22dd11f30740e275bb2e765cc9` 加本次未提交改动为候选，在 macOS、Node 24.22.1 上对真实 Taro Vite static CSS（根 409353B，目标 2706B / 6236B）做 3 次预热、9 次交替采样，显式 GC 后的索引保留堆中位数为 6350112→1316616B，采集耗时为 40.59→22.94ms。三种模式（旧完整、候选默认完整、候选按需）的目标清理输出哈希一致；源码在测量前后及采样期间指纹一致。该实验只证明索引局部成本下降，不能换算整构建 RSS，也不解释 Webpack 的 HMR 失败。
- 新增按需索引回归覆盖一次补齐、外部数组改写、复制兼容，以及声明顺序、优先级、条件和字符串解码。临时强制恢复立即建全索引后，10 项中的 2 项延后分配断言失败；还原候选后通过。Vite 集成覆盖两种资产顺序，确认普通资产只用规则索引，首次 scoped 资产补齐一次，后续不再解析根样式。
- 本轮 PostCSS 全包通过 2200 项，3 项既有条件跳过；Vite 受影响子集通过 7 文件、86 项。PostCSS 构建及架构边界检查通过。真实框架验证见下一项，新 head 正式基准仍待验证，不能用局部实验代替。
- 固定候选 `5b1fb9fa19f2f9528a97a91f1d49af1497ce728b` 对 main `20958acde2e7e4373e8fc5f5532ca15826e50013` 的真实 Taro Vite 微信目标三轮构建、三轮 HMR，在 macOS、Node 24.22.1 上通过原 guard，errors、observations 和 violations 均为 0。两版独立 frozen install、36 包强制重建、0 缓存；最初低于 engines 的 Node 22 准备及其 Turbo 缓存未进入计时。构建中位 11490.51→11202.48ms，峰值 RSS 1975.83→1911.86MB；HMR plugin 稳态 711→707ms，HMR 峰值/稳态 RSS 分别增加 3.29%/3.27%，没有超出原门槛。rootCss 构建三轮从 64.69/61.30/64.80ms 降到 54.26/51.32/56.23ms。最终 40 份 CSS、WXML、JS 等产物无需归一化即逐字节相同，无残留 benchmark marker；测量前后 50/51 个源码 blob 分别匹配固定 base/current。该结果不包含后续类型与 runner 调整，也不代替 Linux、Node 22.23.4 正式 CI。

## Weapp Vite 的正反失败与后续有限复验

`71cc3f1b14888a2a317b7ace3e86a127c3b95060` 的[正式 Weapp Vite 检查](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41894194687/job/126799786161)再次失败。正向峰值/稳态 RSS 为 941.19→1037.15MB、882.13→996.10MB，反向为 909.94→1079.69MB、902.14→1079.69MB；原门槛真实命中。Mpx 的[同轮检查](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41894194687/job/126799785943)仅 buildPluginMedian 超限，931→1022ms、增加 9.77%，不把它归于没有时间锚点支持的 GC。

本地使用准确 main `20958acde2e7e4373e8fc5f5532ca15826e50013` 与 `71cc3f1b1` 的独立 frozen install、36 包强制构建，在 macOS、显式 Node 24.22.1 下运行原 `pnpm bench:ci -- --guard` 单项目三轮构建和三轮 HMR，正反内存均失败。峰值分别增加 166.59MB、96.58MB，稳态分别增加 143.89MB、87.86MB。没有先以重跑覆盖这组失败。

静态身份核验未发现复制污染：base/current 的相关源码、配置和锁文件分别逐个匹配对应 Git blob，生产变化仍限于既有七个文件。Weapp Vite 内置集成实际走 core/generator，主包这两个入口及八个递归相对模块在两版逐字节相同。PostCSS 共享 transform 的 24 条 import 也相同，tokenizer 没有新增或加载第二份；新增顶层 Map 只有 27 项。无 GC 的入口计数探针确认变更的四个 scoped coverage 函数在三轮 HMR 中均为零调用，不能把内存差直接归为这些函数运行时分配。

进一步的诊断分别保留 A/A、整包 PostCSS dist 消融及模块加载/自然 memoryUsage 数值。A/A 的两个全新 watcher 使用同一个 base 根目录，峰值差约 15.31MB；消融及原包在插桩条件下都没有持续差异。加载观察会同步读盘、hash 和写日志，可能改变时序，不能替代正式预算，也不能证明首次失败只是噪声；磁盘 SHA 记录也不等于其它 loader 处理后的执行字节。所有临时 dist 修改均在 finally 逐字节恢复并校验。

定位后仅做一次无插桩有限复验：复用已核对且隔离的 prepared 根目录及依赖，准确源码仍为 `20958→71cc`，不重建或借用依赖。使用原 run-matrix 的三轮构建、三轮 HMR，以及原 assertBenchmarkMatrixRows、buildSummary、evaluatePerformanceGuard 和条件反序确认逻辑，未设置 NODE_OPTIONS、inspector 或请求 GC，全部 errors/violations 为零。峰值 946.11→956.86MB，增加 10.75MB；稳态 943.20→956.17MB，增加 12.97MB，未触发反序确认。该结果只表示这次 macOS / Node 24.22.1 复验未再现差异；首次 Linux / Node 22.23.4 的正反失败成因仍未证明。iOS 修复的新 head 必须独立通过原正式 Benchmark，不能以本地通过替换旧失败，也未修改性能阈值或加入未经证明的生产补丁。

## Uni 混合资产批次的重复根解析

`19deb9de09fcd6b19cc0ca397bb5fe42f4d557c7` 的[正式 Benchmark](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41905362530)只剩 Uni 与汇总失败；正向峰值/稳态 RSS 约增加 98/94MB，内置反向仍增加约 105/91MB。第三轮主 Node 的差异主要在 heapUsed/heapTotal，external 与 ArrayBuffer 仅约增加 1MB。首次失败保留，不以其它分片通过或诊断结果替代。

同 SHA 的[自然 GC 诊断](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41911610751)首次仍增加约 174–177MB，反向 current 多两次 major GC 后方向翻转，未被反序确认。它说明相位影响观察，但不能证明正式回归只有 GC 原因。此前一次 allocation 诊断被已有的隐式强制 GC 校验拒绝，未产生采样，不能作为证据。

无 inspector、无强制 GC 的真实 Uni 入口计数发现，七个 `exactOnly` 索引最终全部需要完整覆盖证明，current 根解析十八次，而 base 十一次。先普通、后 scoped 的批次重复解析根，原 exact 加 upgrade 的局部分配约 4.4MB，直接 full 约 3.3MB；这几 MB 不能解释全部正式 RSS 差异。进口清理的九十四次调用来源均为空，未据此引入其它缓存补丁。

修复在同一 bundle 批次预先核对实际可消费的 scoped 资产，存在时直接建完整根索引；纯普通资产保留 exact 模式。主循环仍重新读取当前 source，回调修改目标或根来源后正常失效、重建或延迟补齐。混合两种顺序的一次解析断言先在旧实现失败，并覆盖被排除的 scoped 资产及回调改变后续资产。

macOS、Node 22.23.4、准确 main `20958acde2e7e4373e8fc5f5532ca15826e50013` 与候选隔离副本，以原三轮构建、三轮 HMR 和 guard 验证通过：构建中位 4075.53→4123.10ms，HMR plugin 稳态 85→91ms，峰值 1235.86→1183.91MB，稳态 1227.58→1175.83MB。两版独立依赖，候选仅替换已核验的生产文件；计数探针与临时 dist 在 finally 恢复并逐字节核对。该本地结果不代替新 head 的正式预算，也不构成全部 RSS 差异的因果解释。

## 适用边界

本次改变覆盖证明的存储和复用成本，未修改 demo、样式输出预期或性能阈值。现有字符串、声明顺序、条件祖先及可变 AST 回归必须保持。是否消除真实 HMR RSS 回归，以修复提交的正式基准和完整 CI 为准。

## 规则评估

不新增 AGENTS 规则。现有“性能优化与语义边界”已要求保留失败、有限确认及真实框架验证；用可执行的缓存归属和存储边界回归约束实现。
