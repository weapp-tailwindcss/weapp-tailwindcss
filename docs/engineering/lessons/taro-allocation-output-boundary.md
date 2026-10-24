---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417
regressions:
  - benchmark/version-compare/test/allocation-evidence.test.mjs
  - benchmark/version-compare/test/allocation-controller.test.mjs
  - benchmark/version-compare/test/allocation-mapping.test.mjs
  - benchmark/version-compare/test/allocation-profile-codec.test.mjs
verification:
  - claim: 无损传输、有界读取、文件类型与回执拒绝路径及完整诊断工具域整合回归通过，不能替代真实 Taro 诊断
    kind: unit
    status: passed
    sha: 9c268356ba54236c801534590aba34ee0704d174
    environment: macOS arm64，实际 Node 22.23.3，CI=1，30 文件 227 项通过，零跳过
    command: node node_modules/vitest/vitest.mjs run -c benchmark/version-compare/vitest.config.mjs --update=none --maxWorkers=1 --no-file-parallelism
  - claim: c5ce4c1 的 Taro Vite 冷构建峰值内存超过原门禁，其他指标通过不能抵销该失败
    kind: ci
    status: failed
    sha: c5ce4c1b16a834aaf0f6ae9839272498f176a5fd
    environment: Ubuntu，实际 Node 22.23.3，原三次冷构建与三轮 HMR 工作负载、采样和预算
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40087447090/job/120854527165
  - claim: 独立分配诊断在两侧首次冷构建后均因证据输出上限失败，没有取得有效 profile
    kind: ci
    status: failed
    sha: c5ce4c1b16a834aaf0f6ae9839272498f176a5fd
    environment: Ubuntu，实际 Node 22.23.3，两侧各完成首次冷构建，后续构建与 HMR 未执行
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40089124742/job/120858192324
  - claim: 6a2e909 的 Taro Vite 冷构建峰值仍连续三次回归，不能将基线波动解释为修复
    kind: ci
    status: failed
    sha: 6a2e909970939dc006fba54399592c97664dda2e
    environment: Ubuntu，实际 Node 22.23.3，原三次冷构建与三轮 HMR 工作负载、采样和预算
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40091306264/job/120865930355
  - claim: URL 字典协议在真实 Taro 两侧仍超过单文件上限，实际 URL 最长仅 286 字节，未取得完整 profile
    kind: ci
    status: failed
    sha: 6a2e909970939dc006fba54399592c97664dda2e
    environment: Ubuntu，实际 Node 22.23.3，两侧各首次冷构建，encoded-file 分别为 17582413 和 18108614 字节
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40091365753/job/120865762052
---

# Taro 分配诊断的输出边界

## 症状

正式 Benchmark 的 Taro Vite 分片在准确 head `c5ce4c1b16a834aaf0f6ae9839272498f176a5fd` 失败。冷构建峰值 RSS 中位数为 `1594.23828125 → 1773.6640625 MiB`，增加 `179.42578125 MiB / 11.2546401225%`，超过原有 `5% / 64 MiB` 门槛；三份当前样本均达到回归条件，要求至少两份，检验 p 值为 `0.05`。

| 版本 | 三次冷构建 peak RSS（MiB） |
| --- | --- |
| 基线 fdc3d585 | 1713.8671875 / 1594.23828125 / 1593.4140625 |
| 当前 c5ce4c1 | 1765.609375 / 1774.16015625 / 1773.6640625 |

后续准确 head `6a2e909970939dc006fba54399592c97664dda2e` 仍出现相同尾部增长，冷构建峰值中位数为 `1644.671875 → 1763.19140625 MiB`，增加 `118.51953125 MiB / 7.20627%`，三份样本均回归。基线三次为 `1686.97265625 / 1576.171875 / 1644.671875`，当前三次为 `1783.98046875 / 1746.98046875 / 1763.19140625`。相对 c5，当前中位数仅下降约 `10.47 MiB`，基线中位数却升高约 `50.43 MiB`；违规百分比变小不能证明产品改善。增长再次集中于最后约一秒的主 Taro Node 进程，耗时和其他框架通过仍不能抵销。

这是该分片唯一违规指标。进程树数量和辅助进程的量级相近，差额主要来自实际执行 Taro 的 Node；进程名与 RSS 无法定位 JavaScript、原生分配或保留路径。聚合 job `120858969125` 仅传播同一违规，不另算一个根因。构建耗时、HMR、其他框架或先前 head 的成功不能抵销本次失败。

随后仅调度一次独立 allocation 诊断，基线、head 和实际 Node 版本保持对应，配置为固定 build 3 / HMR 3、采样间隔 `262144`，包含被 major/minor GC 回收对象的样本。两侧实际都只执行了首次冷构建：写入初始 profile 时抛出“诊断输出超过固定上限；本份证据未写入，不做静默截断”。后续冷构建及 watch 没有开始。

## 根因与纠正

确定的问题在诊断的持久化边界，而非已经定位的产品内存根因。`persistCompilationEvidence` 先写 profile，再写 inputs 与 frames；失败工件里三类文件均缺失。两侧 `snapshotCount=1`、`viteCompletedCount=1`、`complete=false`，已写入总量分别为 `2248987`、`2283420` 字节，未接近 `64 MiB` 累计上限。结合写入顺序，失败指向初始 profile 超出 `16 MiB` 单文件限额。旧错误没有记录实际超限字节数，不能补造精确尺寸或失败 URL。

原始 profile 未落盘，无法从残存工件恢复。重复的大 URL 是待检验的编码假设；依赖源码具有生成 `data:` URL 的路径，并不能证明这次实际使用了该路径。不得以此宣称 RSS 增量已经找到根因。

修订实现在原有限额内，使用版本化字典无损保存重复 URL，同时保存所有节点、采样、计数、字符串原文及未知字段；profile 和 frames 的消费者先有界读取并核验实际存储字节与哈希，再严格解码。编码后的单文件仍不得超过 `16 MiB`，同会话总输出仍不得超过 `64 MiB`，逻辑展开另受 `64 MiB` 上限约束。错误附实际文件名、尺寸、写入量与节点、样本及 URL 统计。超限或损坏明确失败，不截断、增大采样间隔或改动正式预算。

该修订的真实诊断 `40091365753` 两侧仍只运行到首次冷构建，并再次在 profile 持久化处失败。新增的结构化错误给出了可核对的完整尺寸统计：

| 统计 | 基线 fdc3d585 | 当前 6a2e909 |
| --- | ---: | ---: |
| 字典 envelope 存储字节 | 17,582,413 | 18,108,614 |
| 原文逻辑展开字节 | 32,512,502 | 33,792,934 |
| 节点数 | 107,569 | 111,174 |
| 样本数 | 39,646 | 40,051 |
| 不同 URL 数 | 883 | 850 |
| 最长 URL 的 UTF-8 字节 | 286 | 273 |

这次失败并非大 `data:` URL 导致；普通 URL 字典没有消除十万余节点的重复 JSON 结构。旧运行仍缺实际 profile，不能用新统计补造旧运行的 URL 内容。下一步传输修订须保持全部样本和原有字节预算，以有界无损压缩处理重复结构，补充压缩损坏、截断和解码膨胀的拒绝测试；未经真实诊断不能宣布该方案已经解决完整取证。

## 验证

正式首败工件为 `12557813360`。独立诊断工件 `12558591338` 包含 396 个文件，其 ZIP SHA-256 为 `197e3a6b0fa6e41ec48105f0aa31bcfa9b58692c1eed6023f15e801cbc79f8c2`，与服务端摘要一致；完整 job 日志及身份、阶段、限额、写入总量和缺失文件清单均已保留。没有 rerun 正式失败，也没有把独立诊断作为正式门禁替代。

残存操作事件里，两侧各有五次 generator/native generate 和相同 engine 创建、编译计数。按 target 与准确候选集合配对的五组 CSS/rawCss 字节及哈希一致，但请求顺序不同，来源正文包含不同准备副本绝对根，配置默认值与不可跨进程比较的引用也有差异。由于完整 inputs 和 allocation 缺失，这只能证明已配对的五组产物相同，不能证明全部工作量相等或内存行为相同。

冷构建采样在主 `finalizeGenerateBundle` 内、`onEnd` 前停止；正常顺序随后还有独立 CSS finalizer、Rollup 写出、`writeBundle` 和 `closeBundle`。这些阶段不在该 profile 范围内。两侧原本都有独立 finalizer，候选来源索引也不是 CSS 或 sourcemap 全文副本。失败诊断在写 profile 时抛错，跳过正常 finalizer 与写出，其释放尾部不能代表正式构建尾部。操作日志存在采样后的释放事件，不等于已观察其分配或证明物理内存归还。修复输出协议时保留原采样停点，后段须用独立阶段观测定位，不能静默改变阶段含义。

新诊断失败工件 `12559212662` 共 398 文件，ZIP SHA-256 为 `e7d2db48d76e408110cec36383d6c325bdd61fc6820ee235a4574ecb784d9151`，与服务端摘要一致，CRC 检查通过。两侧没有完整 profile、inputs 和 frames，后续冷构建与 watch 未执行。该失败被保留，不以重复调度或正式检查成功替代。

同一完整 fixture 的直接旧写入超过 `16 MiB`，未产生半份文件或增加写入计数；字典写入低于该限额后，全部节点、样本、扩展字段及 URL 逐项还原。真实 inspector、连续 watch、Mpx worker、Taro 入口和既有诊断工具域在实际 Node 22.23.3 下三十文件 / 227 项通过，零跳过。十个修改脚本与测试的严格 ESLint、架构检查和规则检查通过；独立只读审查发现的类型串用与缺失 receipt 漏验路径均已补回归。

修订协议的新真实诊断、产品内存归因、当前 head 原门禁通过及本地完整设备验收仍需分别完成。现有单测或残存产物对照不能替代这些证据。

## 适用边界

本记录保持 `partial`；历史内存证据与实例隔离约束见[框架内存记录](framework-memory-evidence.md)。本次不调整产品源码、采样次数、正式预算或关闭顺序，不更新 demo static 基线。

## 规则评估

不新增 AGENTS 规则。沿用诊断目录已有的固定上限、完整证据和独立检查身份要求，用协议回归补充实际持久化边界。
