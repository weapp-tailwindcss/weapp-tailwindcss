---
sidebar: aiSidebar
audience: maintainer
title: LLM 友好文档 (llms.txt)
description: LLM 友好文档 (llms.txt)，覆盖 AI 工作流、提示词和工程化实践。
keywords:
  - AI 编程
  - LLM
  - 工作流
  - 友好文档
  - llms.txt
  - ai
  - llms
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - uni-app
  - taro
  - mpx
---

# LLM 友好文档 (llms.txt)

## 生成方式

:::warning 仅供仓库维护者
本节描述文档站生成流程，不是使用 `weapp-tailwindcss` 的项目构建步骤。
:::

1. 在仓库根目录执行 `pnpm --filter @weapp-tailwindcss/website build`（或 `cd website && pnpm build`）。
2. 构建后，`website/build/` 会生成：
- `llms.txt`（索引）
- `llms-full.txt`（完整内容）
- `llms-index.json`（当前产品、接入、API、迁移与排障的主索引）
- `llms-index-full.json`（包含博客、AI 基础与历史文章的完整索引）
   - `llms-quickstart.txt`（上手/AI 工作流）
   - `llms-api.txt`（配置、API、迁移与问题）
   - 去除 MDX import 的纯 Markdown 文件，方便直接喂给模型。

## 线上地址

- `https://tw.weapp.dev/llms.txt`
- `https://tw.weapp.dev/llms-full.txt`
- `https://tw.weapp.dev/zh-cn/llms-index.json`
- `https://tw.weapp.dev/zh-cn/llms-index-full.json`
- `https://tw.weapp.dev/llms-quickstart.txt`
- `https://tw.weapp.dev/llms-api.txt`

中文资产统一位于 `/zh-cn`，英文资产位于站点根路径。

## 给 AI 的示例提示词

> 你可以从 https://tw.weapp.dev/llms-quickstart.txt 和 https://tw.weapp.dev/llms-api.txt 读取 weapp-tailwindcss 的入门与配置说明，回答时请引用相关链接。

## 离线使用

- 下载 `llms-full.txt` 直接给模型。
- 或将生成阶段的 Markdown 文件整体打包后供模型上下文检索。
