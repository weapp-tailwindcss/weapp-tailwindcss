---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1218
baseline: aba52286affff0dce791fb99796ea657c312b281
regressions:
  - packages/weapp-tailwindcss/test/ci/verify-packed-packages.test.ts
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
---

# Engine 迁入后的 CI 接入检查

## 症状

新包的定向引擎测试和构建通过，但 Package README Quality 报告缺少 `packages/engine/README.zh-CN.md`；发布包清单测试仍预期 27 个公开包，实际已增加到 28 个。

当前基线的 PR 单测分片 1 有 2047 项通过、14 项既有跳过，随后 RSS 增量门槛失败：4772 MB 超过 4608 MB。首次迁移提交中分片 1 和 2 分别记录 4674 MB、5364 MB 的增量，不能将重复超限视为单次测量噪声。

## 根因与纠正

迁移新增了独立发布包，却遗漏了仓库级文档协议和发布清单断言。将原中文内容放入 `README.zh-CN.md`，补充英文 README 和标准语言切换；更新公开包数量，并明确断言 `@weapp-tailwindcss/engine` 被 repoctl 发现。

PR 单测步骤继承根 Vitest 最多 4 个 worker；每个 worker 的构建器及子进程共同计入进程树 RSS。将该步骤显式限制为 2 个 worker，减少同时驻留的构建器实例，保留全部 3 个分片和原有 RSS 峰值/增量门槛，并显式禁止更新快照。是否解决远端内存超限须以新 head 的完整单测分片结果确认。

## 验证

- `pnpm docs:packages:check`：修复前复现缺少中文 README，修复后通过全部 28 个公开包的双语检查。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/verify-packed-packages.test.ts --update=none`：修复前 1 项失败，修复后 3 项通过。
- 新增工作流契约测试先复现缺少并发上限；`CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/workflows.test.ts test/ci/verify-packed-packages.test.ts --maxWorkers=2 --update=none` 修复后 47 项通过，验证分片、内存门槛、快照策略和失败传播仍然有效。
- 本轮内存失败：[PR 单测分片 1](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/35413338483/job/105818532200)。
- 原始失败：[README 检查](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/35413338361)、[发布清单测试](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/35345794127)。前者对应本轮基线，后者为首次迁移提交；发布清单失败已在本轮基线本地重新复现。
- 当前 head 的远端完整验收仍在跟进，本记录不以历史 run 代替新提交的验证。

## 适用边界

这是新 workspace 包的工程接入遗漏，未改变引擎生成行为、测试门槛或 demo/static 基线。

## 规则评估

不新增 AGENTS 规则。现有 README 检查和发布包清单测试能够拦截问题，新增发布包时应同时执行这两个现有入口。
