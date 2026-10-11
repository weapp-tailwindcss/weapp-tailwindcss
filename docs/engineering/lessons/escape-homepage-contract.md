---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 3f57cdab2818bb409233a31535b475e0ba9fc333
regressions:
  - e2e/package-homepages.test.ts
---

# escape 迁入后的主页契约同步

## 症状

本轮完整扩展流程 `35635ddb` 在 static 阶段报告 `packages/escape/package.json is public but missing an expected homepage entry`。首个失败记录保留在主工作树的 `.tmp/full-regression-35635ddb.log`。在同一提交的独立工作树重跑既有主页回归，复现 1 项失败、2 项通过。

## 根因与纠正

`@weapp-tailwindcss/escape` 迁入后未同步公开包主页清单，manifest 也仍指向带 `#readme` 的 GitHub 链接。校验器遇到缺少登记就停止检查该包，因此首次错误暂时遮住了域名及片段与统一文档站约定不符的问题。仅添加清单项不能完成修复。

文档站没有独立的 escape 页面。本次沿用 engine、shared 和 source-scan 等基础包的入口：将 escape 的主页设为 `https://tw.weapp.dev`，在清单登记根路由 `/`。保留原有统一域名、无查询及片段、直接 HTTP 200 的校验规则，并为发布元数据补充中文 patch intent。

## 验证

- 修复前后执行 `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/package-homepages.test.ts --update=none`：由 1 项失败、2 项通过变为 3 项全部通过。既有真实脚本回归同时检查公开包清单与 manifest，继续承担持久验收。
- `CI=1 pnpm check:package-homepages`：30 个公开包的主页元数据与远程 HTTP 200 检查通过。
- `pnpm exec eslint --no-ignore packages/escape/package.json scripts/verify-package-homepages.mjs` 和 `git diff --check` 通过。
- `pnpm agents:check`：0 错误。
- 使用本地 YAML 解析器确认新增 intent 仅登记 `@weapp-tailwindcss/escape: patch`，摘要为中文，manifest 使用规范主页。
- `CI=1 pnpm release status` 未完成：请求 `https://registry.npmjs.org/tailwindcss-core-plugins-extractor` 超时并返回非零。保留这次外部失败，不将本地 intent 解析写成完整发布计划通过，也不反复重试或发布。

## 适用边界

这次只修复公开包元数据及校验登记，不改变转义 API、构建产物或样式输出，无需更新 static 产物基线。以上定向检查不代表完整扩展流程已经通过，也没有发布 npm 包。

## 规则评估

不新增 AGENTS 规则。现有主页契约已准确捕获迁入遗漏，修复保持该检查的完整公开包覆盖；参考此前的[主页路由与清单同步复盘](package-homepage-routes.md)。
