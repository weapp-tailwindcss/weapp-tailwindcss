---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1324
baseline: 37af1f4f1cf75853755d9189510ab7cd4fca06bd
regressions:
  - benchmark/version-compare/test/allocation-sampling.test.mjs
  - benchmark/version-compare/test/allocation-controller.test.mjs
  - benchmark/version-compare/test/dispatch-inputs.test.mjs
  - benchmark/version-compare/test/allocation-profile-codec.test.mjs
---

# Inspector 分配采样会隐式强制 GC

## 症状

Skyline PR 的 Uni 正式 RSS 门禁失败后，分配诊断与自然 GC 诊断给出不同方向。诊断实现没有调用 `global.gc()`，但这不足以证明取样没有主动收集垃圾。正式 Benchmark `41109215069` 的失败仍有效；本记录只验证诊断缺陷及入口修复。

## 根因与纠正

Node `22.23.4` 的 V8 inspector 在 [startSampling](https://github.com/nodejs/node/blob/v22.23.4/deps/v8/src/inspector/v8-heap-profiler-agent-impl.cc#L566) 中无条件设置 `kSamplingForceGC`。`getSamplingProfile` 和 `stopSampling` 随后调用 [GetAllocationProfile](https://github.com/nodejs/node/blob/v22.23.4/deps/v8/src/profiler/sampling-heap-profiler.cc#L278)，该标志使其执行 `CollectAllGarbage`。收集已回收对象的两个选项不能关闭这一标志。

现有约束禁止主动请求 GC，因此 allocation 模式必须明确失败。CLI、dispatch、controller、直接 preload 和采样器都拒绝该模式，controller 在创建 GC 会话前拒绝，preload 在创建 writer 和 observer 前拒绝。删除采样器的 inspector 导入，直接调用也无法绕过。未知模式同样失败，inputs 模式继续支持，历史 profile 的有界解码保留。

历史 Mpx allocation 和 Uni allocation `41126621553` 的原始文件、哈希与完整性结论保留；撤回其“无主动 GC”和自然工作负载归因。allocation 会话同时记录的 GC 也受到干预。未同时启用 allocation 的独立 inputs、被动 GC 和正式 Benchmark 不经过该采样器。更正在 [诊断证据](assets/skyline-typography/diagnostic-followup-evidence.json) 中追加，未覆写旧数值。

## 验证

在 macOS、Node `22.23.4`、独立 worktree 依赖中，包含未提交修复的 benchmark 定向套件共 48 文件、343 项通过；该结果不能绑定为原始基线提交已含修复。持久回归包括：拒绝前不连接 inspector；controller 不创建会话目录；直接 preload 不执行业务入口或写诊断文件；inputs 的真实 Node worker 继续完成；深层、重复大字符串的历史 codec fixture 采用合成数据验证，测试不再启动真实 inspector sampler。

15 个修改的 MJS 文件经 `ESLint --no-ignore` 检查通过；普通 lint 会忽略这些文件，不能代替该检查。`pnpm agents:check` 与 `git diff --check` 通过。入口、真实 preload 拒绝测试和历史 JSON 原字段还经独立只读审查。

另有忽略目录内的原生 V8 累计采样对照，使用 flags `6`，不包含 ForceGC 位 `1`，保留已回收样本元数据且不强持业务对象。区间为 256 KiB、栈深 128；首次重复字符串输出超过 16 MiB，明确失败并保留。随后仅以完整字符串字典修复传输，保持参数及 16 MiB 编码、64 MiB 解码上限。候选和基线均完成三轮 HMR 与源码恢复，两个 wrapper exit 0，实际 Uni 进程完成回执且均已消失；未单独记录 Uni 的 OS 退出码。

两份成功报告编码为 9,352,654 / 9,553,367 字节，独立展开为 19,115,395 / 19,447,701 字节；节点 59,412 / 60,898，样本 20,975 / 21,487，未知节点均为零。SHA、身份、全部引用和连续 ordinal 经独立核验。原生 API 的估计使用 `size × count`；[BuildSamples](https://github.com/nodejs/node/blob/v22.23.4/deps/v8/src/profiler/sampling-heap-profiler.cc#L300) 与节点分组分别调用 ScaleSample，舍入位置不同，不能要求两种合计精确相等，也不能套用 CDP 的求和方式。

过滤诊断祖先子树后，累计分配估计为基线 5438.819 → 候选 5319.271 MiB。它不是存活堆或 RSS；两侧输出观察延迟很长且不同，没有等价尾部或同阶段 post-major 边界。Rollup sourcemap decode/encode 合计约增加 14.07 MiB，同一消费者的差异仍是采样线索，未定位正式 RSS 回退的产品根因。

## 适用边界

本修复禁用有确定干预的诊断入口，不修改产品源码、预算、超时、断言或正式性能结果，也不宣称 Uni RSS 已修复。原生 addon 仅为本机忽略工件，不是新增发布或 CI 能力；flags6 的采样元数据、观察开销及自然 GC 时序仍会影响工作负载。

## 规则评估

只更新已有诊断领域规则，明确拒绝隐式强制 GC 的 inspector 入口；以可执行拒绝回归防止恢复旧路径，不增加仓库级规则。
