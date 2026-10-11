---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss
baseline: 712e9647507a76799ea6abe98c7f29fea5af60e3
regressions:
  - e2e/package-homepages.test.ts
---

# 发布包主页路由与清单同步

## 症状

本地全面检查在包主页验证阶段失败：cn 与 merge 的主页返回 HTTP 404，engine 与 source-scan 被报告为缺少预期主页登记。

## 根因与纠正

merge 概览文档的文件名为 overview.mdx，但 frontmatter 显式声明 slug 为 /community/merge。两个运行时包与校验脚本按文件名填写 URL，导致错误链接同时通过本地静态映射。engine 和 source-scan 新增公开发布后也未同步校验清单。

将 cn、merge 的包元数据和校验映射同步到文档实际路由，并登记两个公开包已有的站点根主页。新增回归通过真实脚本检查公开包清单完整性，并解析文档 YAML frontmatter，独立核对两个运行时包的主页路由。

## 验证

- 修复前三项新增回归均失败，分别复现清单遗漏和两个错误路由。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/package-homepages.test.ts --update=none`：三项通过。
- `pnpm check:package-homepages`：29 个公开包的元数据和远程 HTTP 200 检查通过。
- 修改的脚本、回归测试和包元数据通过定向 ESLint。

## 适用边界

本次修复只涉及发布元数据与校验覆盖，不改变运行时 API 或样式输出。静态回归不依赖网络，远程可达性由原主页检查命令继续验证；以上结果不代表全仓或跨端业务验收通过。

## 规则评估

不新增 AGENTS 规则。用文档路由与公开包清单的持久回归避免映射表与包元数据同时写错。
