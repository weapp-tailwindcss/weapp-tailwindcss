---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1306
baseline: 1cf98d350d6f2a39a7cc74ec5ee208e641308d94
regressions:
  - website/scripts/seo-geo.test.mjs
---

# GEO 索引漏同步阻断版本 PR 重生成

## 症状

版本 PR #1306 停留在旧 main 上并产生冲突。[Release 41610805705](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41610805705/job/125843080733) 完成 verify 内部检查后，源码干净检查发现 `website/static/llms-index.json` 和 `website/static/llms-index-full.json` 被改写，拒绝执行 prepare；因此不是等待普通 PR CI 成功就能更新版本分支。

## 根因与纠正

Skyline 文档已新增两个标题，但中文 primary/full GEO 索引没有同步。站点构建会调用 `generate-geo-index.mjs` 补齐索引；普通 SEO 工作流此前没有在生成前比较已提交内容，因此可能构建成功，却把漏提交留给 Release 守卫发现。

生成器的 `writeStableJson` 已忽略单纯的 `generatedAt` 变化，本次差异是文档内容变化，不能通过忽略脏文件或删除 Release 守卫处理。运行 `pnpm --filter @weapp-tailwindcss/website geo:index` 同步基线；英文两份未变化，中文两份仅补齐标题并更新生成时间。

新增四种语言/层级的只读回归，沿用基线生成时间，与当前文档生成的完整 payload 比较。SEO 工作流在站点构建前运行这组回归，使漏同步在生成器覆盖基线前失败，并提示正确同步命令。

## 验证

- 旧基线上新增回归得到中文两项失败，英文两项通过。
- 同步后 `CI=1 pnpm --filter @weapp-tailwindcss/website exec vitest run scripts/seo-geo.test.mjs scripts/write-stable-json.test.mjs --update=none`：21 项通过。
- `CI=1 pnpm --filter @weapp-tailwindcss/website build`：中英文构建通过。
- 三份发布工作流定向回归：97 项通过。
- 再次执行 `geo:index`，四份文件的 SHA-256 全部保持不变。

## 适用边界

本次没有修改公开包、demo 或样式输出，不新增包发布 intent；生成基线属于站点内容索引。

修复须先经源码 PR 合入 main，再由自动 prepare 重新生成 `release/pnpm-version`。不得直接修改生成分支，不能批准仍未包含当前 main 的旧验收 run，也不能把本地通过当作版本 PR 完整 CI 成功。

## 规则评估

沿用已有生成基线、准确 head 验收及受管发布分支规则，通过持久回归和前置检查补齐执行缺口，不新增跳过门禁的例外。
