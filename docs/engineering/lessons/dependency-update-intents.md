---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/commit/a2f6080a835e0441de511a9cd1c53bc4c65836cd
baseline: a2f6080a835e0441de511a9cd1c53bc4c65836cd
regressions:
  - packages/test-helper/test/update-packages/snapshot.test.ts
  - packages/test-helper/test/update-packages/runner.test.ts
---

# 依赖更新自动累积变更记录

## 症状

`pnpm up:pkg` 与 `pnpm up:pkg:latest` 原先只调用代理脚本更新依赖，更新后没有发布包的 change intent。仅比较 package.json 还会遗漏 catalog 或锁定版本变化；复用固定文件名则可能覆盖之前的说明。

## 根因与纠正

两个入口改为调用 `scripts/update-packages.ts`，继续通过原代理脚本执行更新，保留交互、参数、过滤项及退出状态。只比较本次命令前后的依赖状态，不使用相对 Git HEAD 的累计 diff。

扫描遵守 workspace glob，仅为 packages 和 packages-runtime 下的非 private 包生成记录。四类直接依赖的声明、catalog 范围和 importer 锁定结果都参与比较；自动安装的 peer 从 importer 的 dependencies/devDependencies 获取锁定结果。间接消费者由现有发布链路处理。

当前 pnpm 12 锁文件包含多个 YAML 文档，需排除 packageManagerDependencies/configDependencies 所在的工具链文档。workspace 发现使用 repoctl，并在每次快照前清理其发现缓存；根路径先解析为真实路径，避免 macOS 临时目录别名与包目录的真实路径不一致而漏包。

每次有效更新在 `.changeset` 新增独立中文 patch 记录。文件名使用随机标识，排他创建；碰撞最多重试十次，已有记录始终保持不变。没有依赖变化、只更新 demo/private 包、更新失败或取消时不生成记录。更新成功后记录失败返回非零，并提示依赖可能已经更新，需要检查并补充记录。

## 验证

在独立 worktree 中使用 Node 26.5.0、pnpm 12.5.1、Vitest 5.0.1 完成定向验证：

- `CI=1 pnpm --filter @weapp-tailwindcss/test-helper exec vitest run test/update-packages test/pnpm-smart-proxy.test.ts --update=none`：32 项通过，无跳过。
- `pnpm exec eslint scripts/update-packages.ts scripts/update-packages/snapshot.ts scripts/update-packages/intent.ts package.json`：通过，只读检查。
- `pnpm exec tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ESNext --module ESNext --moduleResolution Bundler --esModuleInterop --types node --exactOptionalPropertyTypes --noUncheckedIndexedAccess --noPropertyAccessFromIndexSignature scripts/update-packages.ts packages/test-helper/test/update-packages/snapshot.test.ts packages/test-helper/test/update-packages/runner.test.ts`：通过。
- `pnpm agents:check` 与 `git diff --check`：通过。

回归使用临时 workspace 和真实 Node 子进程执行两种更新模式；独立运行脚本的 `--help` 验证入口及原代理链路。发布计划调用 pnpm 原生的 `change status` 子命令，由本地 HTTP registry 提供固定已发布版本：两个 patch 合并为一次 `1.0.0 → 1.0.1`，手工 minor/major 分别保留为 `1.1.0` / `2.0.0`。这里的已发布基线来自 registry，单独提供 ledger 不能替代它。

## 适用边界

本次只验证依赖更新编排和 intent 兼容性，没有批量升级仓库真实依赖，也没有执行发布、全仓测试或多端 E2E。Windows/POSIX 路径通过纯函数回归覆盖；实际子进程执行环境为 macOS，未在 Windows/Linux 主机运行。

记录的累积不等于连续增加版本号；最高 bump、fixed group 与 workspace 版本联动沿用现有 pnpm/repoctl 发布配置。仅间接依赖 snapshot 变化不计入本次直接依赖判定。回滚自动记录时只删除本次输出的文件，依赖更新结果需要独立审查。

## 规则评估

不新增规则。现有独立 worktree、跨平台路径、中文 intent 和定向回归要求已覆盖本次变更；工程脚本本身不触发无关公开包版本提升。
