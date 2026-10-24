---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417
regressions:
  - benchmark/version-compare/test/mpx-operation-evidence.test.mjs
  - benchmark/version-compare/test/mpx-observer-lifecycle.test.mjs
  - packages/weapp-tailwindcss/test/compiler/generator-service-isolation.test.ts
verification:
  - claim: Mpx 正式 HMR 的 peak 和 steady RSS 在首轮与内置反序确认均超过原预算，不能以其他框架成功抵销
    kind: ci
    status: failed
    sha: 93716b6f14babbde359176a285f7d2dfddca5389
    environment: Ubuntu，实际 Node 22.23.3；PR 实际 checkout 为 merge 08d396cbd47bb0f9238db59d7c668fd1e811f213，与 head 的 Git tree 相同
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40098965639/job/120889064678
  - claim: 唯一 allocation 诊断六次冷构建完整、两侧 watch 因原逻辑输出上限失败；共同四阶段未增加生成或编译次数
    kind: ci
    status: failed
    sha: 93716b6f14babbde359176a285f7d2dfddca5389
    environment: Ubuntu，固定 build 3 / HMR 3、原 256 KiB 采样、停止点与文件预算
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40101339010/job/120894135160
---

# Mpx 连续更新内存证据

## 症状

正式 run `40098965639` / job `120889064678` 的 Mpx HMR peak RSS 为 `1545.625 → 2014.96484375 MiB`（+30.37%），steady 为 `1531.6171875 → 1979.01171875 MiB`（+29.21%）。原有独立反序确认的 peak 为 `1658.98046875 → 2224.72265625 MiB`（+34.10%），steady 为 `1408.23046875 → 1956.603515625 MiB`（+38.94%）。原 5% / 64 MiB 门槛保持，不人工重跑直到通过。

每侧每个顺序是一个独立 watch 进程内的三次修改和三次回滚；合计四个 watch 会话，不能写成三次独立进程复现。Benchmark 汇总只传播这份违规，不另计根因。

## 根因与纠正

目前尚未定位产品根因。实际 mpx-cli Node 的采样峰值首轮 `1426.03125 → 1894.734375 MiB`，反序 `1538.79296875 → 2104.5625 MiB`；其余 launcher、pnpm 与 shell 在 ready 后维持约 `119.59–120.23 MiB`，没有增加实际 worker 的子进程。差额主要来自该 Node 在连续更新期间的增长，不能归因于重复计算辅助进程。

Mpx 框架迁移中的 plugin-owner 文件与原实现逐字节相同，别名配置、loader resolve 包装及 pre rules 的函数体也相同。不能因为代码移动到新目录就将其视为性能变化。需要按真实请求核对配置版本、服务 key、原生会话创建与复用，以及退休任务的完成关系；仅有新对象或 creates−releases 计数不足以证明重复编译或泄漏。

## 验证

正式工件 `12562377487` 为 `379595` 字节、47 个文件，ZIP SHA-256 为 `871a4cc95fe6bdbedc62a848abd4491a469a31c3940a38740bbbca9800b5152a`，服务端摘要、CRC 和解压原字节通过独立核验。PR head 为 `93716b6f14babbde359176a285f7d2dfddca5389`，实际 CI source 为 merge `08d396cbd47bb0f9238db59d7c668fd1e811f213`；Git API 与本地确认二者 tree 同为 `5247e77b06c36b66bf5d4b26e282f5213f156908`，保留真实 sourceCommit。

四个会话的启动、ready、三轮修改/观察与回滚/观察共十四个控制器边界完整。250 ms RSS 采样和控制器时间线只能给邻近样本，不能充当边界瞬间内存；30 ms 配置是产物轮询间隔。自然 GC NDJSON 完整且零截断，两个顺序均为基线七次 / 当前六次 major 事件，时机有差异。observer 回调数值不是精确 post-GC 或存活堆，RSS、external 和 ArrayBuffer 也不能互相替代。

采样在 stopChild 前停止，没有 shutdown / closed 回执或关闭后内存证据。正式工件只记录 marker 和时序，不含来源全文、候选或操作完成证书；不能据十四个边界宣称准确七次 finalization，更不能宣称最终资源已经释放或泄漏。

唯一 allocation run `40101339010` 已失败，工件 `12563342202` 为 `37335329` 字节、2573 个条目，SHA-256 为 `5da1aa848b9c606dd4ea294f54b92bf62b3dad4b195e4af0de3f8731db50f409`。服务端摘要、完整下载尺寸、ZIP CRC、路径边界和解压原字节通过独立核验。八会话的身份、真实 CLI/PID、observer 模块 SHA、全文 receipt、操作起止和 profile/frames 节点引用均已复核。

六次冷构建的 controller 完整；baseline watch 的第五份 frames 逻辑展开为 `72375277` 字节，current 的第六份为 `74247964` 字节，均超过原 `67108864` 上限而未写出。对应 profile 已写出，但不能代替缺失的 frames。两侧 watch 均未完成第三次回滚及停止回执；保持原采样、文件及会话预算，不将局部 profile 当作完整 HMR 或正式性能检查。

共同前四个完整阶段为 watch-start、mutation1、rollback1、mutation2。双方 generator create/generate 共 `9/12`，native create/reuse 共 `9/3`，engine create/compile/build 共 `18/21/12`。current 只在首次阶段 acquire 根、普通分包、独立分包三个 service；随后九次 matches 全为 true，没有额外创建、退休或释放。各 mini native source key 对应相同且四阶段稳定；请求均为 `incrementalCache:false`，未进入新增 engine identity 的全局增量缓存路径。因此共同范围的证据排除了服务 key 抖动和额外生成次数，不能推广到未取得证据的完整 watch。

冷构建每轮配对七个请求，共二十一对 CSS/rawCss 原始字节相同；current cold1 和 baseline cold3 各有一个额外 web scan，逐轮保留。共同 watch 配对 `6/2/2/2` 个请求，十二对 CSS/rawCss 原始字节相同；来源全文按实际文件和 layer 配对也相同。根 mini 候选顺序与明确能力选项仍有差异，原 `compareOperationInputs` 保持 `sameRecordedOperationsAndInputs:false / opaqueInputs:false`，不得改称全部输入一致。

共同 snapshot4 的非诊断主包/engine 自有路径 self 分配累计约为 `470.110 → 468.956 MiB`；新增 profile 解析、配置指纹和快照分配量不足以解释正式 RSS 差额。采样包含已回收对象；累计 allocation、inclusive 下游分配及名称相同的无 hash 帧，均不能证明存活堆、保留关系或没有泄漏。正式 major 回调中的约 6 GiB external 与 ArrayBuffer 数值具有包含关系；现有工件未记录 backing store 身份，不据依赖库可能的分配机制认定实际所有者。

## 适用边界

本记录保持 partial；历史框架证据见[框架内存记录](framework-memory-evidence.md)，Taro 的独立完整性限制见[分配输出边界](taro-allocation-output-boundary.md)。本次没有产品修复、预算调整或 demo 基线变化。

## 规则评估

不新增 AGENTS 规则。沿用已有限定诊断、精确身份、保留首败和原性能预算要求。
