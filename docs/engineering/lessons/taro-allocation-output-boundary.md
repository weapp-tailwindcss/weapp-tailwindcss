---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417
regressions:
  - benchmark/version-compare/test/allocation-evidence.test.mjs
  - benchmark/version-compare/test/allocation-controller.test.mjs
  - benchmark/version-compare/test/allocation-mapping.test.mjs
verification:
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
---

# Taro 分配诊断的输出边界

## 症状

正式 Benchmark 的 Taro Vite 分片在准确 head `c5ce4c1b16a834aaf0f6ae9839272498f176a5fd` 失败。冷构建峰值 RSS 中位数为 `1594.23828125 → 1773.6640625 MiB`，增加 `179.42578125 MiB / 11.2546401225%`，超过原有 `5% / 64 MiB` 门槛；三份当前样本均达到回归条件，要求至少两份，检验 p 值为 `0.05`。

| 版本 | 三次冷构建 peak RSS（MiB） |
| --- | --- |
| 基线 fdc3d585 | 1713.8671875 / 1594.23828125 / 1593.4140625 |
| 当前 c5ce4c1 | 1765.609375 / 1774.16015625 / 1773.6640625 |

这是该分片唯一违规指标。进程树数量和辅助进程的量级相近，差额主要来自实际执行 Taro 的 Node；进程名与 RSS 无法定位 JavaScript、原生分配或保留路径。聚合 job `120858969125` 仅传播同一违规，不另算一个根因。构建耗时、HMR、其他框架或先前 head 的成功不能抵销本次失败。

随后仅调度一次独立 allocation 诊断，基线、head 和实际 Node 版本保持对应，配置为固定 build 3 / HMR 3、采样间隔 `262144`，包含被 major/minor GC 回收对象的样本。两侧实际都只执行了首次冷构建：写入初始 profile 时抛出“诊断输出超过固定上限；本份证据未写入，不做静默截断”。后续冷构建及 watch 没有开始。

## 根因与纠正

确定的问题在诊断的持久化边界，而非已经定位的产品内存根因。`persistCompilationEvidence` 先写 profile，再写 inputs 与 frames；失败工件里三类文件均缺失。两侧 `snapshotCount=1`、`viteCompletedCount=1`、`complete=false`，已写入总量分别为 `2248987`、`2283420` 字节，未接近 `64 MiB` 累计上限。结合写入顺序，失败指向初始 profile 超出 `16 MiB` 单文件限额。旧错误没有记录实际超限字节数，不能补造精确尺寸或失败 URL。

原始 profile 未落盘，无法从残存工件恢复。重复的大 URL 是待检验的编码假设；依赖源码具有生成 `data:` URL 的路径，并不能证明这次实际使用了该路径。不得以此宣称 RSS 增量已经找到根因。

修复方向是在原有限额内，使用版本化字典无损保存重复 URL，同时保存所有节点、采样、计数、字符串原文及未知字段；profile 和 frames 的消费者须先核验实际存储字节与哈希，再严格解码。编码后的单文件仍不得超过 `16 MiB`，同会话总输出仍不得超过 `64 MiB`，逻辑展开也必须有独立上限。超限或损坏必须明确失败，不能截断、增大采样间隔或改动正式预算来取得成功。

## 验证

正式首败工件为 `12557813360`。独立诊断工件 `12558591338` 包含 396 个文件，其 ZIP SHA-256 为 `197e3a6b0fa6e41ec48105f0aa31bcfa9b58692c1eed6023f15e801cbc79f8c2`，与服务端摘要一致；完整 job 日志及身份、阶段、限额、写入总量和缺失文件清单均已保留。没有 rerun 正式失败，也没有把独立诊断作为正式门禁替代。

残存操作事件里，两侧各有五次 generator/native generate 和相同 engine 创建、编译计数。按 target 与准确候选集合配对的五组 CSS/rawCss 字节及哈希一致，但请求顺序不同，来源正文包含不同准备副本绝对根，配置默认值与不可跨进程比较的引用也有差异。由于完整 inputs 和 allocation 缺失，这只能证明已配对的五组产物相同，不能证明全部工作量相等或内存行为相同。

冷构建采样在 Vite finalizer 完成处停止；永久关闭尾部与此后的 Taro 处理不在该 profile 范围内。操作日志存在采样后的释放事件，不等于已观察其分配或证明物理内存归还。修复输出协议时保留原采样停点，不静默改变阶段含义。

无损编码回归、修订协议的新真实诊断、产品内存归因、当前 head 原门禁通过及本地完整设备验收仍需分别完成。现有单测或残存产物对照不能替代这些证据。

## 适用边界

本记录保持 `partial`；历史内存证据与实例隔离约束见[框架内存记录](framework-memory-evidence.md)。本次不调整产品源码、采样次数、正式预算或关闭顺序，不更新 demo static 基线。

## 规则评估

不新增 AGENTS 规则。沿用诊断目录已有的固定上限、完整证据和独立检查身份要求，用协议回归补充实际持久化边界。
