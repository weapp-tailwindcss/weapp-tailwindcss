---
sidebar: aiSidebar
title: Skill（技能系统）
description: 安装和使用按任务拆分的 weapp-tailwindcss 官方 Skill 套件。
keywords:
  - AI 编程
  - LLM
  - Skill
  - weapp-tailwindcss
  - Tailwind CSS 4
  - 小程序
  - uni-app
  - taro
  - mpx
  - React Native
  - ReactLynx
---

# Skill（技能系统）

`weapp-tailwindcss` 官方 Skill 面向业务项目使用者。它把当前 v5 的接入、迁移、排障和高级能力拆成独立工作流，避免一个大 Skill 同时维护所有框架与 API。

本项目使用 [`vercel-labs/skills`](https://github.com/vercel-labs/skills) 安装 Skill。`weapp-tailwindcss/weapp-tailwindcss` 是内容事实源，`sonofmagic/skills` 是面向用户的聚合安装仓库。

## 安装完整套件

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

只安装兼容协调入口也可以：

```bash
npx skills add sonofmagic/skills --skill weapp-tailwindcss
```

协调入口负责识别任务并推荐专用 Skill；完整实现和参考资料位于各专用 Skill 中。

查看聚合仓库全部可安装内容：

```bash
npx skills add sonofmagic/skills --list
```

## Skill 分工

| Skill | 使用场景 |
| --- | --- |
| `weapp-tailwindcss` | 泛化请求、任务识别、安全基线与兼容入口 |
| `weapp-tailwindcss-setup` | 新接入、框架选型、独立 CLI、Tailwind CSS 4 与多端配置 |
| `weapp-tailwindcss-migrate` | v4 到 v5、旧 patch/CLI/生成插件与环境迁移 |
| `weapp-tailwindcss-troubleshoot` | CLI、样式生成、class 转译、rpx、HMR 和运行端排障 |
| `weapp-tailwindcss-runtime` | 动态 class、merge、cva、variants 与 escape/unescape |
| `weapp-tailwindcss-custom-build` | Core API、自研 bundler、样式注入和分包隔离 |
| `weapp-tailwindcss-react-native` | Expo Metro、Native manifest 和 Android/iOS 运行时 |
| `weapp-tailwindcss-lynx` | ReactLynx、Rspeedy、Lynx 原生 CSS 与 encoder 兼容 |

## 当前共同基线

- 当前主线只维护 Tailwind CSS 4。
- 当前 `weapp-tailwindcss` manifest 要求 Node.js `^22.18.0 || >=24.11.0`；HBuilderX 项目至少使用 5.11。
- 同一次受管构建只由 `WeappTailwindcss` 生成 Tailwind CSS，不叠加官方 Tailwind PostCSS/Vite 生成插件。
- Tailwind 入口使用纯 CSS，必须被项目实际导入；`cssEntries` 使用绝对路径且不能替代构建图导入。
- H5/Web 通常保留插件，由 generator 自动选择 Web target。
- JavaScript class 只转换 Tailwind 验证过的 `classNameSet` 精确候选。
- `@weapp-tailwindcss/cli` 默认输出 Web CSS，`--target weapp` 只转换生成 CSS，不替代完整小程序 bundler。
- React Native 使用 style manifest；ReactLynx 保留 `className` 并输出 Lynx 原生 CSS，两条链路互不替代。

## 本地开发安装

在本仓库根目录执行：

```bash
npx skills add . \
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

## 提示词示例

```text
使用 $weapp-tailwindcss-setup，为新的 uni-app Vue3 Vite 项目配置微信小程序和 H5，给出完整文件与验证步骤。
```

```text
使用 $weapp-tailwindcss-migrate，把仍在运行 weapp-tw patch 和 @tailwindcss/vite 的旧项目迁移到 v5。
```

```text
使用 $weapp-tailwindcss-troubleshoot，定位为什么新加的任意值 class 在第二次 HMR 后不再生成。
```

```text
使用 $weapp-tailwindcss-custom-build，设计基于 weapp-tailwindcss/core 的内存转换和分包样式注入时序。
```

```text
使用 $weapp-tailwindcss-react-native，为 Expo SDK 54 配置 Metro 并验证 manifest warnings。
```

```text
使用 $weapp-tailwindcss-lynx，为 ReactLynx + Rspeedy 配置 Tailwind CSS 4 并检查 encoder warnings。
```

## 维护与验证

源码位于 `skills/<skill-name>/`。每个目录包含 `SKILL.md`、`agents/openai.yaml` 和按需加载的 `references/`。

```bash
pnpm skills:validate
npx skills add . --list
```

发布链路见：[Skill 发布与同步](/docs/ai/basics/skill-release)。
