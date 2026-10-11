---
sidebar: aiSidebar
title: LLMs.txt（LLM 友好文档）
description: LLMs.txt（LLM 友好文档），覆盖 AI 工作流、提示词和工程化实践。
keywords:
  - AI 编程
  - LLM
  - 工作流
  - LLMs.txt
  - 友好文档
  - ai
  - basics
  - llms txt
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - uni-app
  - taro
  - mpx
---

# LLMs.txt（LLM 友好文档）

## 概述

**llms.txt** 是一个项目根目录下的文本文件，用于为**大语言模型（LLM）提供项目上下文**。它类似于 `README.md`，但专门为 AI 工具（如 Claude Code、Cursor、Cline）设计，帮助 AI 更好地理解和操作代码库。

> **核心价值**：让 AI 快速理解项目结构、编码规范、技术栈，提供更精准的帮助

---

## llms.txt 的作用

### 1. 为 AI 提供项目上下文

```
传统方式:
AI: "这个项目是做什么的?"
用户: "这是一个小程序项目..."
AI: "使用什么框架?"
用户: "使用原生小程序..."
AI: "有什么编码规范?"
用户: "......"

有了 llms.txt:
AI 直接读取 llms.txt → 自动了解项目信息 → 精准提供帮助
```

### 2. 与 Claude Code CLAUDE.md 的关系

| 文件 | 目标用户 | 内容侧重 |
| ---- | -------- | -------- |
| **llms.txt** | 通用 LLM | 项目概述、技术栈、快速开始 |
| **CLAUDE.md** | Claude Code 专属 | 详细的工作流、命令、最佳实践 |

### 3. 标准 vs 自定义

```
llms.txt (标准)
├── 通用格式
├── 所有 LLM 都能理解
└── 社区标准

自定义命名
├── .cursorrules (Cursor 专属)
├── .clinerules (Cline 专属)
└── project_context.md (自定义)
```

---

## llms.txt 的标准格式

### 推荐结构

```markdown
# 项目名称

## 项目概述
一句话描述项目

## 技术栈
- 框架: ...
- 语言: ...
- 工具: ...

## 项目结构
简短的目录说明

## 快速开始
如何运行项目

## 编码规范
代码风格要求

## 重要说明
其他需要注意的事项
```

---

## llms.txt 模板

### 完整模板

```markdown
# [项目名称]

## 项目概述
[一句话描述项目是做什么的]

## 技术栈
- **框架**: [使用的主要框架]
- **语言**: [主要编程语言]
- **构建工具**: [如 webpack, vite, gulp]
- **测试框架**: [如 vitest, jest]
- **其他工具**: [其他重要依赖]

## 项目结构
```
src/
├── components/    # 组件目录
├── utils/         # 工具函数
├── pages/         # 页面
└── styles/        # 样式文件
```

## 快速开始

### 安装依赖
```bash
pnpm install
```

### 开发模式
```bash npm2yarn
npm run dev
```

### 构建
```bash npm2yarn
npm run build
```

### 测试
```bash npm2yarn
npm test
```

## 编码规范
- 使用 TypeScript 严格模式
- 组件使用函数式声明
- 文件命名使用 kebab-case
- 遵循 ESLint 规则

## 重要说明
- [特殊约定]
- [注意事项]
- [已知问题]
```

### 小程序项目模板

```markdown
# 小程序项目名称

## 项目概述
一个基于原生小程序框架的 [功能描述] 应用

## 技术栈
- **框架**: 原生小程序 (微信/支付宝/抖音)
- **构建**: gulp + weapp-tailwindcss
- **样式**: TailwindCSS (原子化 CSS)
- **语言**: JavaScript / TypeScript

## 项目结构
```
pages/           # 页面目录
├── index/       # 首页
├── profile/     # 个人中心
components/      # 组件目录
utils/           # 工具函数
styles/          # 全局样式
assets/          # 静态资源
```

## 快速开始
```bash
# 安装依赖
pnpm install

# 开发模式 (微信小程序)
pnpm dev:wechat

# 构建
pnpm build
```

## 编码规范
- 组件命名使用 kebab-case
- 页面命名使用 kebab-case
- 样式使用 TailwindCSS 原子类
- 避免使用 id 选择器

## 重要说明
- 使用 weapp-tailwindcss 进行 CSS 转换
- 图片资源需放在 assets/ 目录
- 遵循小程序开发规范
```

### React 项目模板

```markdown
# React 项目名称

## 项目概述
使用 React + TypeScript 构建的 [项目描述]

## 技术栈
- **框架**: React 18+
- **语言**: TypeScript
- **构建**: Vite
- **状态管理**: Zustand / Redux
- **路由**: React Router
- **UI**: TailwindCSS + shadcn/ui

## 项目结构
```
src/
├── components/    # 通用组件
├── pages/         # 页面组件
├── hooks/         # 自定义 Hooks
├── store/         # 状态管理
├── services/      # API 服务
├── types/         # TypeScript 类型
└── utils/         # 工具函数
```

## 快速开始
```bash
pnpm install
pnpm dev
```

## 编码规范
- 组件使用函数式声明 + hooks
- 使用 TypeScript 类型
- 遵循 ESLint + Prettier 规则
```

---

## AI 工具对 llms.txt 的支持

### 1. Claude Code

Claude Code 会**自动读取**项目根目录的 `llms.txt`：

```
项目根目录/
├── llms.txt          ← AI 自动读取
├── CLAUDE.md         ← Claude Code 专属配置
├── package.json
└── src/
```

### 2. Cursor

Cursor 支持 `llms.txt`，同时也支持 `.cursorrules`：

```diff
+ llms.txt          # 通用 LLM 上下文
+ .cursorrules      # Cursor 特定规则
```

### 3. Cline

Cline（VS Code 插件）读取 `.clinerules` 或 `llms.txt`：

```
项目根目录/
├── .clinerules       ← Cline 配置
├── llms.txt         ← 备用
└── src/
```

### 4. 其他工具

| 工具 | 支持的文件 |
| ---- | ---------- |
| **Roo Code** | `roo-rules.txt` |
| **Continue** | `continue_config.json` |
| **Aider** | `.aider.conf.yml` |

---

## llms.txt 最佳实践

### 1. 保持简洁

```markdown
# ❌ 太详细
本项目是一个复杂的企业级应用，包含......（长篇大论）

# ✅ 简洁明确
电商小程序，包含商品展示、购物车、支付功能
```

### 2. 结构化信息

```markdown
# ✅ 使用列表和代码块

## 技术栈
- React 18
- TypeScript
- TailwindCSS

## 命令
```bash
pnpm dev    # 开发
pnpm build  # 构建
```
```

### 3. 突出重点

```markdown
## 重要约定
1. 所有 API 请求必须经过 services/api.ts
2. 组件必须使用 TypeScript 定义 props
3. 样式只能使用 TailwindCSS 原子类
```

### 4. 保持更新

```markdown
## 最后更新
2025-12-26

## 最近变更
- 迁移到 Vite 6
- 添加 PWA 支持
```

---

## llms.txt 示例

### 示例 1：小程序项目

```markdown
# 小程序商城

## 项目概述
微信小程序商城，支持商品浏览、购物车、微信支付

## 技术栈
- 原生小程序框架
- weapp-tailwindcss (TailwindCSS)
- gulp 构建工具

## 项目结构
```
pages/
├── home/          # 首页
├── category/      # 分类
├── product/       # 商品详情
├── cart/          # 购物车
└── order/         # 订单
components/
├── product-card/  # 商品卡片
├── address-picker/# 地址选择
utils/
├── request.js     # API 封装
└── auth.js        # 登录认证
```

## 快速开始
```bash
pnpm install
pnpm dev:wechat
```

## 编码规范
- 组件命名: kebab-case
- 样式: TailwindCSS 原子类
- 不使用 id 选择器
- 图片路径使用绝对路径

## API 配置
- 基础 URL: `https://api.example.com`
- 需要登录的接口自动带上 token

## 重要说明
- 使用微信登录获取用户信息
- 支付使用微信支付 API
```

### 示例 2：全栈项目

```markdown
# 全栈任务管理系统

## 项目概述
全栈任务管理应用，包含前端、后端和数据库

## 技术栈

### 前端
- React 18 + TypeScript
- Vite
- TailwindCSS + shadcn/ui
- React Query (TanStack Query)

### 后端
- Node.js + Express
- TypeScript
- Prisma ORM
- PostgreSQL

## 项目结构
```
frontend/           # React 前端
├── src/
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   └── services/
backend/            # Node.js 后端
├── src/
│   ├── routes/
│   ├── services/
│   ├── models/
│   └── middleware/
```

## 快速开始
```bash
# 前端
cd frontend && pnpm dev

# 后端
cd backend && pnpm dev

# 数据库
docker-compose up -d postgres
```

## 编码规范
- 前后端都使用 TypeScript
- API 遵循 RESTful 规范
- 组件使用函数式声明
- 使用 ESLint + Prettier

## 环境变量
```
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret
API_URL=http://localhost:3001
```
```

---

## llms.txt 与 CLAUDE.md 的配合

### 推荐的配置结构

```
项目根目录/
├── llms.txt              # AI 通用上下文（所有 LLM）
├── CLAUDE.md             # Claude Code 专属配置
├── .cursorrules          # Cursor 专属规则（可选）
└── .clinerules           # Cline 专属规则（可选）
```

### 内容分工

| 文件 | 内容 |
| ---- | ---- |
| **llms.txt** | 项目概述、技术栈、结构、快速开始 |
| **CLAUDE.md** | Claude 专属工作流、命令、插件配置 |

### llms.txt 示例

```markdown
# 项目名称

## 项目概述
一个 React + Node.js 的全栈应用

## 技术栈
- React 18 + TypeScript
- Node.js + Express
- PostgreSQL

## 快速开始
pnpm install
pnpm dev
```

### CLAUDE.md 示例

```markdown
# Claude Code 配置

## 项目上下文
本项目使用 React + Node.js 全栈架构

## 工作流
1. 新功能先在 frontend/src/ 中创建组件
2. API 变更在 backend/src/routes/ 中修改
3. 运行 pnpm test 验证

## 常用命令
- pnpm dev: 启动开发服务器
- pnpm test: 运行测试
- pnpm lint: 代码检查

## 注意事项
- 前端组件必须使用 TypeScript
- API 路由需要添加认证中间件
```

---

## 参考

### 官方资源

- [llmstxt.org](https://llmstxt.org) - llms.txt 官方网站
- [llms.txt 规范](https://github.com/pydantic/llms.txt)

### 相关文档

- [CLAUDE.md 最佳实践](https://docs.anthropic.com/claude-code/project-knowledge)
- [Cursor Rules](https://cursor.com/docs/rules)

---

**文档更新时间：2025 年 12 月**
