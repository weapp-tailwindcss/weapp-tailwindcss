---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1266
baseline: a8796e2728743068e725d8505d1cd1660c2f1e76
regressions:
  - website/scripts/docs-deployment.test.ts
  - website/scripts/deploy-docs-cloudflare.test.mjs
---

# Cloudflare 构建额度与 Actions 部署

## 症状

Cloudflare Builds 构建额度耗尽后，网站旧版本仍可访问，但不能据 HTTP 200 推断新仓库可以持续部署。原 GitHub 文档工作流只执行 dry-run，组织中的部署密钥并未被消费。

## 根因与纠正

将生产构建迁至 GitHub runner，完成文档和 Worker 检查后由 Wrangler 直接上传。生产 Worker 和域名保持原样；Cloudflare GitHub App 不再是部署依赖。

仓库中同名 Secret 会覆盖组织 Secret。维护者确认统一使用组织配置后，回读组织可见性为 all，再删除仓库两项旧 Secret 并验证名称清单。

生产部署仅接受目标仓库的最新 main，固定并发组串行运行且不取消进行中的上传。缺少凭据、读取远端失败或质量检查失败都阻止上传，PR 和预览 Worker 不部署。

## 验证

部署回归先证明旧工作流没有 main 推送部署，再验证 18 项部署条件与兼容测试通过；另有现有 CI/发布回归 67 项、Actions 配置校验和 TypeScript ESLint 通过。操作步骤和最终构建证据以 [迁移记录](../organization-transfer.md) 与 [网站说明](../../../website/README.md) 为准。

## 适用边界

首次真实 Actions 上传、当前构建哈希验收尚未完成，PR 仍需正常审核。Builds API 对本机 OAuth 返回 403，必须由维护者确认生产及预览自动构建均已停用；额度耗尽不代表触发器已删除。

上传后验收失败时先停止后续 Actions 部署，必要时按日志中的旧 Worker 版本回退；不能通过恢复 Connected Builds 解决权限或内容问题。

## 规则评估

不新增 AGENTS 规则。部署权限、触发条件及凭据边界通过专用回归固化，继续遵守现有本地验证、分支保护和发布隔离规则。
