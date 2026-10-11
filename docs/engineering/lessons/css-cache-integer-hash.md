---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1254
baseline: 6bafb116d29d133ea7e780650c11dc067f806042
regressions:
  - packages/postcss/test/cache-identity.test.ts
---

# 样式缓存键的整数哈希开销

## 症状

CI `36591605445` 与 `36597096700` 的 `postcss-v4-cache-hit-2000` 分别在 AMD、Intel runner 测得 p95 1.0654／1.0419 ms，超过原有 1 ms 预算。保留两次 artifact，不通过放宽预算或反复重跑消除失败。

## 根因与纠正

缓存命中仍逐字符计算短哈希，原实现每次执行浮点乘法再截断。独立 CPU profile 将主要样本定位到 `processSource` 和哈希循环；相同 2,000 条规则的哈希对照中位数为 0.572／0.111 ms。改用 `Math.imul` 实现 32 位 FNV-1a，保持完整原始源码、配置、Root 来源和外部插件的校验边界。

索引值会变化，但不作为持久协议或相等性证明。回归使用真实碰撞输入 `661068122` 与 `1817992289`，先断言哈希相同，再验证交替调用不错误命中、相同源码随后命中；保留外部插件、动态变量和 Root 身份的既有用例。

## 验证

在 macOS arm64、Node 24.18.0 上分别构建和 `pnpm --filter @weapp-tailwindcss/postcss pack`，对两个 tarball 解包后的公开入口串行测量，共有依赖保持一致。每场景独立进程，预热 5 次、采样 21 次，第二批反转前后顺序；产物 SHA-256 在所有组和样本相同。profiling 单独执行，不计入以下验收数字。

| 规则数 | 优化前 median（两批，ms） | 优化后 median（两批，ms） | 优化前 p95（两批，ms） | 优化后 p95（两批，ms） |
| --- | --- | --- | --- | --- |
| 1,000 | 0.3683／0.3649 | 0.1370／0.1367 | 0.3983／0.4447 | 0.3256／0.2998 |
| 2,000 | 0.6948／0.7182 | 0.2410／0.2416 | 0.7945／0.7780 | 0.2681／0.3000 |
| 5,000 | 1.7727／1.7707 | 0.5762／0.5871 | 1.8624／1.8688 | 0.6469／0.7009 |

`CI=1 pnpm --filter @weapp-tailwindcss/postcss test --update=none`：1,223 项通过，3 项原有跳过；包构建及类型检查通过。原始 CPU profile、tarball、脚本、逐样本数据保留在本任务 `.tmp/demo-cost/`。第一次优化后探索采样与单测重叠，不作为上述对照证据；正式两批在单测完成后串行执行。

`CI=1 pnpm perf:synthetic:guard -- --suite postcss --runs 21 --warmups 5 --out-dir .tmp/demo-cost/hash-synthetic`：全部 PostCSS 场景通过既有预算，无违规。`CI=1 node scripts/ci/demo-matrix/run.mjs weapp-vite-tailwindcss-v4:weapp --build-only`：真实框架产物断言通过，不更新 static 基线。

## 适用边界

这是源码包的缓存命中微基准收益，不代表 npm 稳定版周报，也不代表完整框架安装、构建或 HMR 的改善比例。正式云端门禁和真实框架回归仍需在最终提交验证；不修改周报版本或自动冻结预算。

## 规则评估

不新增规则。继续执行已有的 profile、语义回归、打包产物对照和预算显式更新约束。
