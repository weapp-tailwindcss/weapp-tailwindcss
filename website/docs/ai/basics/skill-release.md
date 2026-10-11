---
sidebar: aiSidebar
title: Skill 发布与同步
description: 说明 weapp-tailwindcss 官方 Skill 从源仓库到聚合安装仓库的验证与同步流程。
keywords:
  - Skill
  - 发布
  - 同步
  - sonofmagic/skills
  - weapp-tailwindcss
  - AI 编程
  - 工作流
  - 小程序
---

# Skill 发布与同步

`weapp-tailwindcss/weapp-tailwindcss` 的 `skills/` 是官方 Skill 内容的唯一事实源。用户安装使用的 `sonofmagic/skills` 是聚合仓库，不在这里手工维护副本。

## 同步关系

```text
weapp-tailwindcss/weapp-tailwindcss@main:skills/
  -> sonofmagic/skills@main:skills/weapp-tailwindcss/
```

聚合仓库的 `Sync Skills From Upstreams` workflow 根据 `.github/skills-sources.json` 定时拉取整个 `skills/` 目录。新增、删除或重命名 Skill 时不需要直接提交聚合仓库。

## 发布前检查

1. 校验目录、frontmatter、references、UI 元数据和触发用例：

```bash
pnpm skills:validate
```

2. 使用官方 skill validator 逐个校验目录。
3. 本地检查可发现的名称：

```bash
npx skills add . --list
```

4. 临时安装完整套件，确认每个 `--skill` 名称有效。
5. 用正向、相邻边界和负向提示词做独立前向测试。
6. 同步 README、AI 首页、Skill 页面与 LLM 入口后构建 website。

## 发布流程

1. 在本仓库提交 `skills/**`、验证语料和文档入口。
2. 合并到 `main`。
3. 等待聚合仓库定时同步，或在需要立即发布时手动运行聚合仓库的 `Sync Skills From Upstreams` workflow。
4. 检查同步提交是否包含 8 个 Skill 目录。
5. 从 `sonofmagic/skills` 执行 `--list` 和临时安装验证。

Skill 不再使用独立 `skill-weapp-tailwindcss-v*` tag 或 GitHub Release 作为内容分发机制。版本历史以源仓库提交和聚合仓库同步提交为准。

## 用户安装命令

文档中的完整套件命令保持一致：

```bash
npx skills add sonofmagic/skills \
  --skill weapp-tailwindcss \
  --skill weapp-tailwindcss-setup \
  --skill weapp-tailwindcss-migrate \
  --skill weapp-tailwindcss-troubleshoot \
  --skill weapp-tailwindcss-runtime \
  --skill weapp-tailwindcss-custom-build \
  --skill weapp-tailwindcss-react-native \
  --skill weapp-tailwindcss-lynx \
  -y
```

不要对聚合仓库使用 `--all` 代替该命令，因为聚合仓库还包含其他项目的 Skill。
