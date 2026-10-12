---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1284
baseline: 2c7a9675d64cc3d1921b98fd443861410ad9e5fb
regressions:
  - packages/weapp-tailwindcss/test/ci/release-stage-source.test.ts
  - packages/weapp-tailwindcss/test/ci/release-stage.test.ts
  - packages/weapp-tailwindcss/test/ci/repoctl-stages.test.ts
  - website/scripts/seo-geo.test.mjs
  - website/scripts/write-stable-json.test.mjs
---

# 版本准备混入网站验证产物

## 症状

[Release 38230978397](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38230978397) attempt 1 在准确 main `2c7a9675d64cc3d1921b98fd443861410ad9e5fb` 完成八平台 native、Verify、freshness 和 Prepare，生成版本 head `7189af46517a4020d4e1c6d84feed1878734e805`。

[Version PR CI 的绑定 job](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38235147701/job/114763876812) 拒绝“当前 PR 不符合纯版本元数据契约”。该 head 包含当前 main，compare 为 ahead 1 / behind 0；失败发生在环境审批前，不能用普通 PR 检查或历史 head 的成功替代完整版本验收。

49 个变更文件中，47 个是合法版本元数据；另外两个是 `website/static/en/llms-index.json` 和 `llms-index-full.json`。它们更新 `generatedAt`，并给英文 `CreateCompilerOptions` 的 headings 增加 `cssOptions?`。三个 intent、首发 env、固定版本组及 ledger 均合法。

## 根因与纠正

main 已包含英文 API 文档的新标题，但对应 GEO 索引未同步。Verify 默认质量脚本执行网站构建，生成器发现真实内容差异后重写受跟踪索引。稳定 JSON 写入器会忽略时间戳比较，因此本轮不是纯时间戳漂移。

repoctl 5.10.0 的 prepare 与 verify 共用工作目录；verify 结束时 receipt 绑定包含生成改动的状态，prepare 随后执行 `git add -A`。日志明确记录 GEO 索引生成以及两文件进入版本提交。事后恢复文件会使 receipt 失效，不能改写 receipt 或跨 run 复用验证授权。

在源码 PR 中重新生成并提交两个英文索引，使后续构建保持幂等。独立 release driver 在 verify 和 prepare 启动前要求无未提交文件；verify 实际成功后再核对 HEAD、工作区、index 和非忽略的新文件。任何变化明确失败并保留原文件，阻断后续版本提交。忽略的构建产物、native 证据和 `.git` 内本轮 receipt 保留。

分类器继续拒绝源码资源进入受管版本 PR。修复先落 main，再自动 prepare；不直接修改受管分支，不通过索引白名单、自动恢复、降低验证范围或审批旧 head 放行。

## 验证

本地 macOS、Node 24.18.0、pnpm 12.9.1，以上述 baseline 加本轮未提交修复执行定向验证。新增十项真实 Git/子进程回归，旧实现八项失败；修复后包含阶段身份、官方 repoctl receipt 与工作流回归的四文件 72 项通过。覆盖受跟踪文件、暂存文件、未跟踪文件、仅 index 改动、已有用户改动、意外 HEAD 提交、忽略产物和原失败退出码。

```sh
CI=1 pnpm exec vitest run --project=weapp-tailwindcss test/ci/release-stage-source.test.ts test/ci/release-stage.test.ts test/ci/repoctl-stages.test.ts test/ci/release-stages-workflow.test.ts --update=none --coverage.enabled=false
pnpm --filter @weapp-tailwindcss/website geo:index
CI=1 pnpm --filter @weapp-tailwindcss/website exec vitest run --config vitest.config.ts scripts/seo-geo.test.mjs scripts/write-stable-json.test.mjs --update=none --coverage.enabled=false
CI=1 pnpm --filter @weapp-tailwindcss/website build
```

索引生成第一次只更新两个英文基线；第二次四个语言/层级索引全部 unchanged。网站 SEO/GEO 与稳定 JSON 写入回归两文件十项通过，本轮共六文件 82 项。文档站定向构建的英、中文均成功，GEO、redirects、SEO 生成结果 unchanged，构建后无额外受跟踪改动。ESLint、定向 TypeScript、agents:check 与 diff 检查通过。原始绑定、prepare、汇总门禁日志和 compare 保存在任务工作树忽略的 `e2e/.artifacts/pr-1284-ci/38235147701/attempt-1/metadata/`，不能充当新 head 的成功证据。

## 适用边界

这是发布编排和文档索引基线修复，不改变产品样式、包版本或依赖。验证遇到已提交源码的生成基线失配时会明确阻断，需在源码 PR 同步基线后重新执行 plan/verify；不会清理用户文件或篡改本轮 receipt。

尚需源码 PR 的实际 CI、用户 review/合并、最新 main 的自动 prepare、新 head 环境审批及完整版本矩阵。最终四个必需门禁与当前 main freshness 必须全部实际成功，PR #1284 保持开放。本轮未运行本地全面/多端测试、启动浏览器或设备，也未发布 npm。

## 规则评估

根规则已有受管版本分支所有权、准确 head 验收和源码修复先落 main 的边界。新增可执行回归并记录当前失败，不新增 AGENTS 规则，不放宽纯版本契约。
