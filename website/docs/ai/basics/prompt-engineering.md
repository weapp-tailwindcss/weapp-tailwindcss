---
sidebar: aiSidebar
title: Prompt Engineering（提示词工程）
description: Prompt Engineering（提示词工程），覆盖 AI 工作流、提示词和工程化实践。
keywords:
  - AI 编程
  - LLM
  - 工作流
  - Prompt
  - Engineering
  - 提示词工程
  - ai
  - basics
  - prompt engineering
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - uni-app
  - taro
---

# Prompt Engineering（提示词工程）

## 概述

**Prompt（提示词）** 是用户输入给大语言模型的**指令或问题**。**Prompt Engineering（提示词工程）** 是设计和优化提示词以获得更好输出结果的技术。

> **核心原则**：好的提示词 = 清晰、具体、有结构

---

## 什么是提示词

### 1. 基本定义

**提示词** 是与 AI 交互的文本输入：

```
用户输入: "帮我写一个快速排序算法"
          ↑
       这就是 Prompt
```

### 2. 提示词的组成部分

```
┌─────────────────────────────────────────────────────────┐
│                    提示词结构                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────┐      │
│  │              角色/身份设定                  │      │
│  │  "你是一个资深前端工程师..."               │      │
│  └──────────────────────────────────────────────┘      │
│                         ↓                               │
│  ┌──────────────────────────────────────────────┐      │
│  │              任务描述                        │      │
│  │  "帮我实现一个登录表单..."                 │      │
│  └──────────────────────────────────────────────┘      │
│                         ↓                               │
│  ┌──────────────────────────────────────────────┐      │
│  │              上下文/背景信息                  │      │
│  │  "使用 React + TypeScript..."               │      │
│  └──────────────────────────────────────────────┘      │
│                         ↓                               │
│  ┌──────────────────────────────────────────────┐      │
│  │              约束/要求                        │      │
│  │  "使用 shadcn/ui 组件，遵循以下规范..."      │      │
│  └──────────────────────────────────────────────┘      │
│                         ↓                               │
│  ┌──────────────────────────────────────────────┐      │
│  │              输出格式                        │      │
│  │  "以 Markdown 格式输出，包含代码块..."     │      │
│  └──────────────────────────────────────────────┘      │
│                         ↓                               │
│  ┌──────────────────────────────────────────────┐      │
│  │              示例/参考                        │      │
│  │  "参考以下代码风格..."                     │      │
│  └──────────────────────────────────────────────┘      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 好的提示词原则

### CREATE 框架

| 原则 | 说明 | 示例 |
| ---- | ---- | ---- |
| **C**lear | 清晰明确 | "用 Python 写一个冒泡排序" |
| **R**ole | 设定角色 | "你是一个资深前端工程师" |
| **E**xact | 精确具体 | "生成 10 个随机整数，范围 1-100" |
| **A**udience | 明确受众 | "向初学者解释闭包的概念" |
| **T**one | 设定语气 | "用专业但友好的语气" |
| **E**xample | 提供示例 | "参考以下代码风格" |

---

## 好的提示词 vs 差的提示词

### 示例 1：代码生成

#### ❌ 差的提示词

```
写一个登录功能
```

**问题**：
- 没有指定技术栈
- 没有说明需求细节
- 没有定义输入输出

#### ✅ 好的提示词

```
你是一个资深前端工程师。请帮我创建一个 React + TypeScript 的登录表单组件：

需求：
1. 包含邮箱和密码输入框
2. 使用 shadcn/ui 组件库
3. 支持表单验证（邮箱格式、密码最少8位）
4. 包含"记住我"复选框
5. 登录按钮在加载时显示 Loading 状态
6. 使用 TypeScript 定义类型

请提供完整的组件代码和类型定义。
```

---

### 示例 2：Bug 修复

#### ❌ 差的提示词

```
这段代码有问题，帮我看看
```

**问题**：
- 没有说明具体问题
- 没有提供错误信息
- 没有说明期望行为

#### ✅ 好的提示词

```
我的 React 组件有问题，需要你帮忙排查：

问题描述：
点击"提交"按钮后，表单没有提交，也没有任何提示

代码：
```tsx
function SubmitForm() {
  const handleSubmit = () => {
    console.log('Form submitted')
  }

  return <button onClick={handleSubmit}>提交</button>
}
```

期望行为：
点击按钮后应该显示"提交成功"的提示

请分析问题并给出修复后的代码。
```

---

### 示例 3：代码重构

#### ❌ 差的提示词

```
优化这段代码
```

**问题**：
- 没有说明优化目标
- 没有说明约束条件
- 没有说明优先级

#### ✅ 好的提示词

```
请帮我优化以下代码，目标是提升可读性和性能：

代码：
```typescript
const getUserData = async (id: string) => {
  const user = await fetchUser(id)
  const posts = await fetchPosts(user.id)
  const comments = await fetchComments(posts.map(p => p.id))
  return { user, posts, comments }
}
```

优化要求：
1. 减少不必要的等待（并行处理）
2. 添加错误处理
3. 添加 TypeScript 类型
4. 保持函数命名清晰

请提供优化后的代码和改动说明。
```

---

### 示例 4：文档编写

#### ❌ 差的提示词

```
帮我写个文档
```

#### ✅ 好的提示词

```
请为以下函数编写 API 文档：

函数：
```typescript
async function createUser(data: {
  email: string
  password: string
  name: string
}): Promise<{id: string; email: string}>
```

文档格式：
- 函数描述
- 参数说明（类型、是否必填）
- 返回值说明
- 使用示例
- 可能抛出的错误

使用 Markdown 格式输出。
```

---

### 示例 5：代码审查

#### ❌ 差的提示词

```
审查这段代码
```

#### ✅ 好的提示词

```
请作为代码审查专家，审查以下 React 组件：

审查重点：
1. 类型安全性
2. 性能问题（不必要的重渲染）
3. 错误处理
4. 代码可读性
5. 最佳实践遵循情况

代码：
```tsx
import { useState, useEffect } from 'react'

export function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState(null)
  const [posts, setPosts] = useState([])

  useEffect(() => {
    fetchUser(userId).then(setUser)
    fetchUserPosts(userId).then(setPosts)
  }, [userId])

  if (!user) return <div>Loading...</div>

  return (
    <div>
      <h1>{user.name}</h1>
      <ul>{posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>
    </div>
  )
}
```

请以列表形式输出：
- 发现的问题
- 严重程度（高/中/低）
- 修复建议
```

---

## 高级提示词技巧

### 1. Few-Shot Prompting（少样本提示）

提供示例帮助 AI 理解期望：

```
请将以下自然语言转换为 SQL 查询语句。

示例1：
输入：查找所有姓张的用户
输出：SELECT * FROM users WHERE name LIKE '张%'

示例2：
输入：查找年龄大于25的用户
输出：SELECT * FROM users WHERE age > 25

示例3：
输入：查找今年注册的用户
输出：SELECT * FROM users WHERE YEAR(created_at) = YEAR(CURDATE())

现在请转换：
输入：查找所有状态为"活跃"且注册时间在2024年之后的用户
输出：
```

### 2. Chain of Thought（思维链）

引导 AI 展示推理过程：

```
请使用逐步推理的方式解决以下问题：

问题：如果一个数列的前三项是 2, 6, 18，求第四项。

推理过程：
1. 观察相邻两项的关系
2. 计算比例关系
3. 验证规律
4. 应用规律求解

请按照以上步骤逐步推理并给出答案。
```

### 3. 角色设定

```
你是一个有 10 年经验的前端工程师，擅长 React 和 TypeScript。
你熟悉各种设计模式和最佳实践。
你的回答应该专业、准确，并包含实用的代码示例。
```

### 4. 结构化输出

```
请以以下格式输出：

## 问题描述
[问题简述]

## 根本原因
[根本原因分析]

## 解决方案
### 选项1
[方案描述]
优点：...
缺点：...

### 选项2
[方案描述]
优点：...
缺点：...

## 推荐
[推荐方案及理由]

## 代码示例
```typescript
[代码]
```
```

### 5. 约束和边界

```
请生成一个随机密码生成函数。

约束条件：
- 密码长度：16-32 位（可配置）
- 必须包含：大写字母、小写字母、数字、特殊字符
- 不能包含容易混淆的字符（如 l, 1, O, 0）
- 使用 TypeScript 实现

请不要使用任何外部库。
```

---

## 常见提示词模板

### 代码生成模板

```
你是一个{语言/框架}专家。

请帮我实现以下功能：
{功能描述}

技术要求：
- 框架：{框架名称}
- 语言：{编程语言}
- 样式：{CSS方案}
- 状态管理：{状态方案}

功能需求：
{详细需求列表}

请提供：
1. 完整的代码实现
2. 必要的说明注释
3. 使用示例

代码风格：
{风格要求}
```

### Bug 修复模板

```
我遇到了一个问题，需要你帮忙解决：

**问题描述**
{问题描述}

**错误信息**
```
{错误日志}
```

**相关代码**
```{language}
{代码}
```

**环境信息**
- 框架：{框架和版本}
- 运行环境：{浏览器/Node版本}
- 构建工具：{webpack/vite等}

**已尝试的解决方案**
{尝试过的方案}

请分析问题原因并提供修复方案。
```

### 代码审查模板

```
请审查以下代码：

**审查重点**
{审查重点列表}

**代码**
```{language}
{代码}
```

**上下文**
{相关背景信息}

请输出：
1. 发现的问题
2. 风险评估
3. 改进建议
```

### 重构建议模板

```
请分析以下代码并提供重构建议：

```{language}
{代码}
```

重构目标：
{目标：如提升性能、提高可读性、降低复杂度}

约束条件：
{约束：如保持 API 不变、不引入新依赖}

请提供：
1. 当前代码的问题分析
2. 重构后的代码
3. 改动说明
```

---

## 提示词反模式

### ❌ 需要避免的模式

| 反模式 | 问题 | 改进 |
| ------ | ---- | ---- |
| **模糊指令** | "帮我优化" | "优化性能，减少 50% 响应时间" |
| **过多信息** | 冗长的背景描述 | 提取关键信息 |
| **矛盾要求** | "简单但功能全" | 明确优先级 |
| **缺少上下文** | "这个函数怎么改" | 提供完整代码和目的 |
| **假设过多** | "你应该知道..." | 明确说明所有信息 |

### ✅ 良好模式

| 模式 | 说明 |
| ---- | ---- |
| **明确目标** | 清晰说明想要什么 |
| **提供上下文** | 给出必要的背景信息 |
| **结构清晰** | 使用分段和列表 |
| **具体约束** | 明确限制和要求 |
| **示例引导** | 用示例说明期望 |

---

## 针对不同场景的提示词

### 1. 前端开发

```
请创建一个 React + TypeScript 的用户列表组件：

需求：
- 使用 TypeScript 定义 User 类型：{ id, name, email, avatar }
- 使用 shadcn/ui 的 Table 组件展示用户列表
- 支持分页（每页 10 条）
- 支持按姓名搜索
- 点击行可查看用户详情

API 接口：GET /api/users?page=1&limit=10&search=keyword
返回格式：{ data: User[], total: number }

请提供完整组件代码和必要的类型定义。
```

### 2. 后端开发

```
请用 Node.js + Express 创建一个用户认证 API：

需求：
- POST /api/auth/register - 用户注册
- POST /api/auth/login - 用户登录
- POST /api/auth/logout - 用户登出
- GET /api/auth/me - 获取当前用户信息

技术要求：
- 使用 TypeScript
- 使用 Prisma ORM
- 使用 JWT 进行认证
- 密码使用 bcrypt 加密
- 数据库使用 PostgreSQL

数据模型（User）：
- id: UUID
- email: 唯一
- password: 加密存储
- name: 用户名
- createdAt: 创建时间

请提供完整的路由、控制器和中间件代码。
```

### 3. 数据分析

```
请帮我分析以下数据：

销售数据：
```
月份,Q1,Q2,Q3,Q4
产品A,120,150,180,200
产品B,80,90,100,110
产品C,200,180,150,120
```

请提供：
1. 季度增长趋势分析
2. 产品表现对比
3. 潜在问题识别
4. 改进建议

使用 Markdown 格式输出，包含数据可视化建议。
```

### 4. 文档生成

```
请为以下 API 生成 Swagger/OpenAPI 文档：

API 端点：POST /api/users

请求体：
{
  "email": "string (required, email format)",
  "password": "string (required, minLength: 8)",
  "name": "string (required)"
}

成功响应（201）：
{
  "id": "uuid",
  "email": "string",
  "name": "string",
  "createdAt": "datetime"
}

错误响应：
- 400: 参数验证失败
- 409: 邮箱已存在

请生成完整的 OpenAPI 3.0 规范（YAML 格式）。
```

---

## 提示词迭代优化

### 迭代流程

```
第一版（基础版）
"写一个登录功能"
      ↓
      ❌ 结果不符合预期
      ↓
第二版（添加细节）
"用 React 写一个登录表单，包含邮箱和密码"
      ↓
      ⚠️ 接近了，但还不完美
      ↓
第三版（精细化）
"请创建一个 React + TypeScript 登录表单，使用 shadcn/ui..."
      ↓
      ✅ 满意
```

### 迭代技巧

1. **从简单开始**：先给基础版本
2. **逐步添加细节**：一次只加一个要求
3. **观察输出**：分析不符合预期的部分
4. **针对性修正**：指出具体问题
5. **验证结果**：确认是否满足需求

---

## 参考资源

### 官方文档

- [OpenAI Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering)
- [Anthropic Prompt Library](https://docs.anthropic.com/prompt-library)
- [Google Prompting Guide](https://ai.google.dev/gemini-api/prompting-strategies)

### 学习资源

- [Learn Prompting](https://learnprompting.org/)
- [Prompt Engineering Guide](https://www.promptingguide.ai/)

### 社区资源

- [Awesome Prompt Engineering](https://github.com/f/awesome-prompt-engineering)
- [Prompt Examples](https://github.com/matthew-burrell/prompt-examples)

---

**文档更新时间：2025 年 12 月**
