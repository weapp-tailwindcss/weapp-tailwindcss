---
status: partial
issue: https://github.com/icelib/repoctl/pull/1121
baseline: 2459d6381d9ccc10085a36eb872834d1084b0aee
regressions:
  - packages/weapp-tailwindcss/test/ci/release-nightly/installation/install.test.ts
  - packages/weapp-tailwindcss/test/ci/release-nightly/installation/missing-version.test.ts
  - packages/weapp-tailwindcss/test/ci/release-nightly/consumer.test.ts
---

# Nightly 跨 runner 安装可见性

## 症状

nightly 的发布回执已经确认，后续平台消费者仍可能从另一个 registry 缓存获得缺少新版本的 packument，导致单次 `pnpm install` 报 `ERR_PNPM_NO_MATCHING_VERSION`。直接重跑失败 job 会增加 run attempt，旧发布回执不满足本轮身份检查，不能把它当作同批恢复手段。

## 根因与纠正

发布确认和另一台 runner 的依赖安装是不同的可见性边界。消费者在原有 `requirePublication` 校验之后，仅对该回执列出的精确 `name@version` 做有界安装重试，不接受 `snapshot-nightly` 标签、范围或批次外依赖。

错误判定读取 pnpm NDJSON，验证公开 npm 地址、错误码、精确目标、嵌套字段一致性和父依赖上下文。认证、网络、完整性、未知或混合错误，以及超时、终止和输出溢出均立即失败。重试最多六次，共用五分钟总预算，每条安装命令最多两分钟，退避也计入预算。

每次安装使用消费者目录内的新 store、state、cache 与空 npm 配置，不继承发布认证。仅在已确认可重试时删除本消费者的部分 `node_modules`、锁文件和该次状态目录；最终失败保留现场。每次输出及进程状态写入现有 `nightly-consumer-reports` artifact 目录。上传流程、源码 SHA/ref、run-attempt 回执及安装后的身份、二进制摘要与 ABI 校验保持原有边界。

## 验证

2026-10-27，在 macOS arm64、Node 24.22.1、pnpm 12.14.0、Vitest 5.0.5 下，以基线加未提交修复执行：

```sh
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/release-nightly --update=none --coverage.enabled=false
pnpm exec eslint scripts/release-nightly/consumer.mjs scripts/release-nightly/installation
pnpm agents:check
git diff --check
```

定向 nightly 回归为 6 文件、98 测试通过，覆盖直接和传递依赖、npm alias、批次外目标、异常输出、安装清理、诊断、次数与总时间限制。仓库 ESLint 全局忽略 `test/**`，脚本按现有 lint 范围校验，不为本次测试修改忽略配置。

另在 `os.tmpdir()` 的隔离目录真实执行 pnpm：空依赖安装成功；公开 registry 上不存在的 `repoctl@0.0.0-snapshot.nightly.missingprobe` 返回结构化缺版本错误，单次上限内准确分类并保留诊断。探针使用合成回执，仅证明 CLI 输出与分类协议，不能作为已发布 nightly 或平台 ABI 验收。临时目录在 `finally` 删除。

## 适用边界

只处理本轮准确源码和 attempt 的已确认批次，消费者验证仍必须使用生产发布回执。没有实际重发任何包，也没有放宽历史回执复用。Windows、Linux 原机以及完整远端原生消费矩阵尚未执行，因此记录保持 `partial`。

## 规则评估

不新增 AGENTS 规则。通过安装边界的持久回归约束重试条件，保持现有身份与发布规则。
