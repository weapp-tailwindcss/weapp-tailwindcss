---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1286
baseline: 00cc20a5ee424022a094e5f1fee1802e410f1cb5
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-plugin.hmr-version-matrix.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-remembered-css-replay-cache.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-remembered-css-replay-root-shell.unit.test.ts
---

# Vite 生成缓存与当前构建图的资产提交分离

## 症状

准确 head `00cc20a5ee424022a094e5f1fee1802e410f1cb5` 的 [CI 38354943809](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38354943809) attempt 1、Ubuntu Node 22 Unit 1 job `115156331468`，在 Vite 4 watch 第二次读取 dist CSS 时失败：未找到样式文件。294 文件、3172 项已通过；下游 Quality Gate 的失败是该故障的结果。内存记录峰值约 4122 MB，没有 OOM 或平台故障证明，未盲目重跑。

原五版本测试在本地通过，不能据此否定远端失败。随后保持 CSS 与候选不变，只更新 JS stamp，并继续由 generateBundle 删除框架 CSS 资产；新增第三轮在旧产品实现上确定性复现相同缺 CSS 症状。原 CI 没有 replay 分支 trace，不能断言它必然走了同一分支；新增真实复现证明该产品缺口确实存在。

## 根因与纠正

remembered replay 用来源/候选签名新鲜直接跳过整个处理，混淆了“生成结果可复用”与“本轮输出图已有资产”。每个 rebuild 都可能重新创建资产图；资产缺席时，即使内容没变也必须通过 AssetEmissionPlan 与 emitFile 提交。当前 bundle 或已安排的 primary task 拥有目标时继续避免重复提交。

只复用独立 generated replay 的干净结果，不从可能包含框架贡献的通用 output cache 恢复。证明绑定有序规范化来源及完整 raw hash、原输出与实际输出、生成输入、候选签名、已有 runtime 配置签名、准确 scope dependency revision、platform 与主样式身份；缓存值或证明缺失、CSS 改变或任一归属变化都重新生成。空字符串是有效生成结果，每轮同样提交。依赖 revision 直接消费既有编译图状态，未增加后置源码读取或扫描。

缓存保存未标注来源的生成 CSS，每轮使用当前 trace 重新标注。缓存命中和生成共用输出记录、注入、框架合并及资产提交路径。证明失配时不传入可能混有旧框架规则的 previousCss；编译会话仍持有自身候选和生成缓存。框架贡献通过现有 pending merge 合并，不覆盖本轮规则，也不恢复已删除规则。

## 验证

Node 22.22.3 的真实 Vite 4–8 watch 矩阵新增连续 JS-only rebuild 后 5/5 通过；旧实现的 Vite 4 第三轮先失败。干净缓存、空 CSS、连续三轮提交、通用缓存污染、缺结果/证明、raw/source/candidate/runtime/dependency/output/platform/主样式变化、当前与 planned 所有者和框架 root shell 回归通过。Node 22.22.3 与 24.18.0 的 10 个 Vite/缓存/框架合并/架构定向文件各 139 项通过；主包类型检查与构建通过，保留原 mixed exports 提示。

本次扩展包内临时 watch fixture，不改 demo、issue 页面、e2e static fixture 或任何 checked-in CSS 快照。每次矩阵运行均重新生成该临时项目的 dist，并核对 CSS 转义与生成结果；没有对应持久 static 项目基线需要更新。未执行本地全面或设备测试。

## 适用边界

定向真实 rebuild 证明资产回放缺口已修，不代表原 CI 时序已完全解释，也不替代新准确 head 或新版版本 PR 的完整验证。不能通过增加轮询/超时、跳过断言或使用旧 head 绿色证据完成验收。

## 规则评估

不新增 AGENTS；以来源归属证明、持久回归和既有 bundler API 维护产物图边界。公开包行为变化新增中文 `weapp-tailwindcss` patch intent，仍须自动 prepare 生成版本 PR。
