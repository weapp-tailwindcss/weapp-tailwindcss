---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 62d46fc5a001ad4d5e81b23c87457911ba5db920
regressions:
  - e2e/watch/hot-update/demo/uni-app-x-vdom-tailwindcss-v4.test.ts
  - e2e/demo-workflow-native-cancellation.test.ts
  - e2e/watch-command-lifecycle.test.ts
---

# uni-app x 微信 watch 的首次增量 CPU 采样

## 症状

前轮微信 watch 在原有 420 秒总预算内没有完成。18 个首次非初始 plugin total 的中位数为 4141ms，均超过 500ms。细分日志中的 `tasks.css`、`entries.plan` 等记录的是包含异步等待的墙钟耗时，保存的输出 CSS 又不含原始任务、缓存和 registry 状态，不能据此构造忠实重放或直接认定 CPU 热点。

主机持续高负载使速度比较受到干扰，但不能由此推导“无法继续任何诊断”。此前将这个限制扩大到独立微信 CPU 采样的判断需要纠正。原生 Alpha 的停止完成信号问题仍然存在；微信 watch 则通过本轮绑定的 Alpha Node 和 `uni.js` 启动独立编译器，不进入共享 IDE 的原生 launch。新的 Harmony 预检只读取系统、布局与截图，也不启动 App 或 quickFix。

## 根因与纠正

本轮只补充真实采样证据，尚未证明原性能失败的唯一根因，也没有根据不稳定样本修改产品逻辑。

使用忽略目录中的临时 preload，通过 `NODE_OPTIONS --require` 只观察同时满足四项身份的进程：Alpha Node、编译器入口、真实项目根以及 `UNI_PLATFORM=mp-weixin`。preload 原样转发 `stdout.write` 的参数与返回值，不修改厂商安装、构建内容、日志内容或测试门槛。完整脚本随证据保存。

一轮构建会输出两个 `total`：主插件的 `generateBundle` 汇总，以及独立 `cssFinalizer` 汇总。第二个 `total` 仍可能属于初始构建，不能把它当成首次增量。本轮在初始两个汇总后的 `DONE Build complete. Watching for changes...` 启动 profiler；确认下一轮包含 `sourceCandidates.watchChange` 和 `generateBundle`、不含 `configResolved`，再等待其 finalizer 与 DONE 后停止。

原始 profile 和采集状态落盘后才通过本轮取消文件退出。沿用 240 秒 mutation、420 秒整体与 500ms plugin 门槛，禁止跳过构建，最大尝试次数为 1。主动取消的测试结果仍记为失败/退出 130，不改写为通过。

## 验证

代码为 `62d46fc5a001ad4d5e81b23c87457911ba5db920`。新轮次 `0152800b-7ff5-42bf-ab8d-98e45485c1b1` 完成全部探针、当前会话真实输入/点击/截图、verify、领取及阶段复查，再执行现有 VDOM 微信 watch 用例。prepare、verify 和 consumer 使用一致的 `pnpm exec tsx` 启动环境。

前一轮 `5277c884-5613-4819-a094-f0cbf796f293` 的 verify 已失败并终止：computer use 返回 JPEG 字节，被错误保存为 PNG 文件名，触发 `unrecognised content at end of stream`。这是证据保存错误。恢复轮次保留原始 JPEG，再仅转换图片编码生成 PNG，记录命令与两份 SHA-256；重新 prepare 和真实交互，没有复用失败报告或修改失败状态。

证据位于 `e2e/.artifacts/uni-app-x-alpha/0152800b-7ff5-42bf-ab8d-98e45485c1b1/watch-cpu/`：

- `incremental.cpuprofile`：原始 CPU profile。
- `capture.json`：精确编译器身份、采样确认、首次差量编译、结束时间、原始 HMR 事件、进程 CPU 与资源计数器。
- `preload.cjs`、`orchestration.ts`：本轮实际诊断脚本。
- `report.json`：`diagnostic-captured-cancelled`，保留退出 130 和预期取消原因。
- `cleanup-and-login.json`：源码字节、所属进程和登录态的独立收尾核对。

原始编译日志为 `.tmp/alpha-watch-cpu-62d46fc5a.log`。以下结果属于一次有采样开销的真实增量诊断，不能与无采样历史耗时直接比较：

| 观测 | 结果与限制 |
| --- | --- |
| profile | 8293 个样本，13915.000ms；包含初始完成后的空闲等待与 profiler 启动开销 |
| profiler 启动 | 首个样本 814.375ms 位于 `node:inspector post`，不能计为编译器工作 |
| 真实增量窗口 | 从首次“开始差量编译”到停止请求约 5393.401ms；采样启动 ACK 早于此窗口 |
| 插件日志 | 主插件 total 1101ms，其中 `generateBundle` 935ms；后续 finalizer total 41ms，不满足 500ms 门槛 |
| 进程 CPU | ACK 到停止请求期间 user 4472.373ms、system 642.089ms，覆盖整个 Node 进程及其线程，不对应单个插件 |
| 调度干扰 | 同期 46528 次非自愿上下文切换，load 约 48→54，主机 16 个逻辑 CPU |
| 收尾 | 三个被核对的源码文件与 HEAD 字节一致，工作树干净；采样报告记录的 20 个 PID 全部退出；prepare 退出 0、门禁 finished、临时标签清零；微信服务 19355 登录仍为 true |

profile 的时钟原点与 `process.hrtime` 不同，本轮没有记录跨时钟校准对。以结束时刻对齐的阶段划分只能作为估算，不能给出逐样本的精确阶段归属。

完整 profile 的 idle 权重为 7982.541ms，GC 权重为 1064.715ms。厂商 UTS 的 `transform → getCompiled/getCached → TypeScript synchronizeHostData/getProgram` 调用链具有约 1358.957ms 权重、705 个样本；权重仍不等于该函数的实际 CPU 时间。

`extractProjectCandidatesWithPositions` 的 210.459ms 权重只有 34 个样本，其中 9 个大间隔贡献 169.876ms；`path.relative` 的主要 45.082ms 中，一次间隔就占 43.583ms。不能据这些长间隔声称路径计算或 Babel 解析就是已证明的性能根因。

较稳定的仓库线索是 `getCombinedSourceCandidatesForEntries`：102.583ms 权重、75 个样本、最大间隔 4.5ms，其中来源匹配有 97.708ms、72 个样本。对应 `bundle-markup-candidates.ts` 的 `valuesForEntries` 为每次范围查询遍历同一候选集合并解析文件/来源路径。后续已用真实 fixture 复现重复匹配，在 collection 生命周期内复用查询，并保护包含/排除条件、文件替换与删除、符号链接和返回 Set 的修改隔离，见[模板候选查询复盘](vite-bundle-markup-query-reuse.md)。这项修复不能独立证明整个插件满足性能门槛。

## 修复后的无采样复验

代码 `b5b52baff54ec28c0b2dfd67ba8b24a1fad9c8df`、轮次 `9db759f2-6983-4d1a-ae04-d1c9a94a6f8f` 重新完成预检、当前会话真实交互、verify 和领取。保留原预算、最大尝试次数 1、重新构建，不加载 profiler。

- 微信 IDE 的 3 项测试通过，其中 2 项为矩阵契约、1 项为真实 VDOM 用例；后者的模板/脚本更新均保持 runtime clean，未再发生 WXSS 路径错误。页面可见性仍受既有 case-level relaxed visibility 限制，不能称为完整可视 HMR。
- watch 在 147.321 秒内返回功能 metrics，随后原性能断言报 `case-template-preferred:hot-update 599ms > 500ms`，退出 1。模板与脚本的各轮新增/删除、同名类字面量、`text-xs → text-[29px] → text-xs` 和主样式切换已完成；style mutation 被该 case 显式跳过，content mutation 与分包没有配置。
- Iconify metrics 的 4ms 命中不能计为有效通过：固定图标与 before/after 内容已由 `@source inline` 生成，原校验只查 CSS，未证明本轮页面消费；当时 `semanticAccepted=true`、`updatedFiles=[]`。这是后续独立修复的测试证据缺口。
- 首批日志去除初始构建、finalizer-only total 和错误尾重播后共有 29 个主插件样本，中位数 513ms，范围 265–1550ms，17 个超过 500ms。全部样本保留，不丢弃首次失败或重复执行取绿。

本轮证据在 `e2e/.artifacts/uni-app-x-alpha/9db759f2-6983-4d1a-ae04-d1c9a94a6f8f/wechat-verified-fixes/`：`run.log`、`watch-report.json`、`first-plugin-samples.json` 与 `cleanup.json`。三份源码与 HEAD 字节一致、工作树干净；采样记录中的 32 个所属 PID 均退出，prepare 为 finished，临时浏览器标签为 0，微信已有服务只读登录检查仍为 true。

运行前 16 个逻辑 CPU、load 为 34.007/35.211/38.534。选定的 complex add 样本为 `generateCss.build=101ms`、`generateBundle=493ms`、其他 hooks 共 5ms；其中 `entries.plan=165ms`、`tasks.css=245ms` 仍是墙钟/等待时间。`cleanCacheHit` 仅表示缓存中存在记录，而非当前 CSS 已直接复用。旧 profile 没有足够的阶段与时钟对应证据来认定本次剩余 CPU 热点，也不能仅凭主机负载将失败归因于环境。若继续 CPU 诊断，应预先选定一次增量场景，校准 profile 与阶段时钟，并记录进程 CPU/上下文切换；不能拿诊断样本替代无 profiler 的验收。

## Iconify 证据修复后的无采样复验

代码 `886a43d98`、轮次 `5e2a3e08-c1ad-44f6-8e28-30720ba00b85` 在新预检与真实 computer use 后，串行执行普通 uni-app Vite Web 与 Alpha VDOM 微信 watch。Web 阶段通过；微信编译器的本轮 Iconify class 载体与稳定后撤销证据已通过，详见 [Iconify 阶段证据复盘](iconify-hmr-phase-evidence.md)。这轮不运行实际业务微信 IDE 页面，也不进入 Alpha 原生端。

微信 watch 返回功能 metrics 后在 206.53 秒退出 1，仍是原性能门禁：`case-template-preferred:hot-update 685ms > 500ms`。原始第一批主插件增量共 29 个样本，中位数 876ms，范围 312–5796ms，27 个超过 500ms；排除初始构建、finalizer-only total 及错误日志重播。Iconify 更新的插件耗时 771ms，回滚 5796ms，同样未达到 500ms。

运行前 16 逻辑 CPU 的 load 为 69.713/55.049/38.020；本轮验证目标是修复后的新证据契约，不能将该高负载结果直接与前轮作速度回归对比，也不能直接归零为环境失败。没有重试、放宽阈值或启动新的 profiler。固定性能比较基线仍为任务起始 `4488cabc9`。

证据位于 `e2e/.artifacts/uni-app-x-alpha/5e2a3e08-c1ad-44f6-8e28-30720ba00b85/iconify-verified-fixes/`，包括两端报告、原始日志、首批样本、主机状态和收尾核对。四份相关源码与 HEAD 字节一致、工作区干净；记录的 53 个所属 PID 均退出，预检为 finished，临时标签为 0，微信现有服务登录仍为 true。

## 预选复杂新增与时钟校准

代码 `9e5275411`、轮次 `8c12a7a0-3da4-44ac-bdb8-6ed1bc69724c` 再次完成新预检、真实 computer use、verify 和领取后，只诊断预先选定的 `template complex-corpus add`。这次没有再跑完整 watch 取绿。

临时 preload 同时核对 runner 与独立编译器身份。runner 在保存源码前记录 baseline add、baseline delete、complex add 三个真实动作；普通 `passed` 汇总行不计入阶段。编译器在第二次增量 DONE 后启动 profiler，第三次增量开始时核对动作顺序和采样 ACK，在第三次主插件 total 后停止采样，确认对应 finalizer 和 DONE 后才标记采集完成。阶段身份错误、采样启动过晚、第四次增量、超时或时钟区间无交集均为 incomplete，不选择另一个增量替代。

通过 `Profiler.start` / `Profiler.stop` 请求前后的 hrtime 建立 `hrtime = profiler time + offset` 区间，保留原始请求/响应及 `performance.now` 校准对，不假设两个时钟有相同原点。合成验证使用真实 Node inspector，覆盖正常三轮、真实 passed 汇总行与错误阶段身份；它只验证采集器，不能替代实际运行。

| 实际观测 | 结果与解释 |
| --- | --- |
| 目标 | 第三次增量，runner 与编译器身份和顺序一致；目标窗口 2390.865ms |
| profile | 3249 个样本，5138.208ms，包含前置空闲；offset 交集宽度 72.907ms |
| 保守窗口 | 1888 个样本的整个区间在所有合法 offset 下均落入目标，权重 2317.333ms；122 个边界样本不用于确定归属 |
| 插件日志 | 主插件 1597ms，`generateCss.build` 1053ms、`generateBundle` 533ms；后续 finalizer 37ms，不在主插件窗口内 |
| 进程计数 | 目标窗口 user 2767.755ms、system 390.723ms；计数含整个进程及线程，不能分摊为插件函数 CPU |
| 主机/调度 | 16 逻辑 CPU，目标开始 load 19.480/21.238/26.549；26012 次非自愿上下文切换 |
| 稳定采样线索 | 厂商 UTS `transform → getCompiled/getCached` 645 个样本、836.546ms 权重，其中 TS `synchronizeHostData/getProgram` 478 个样本、620.086ms；GC 221 个样本、280.496ms |
| 采样间隔 | 保守窗口最大单次间隔 4.709ms；上述调用链上下游重叠，不能累计为独立耗时 |

这些权重描述采样栈，不等于精确 CPU 时间，也不能直接把厂商 UTS 的权重从插件墙钟日志扣除。当前证据没有证明新的可删除重复工作，不据此改写预算、计时口径或追加产品补丁。

证据保存在 `e2e/.artifacts/uni-app-x-alpha/8c12a7a0-3da4-44ac-bdb8-6ed1bc69724c/watch-cpu-complex/`，包含 `capture.json`、`incremental.cpuprofile`、`target-selection.json`、`bounded-profile-analysis.json`、本轮脚本和原始日志。采集落盘后合作取消，退出 130、状态 `diagnostic-captured-cancelled`，不是 watch passed。三个相关源码文件与 HEAD 原文一致、工作区干净，记录中的 29 个所属 PID 均退出，预检 finished、临时标签 0、微信登录仍为 true。

## 适用边界

本轮没有完成 watch，也没有完成 Alpha 16 阶段或扩展 46 阶段。真实微信编译器的 CPU 诊断不能替代微信 IDE 页面验收，更不能证明 Android、iOS 或 Harmony 的严格 HMR 和停止协议已修复。

采集器的合成验证只证明身份不匹配时不注入、两个 total 的处理及采样落盘逻辑，不计为真实设备验收。原始首次失败与本轮主动取消均保留；后续性能比较仍使用固定任务起始提交 `4488cabc9` 和原采样/阈值。

## 规则评估

不新增或放宽规则。现有真实门禁、原始失败保留、有限复测和资源归属要求足够。恢复动作是正确保存真实截图并完成新的预检；高负载限制性能结论，不替代对独立诊断路径的具体安全评估。
