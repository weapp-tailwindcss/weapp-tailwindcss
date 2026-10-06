---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 7142a7a5a00072b840e7af011fa82dbdcebe7027
regressions:
  - e2e/native-session-persistent.test.ts
  - e2e/native-session-registry.test.ts
  - e2e/preflight-native-registry.test.ts
  - e2e/native-visual-init.test.ts
---

# 原生会话阻塞必须跨进程保留

## 症状

旧实现把恢复资料与 `blocked.json` 写在单次随机会话目录，并只在当前对象内保存 `blocked`。新增临时文件回归先模拟停止未知、冻结源码，再使用不同证据目录、平台和版本创建第二个恢复对象。基线实现执行第二次写入成功，测试以 “promise resolved instead of rejecting” 失败；这证明新实例可以绕过前一个对象的冻结状态。

历史 Harmony 诊断没有 native 停止完成回执，本次没有据此推断目前仍有活动 PID、冻结账本或残留 alias，也没有把旧日志自动转换成已解除状态。

## 根因与纠正

稳定登记放在 Git common dir 的 `weapp-tailwindcss-native-sessions/v1` 中。关联 worktree 共享存储；安装 CLI 的真实路径、host、机器名和操作系统共同确定原子领取位置，登记保存真实项目根、会话身份、PID 与证据目录。平台、HBuilderX 版本、运行 UUID 和报告位置不参与锁的划分，同一 host 换项目也不能绕过。

预检只读登记，在项目查询和平台工具探针之前拒绝未解除状态。原生恢复入口仍强制原子领取，不能仅依赖预检以免竞争。登记缺失、损坏、未知 schema、死 owner、非 Git 项目或不可解析/不可写的存储均明确阻断，不回退到另一个临时目录；初次尚无登记目录时的只读检查不会创建它。

未知停止保留登记与原有备份，写阻塞记录失败也不会释放。正常结束必须核对自己的会话身份；不删除他人记录，不通过 PID 死亡、固定等待、版本切换或重跑自动解除。初始化尚未修改源码或启动原生任务时失败，可以释放自己的领取。

视觉入口的多个样式变体共享一个登记，单个变体成功清理不提前释放；整个作用域结束才 `finish()`。停止、恢复或资源释放失败会阻断后续变体，不能被后一次清理覆盖。HMR `restarted` 等验收断言仍报告失败，但清理全部成功时允许正常释放，避免把质量断言误判成资源停止未知。

## 验证

基线单项红灯已实际复现；定向回归使用临时 `.git`、假安装文件与 mock 进程，覆盖跨实例、真正独立 Node/tsx 子进程、并发领取、关联 worktree、符号链接、不同 host、归属改变、损坏记录、正常多变体生命周期，以及 POSIX/Windows 路径。目录别名在 Windows 使用 junction，避免依赖创建文件符号链接的管理员权限。

```bash
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/native-session-persistent.test.ts e2e/native-session-registry.test.ts e2e/preflight-native-registry.test.ts e2e/native-visual-init.test.ts e2e/hbuilderx-native-session.test.ts e2e/hbuilderx-app-process-cleanup.test.ts e2e/app-visual-lifecycle.test.ts e2e/preflight-probes.test.ts e2e/hbuilderx-alias-consumers.test.ts --update=none
pnpm agents:check
```

最终 9 个文件、119 项回归全部通过，无失败或跳过。登记/恢复核心模块及直接回归的严格 TypeScript 检查通过（含 `exactOptionalPropertyTypes` 与 `noUncheckedIndexedAccess`）；修改的 TypeScript 文件通过 ESLint，明确禁用 Prettier 规则。规则校验和 `git diff --check` 通过。没有运行 IDE 或设备，也没有改 demo、样式输出和 static 基线；当前实际环境预检与设备验收由主任务记录，不把这些临时夹具结果描述为真实端验收。

## 适用边界

保护范围仅是共享同一 Git common dir 的仓库脚本请求，不控制独立 clone、其他仓库或人工 IDE 操作。注册表不存在或正常释放不等于厂商 native idle 证明。本次没有增加 force/skip 或历史未决证据的自动解除接口；厂商停止边界仍见[取消复盘](harmony-cancel-alias-boundary.md)。

## 规则评估

不新增或放宽 AGENTS 规则。通过稳定登记与消费者回归落实已有停止边界、资源归属和失败停止调度要求。私有工程脚本行为没有改变公开包，不新增 change intent。
