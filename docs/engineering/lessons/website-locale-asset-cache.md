---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 5bb39ab3ab0b9c0a7a1c7e5507bef4adc09a3729
regressions:
  - website/scripts/deployment-verification.test.ts
  - website/scripts/deployment-assets.test.ts
---

# 双语静态资源缓存边界

## 症状

2026-10-27 只读核对线上响应时，英文 `/assets/css/styles.be6301da.css` 返回 `public, max-age=31536000, immutable`，中文 `/zh-cn/assets/css/styles.d8203b5c.css` 返回 `public, max-age=0, must-revalidate`。部署验证虽然对中文资源计算 SHA-256，仍放行缺失或错误的缓存头。

## 根因与纠正

production 和 next 的根 `_headers` 仅声明 `/assets/*`，无法匹配带语言前缀的中文资源。验证器也只检查该根前缀，使规则缺口未被验收发现。

两个部署目标均补充 `/zh-cn/assets/*` 的相同 immutable 策略。验证器通过现有 `siteLocales` 与 `getLocalePrefix` 契约识别每个语言的资源目录，避免缓存校验与资源发现使用不同的语言边界。社交图片保留原有哈希验证，next 全站禁止索引策略继续由独立通配规则覆盖。

## 验证

环境为 macOS arm64、Node 24.22.1、pnpm 12.14.0、Vitest 5.0.5、Wrangler 4.151.0。被测内容为基线加本轮未提交修复。

新增 production/next 中文资源缺少缓存头和错误缓存头共四条回归，旧实现全部出现“promise resolved instead of rejecting”，修复后部署门禁的 8 文件、62 测试通过；修改文件 ESLint 与网站 TypeScript 检查通过。

```sh
pnpm --filter @weapp-tailwindcss/website exec vitest run scripts/docs-deployment.test.ts scripts/docs-next-deployment.test.ts scripts/deploy-docs-cloudflare.test.mjs scripts/deployment-verification-options.test.ts scripts/deployment-indexing-policy.test.ts scripts/deployment-assets.test.ts scripts/deployment-verification.test.ts scripts/metadata-environment.test.ts --update=none
pnpm exec eslint website/scripts/deployment-verification.ts website/scripts/deployment-verification.test.ts
pnpm --filter @weapp-tailwindcss/website typecheck
SITE_URL=https://tw.weapp.dev pnpm --filter @weapp-tailwindcss/website build
pnpm --filter @weapp-tailwindcss/website test:worker
pnpm --filter @weapp-tailwindcss/website deploy:worker:dry-run
pnpm --filter @weapp-tailwindcss/website build:next
pnpm --filter @weapp-tailwindcss/website test:worker -- --target next
pnpm --filter @weapp-tailwindcss/website deploy:worker:next:dry-run
```

production 和 next 均完成双语构建、本地 Worker 完整资源、metadata、索引、路由、缓存及哈希检查；dry-run 分别读取 1553 和 1551 文件后退出。首次构建因定向依赖安装缺少 Lynx 文档检查所需包而阻断，补齐离线 frozen 安装后原命令通过，没有跳过质量门禁。

next 构建改写的四份机器索引仅包含站点域名和生成时间变化，核对后恢复原有源码字节，不将临时构建输出混入修复。两轮本地 Worker 均正常收尾，进程复查确认本任务工作树无遗留 Wrangler/workerd。

## 适用边界

仅修正文档静态资源缓存与部署验收。未执行线上部署，也不以本地 Worker 结果宣称线上资源已更新。两个目标依次构建，避免共用的 `build` 目录交叉覆盖；本地 Worker 通过既有 `finally` 生命周期关闭，并复查本任务没有遗留 Wrangler/workerd 进程。

## 规则评估

不新增 AGENTS 规则。通过 locale 契约与持久回归统一发现和验收边界，已有工作流继续运行本地 Worker 验证。
