---
sidebar: aiSidebar
title: AI Agent（智能体）
description: AI Agent（智能体），覆盖 AI 工作流、提示词和工程化实践。
keywords:
  - AI 编程
  - LLM
  - 工作流
  - AI
  - Agent
  - 智能体
  - basics
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - uni-app
  - taro
---

# AI Agent（智能体）

## 概述

**AI Agent（人工智能智能体）** 是一个能够**自主感知环境、做出决策并执行行动**的 AI 系统。与传统的聊天式 AI 不同，Agent 可以：

- 主动调用工具
- 规划多步骤任务
- 处理复杂的工作流
- 在失败时自动重试

> **核心特点**：自主性、交互性、反应性、主动性

---

## 核心概念

### 1. Agent 的定义

**Agent** 是能够：

1. **感知** (Perceive)：获取环境信息
2. **推理** (Reason)：分析情况并制定计划
3. **行动** (Act)：执行具体操作
4. **学习** (Learn)：从反馈中改进

### 2. Agent 与 Chatbot 的区别

| 特性 | Chatbot | AI Agent |
| ---- | ------- | -------- |
| **交互方式** | 问答式 | 任务导向 |
| **主动性** | 被动响应 | 主动规划 |
| **工具使用** | 有限 | 丰富 |
| **任务复杂度** | 单步任务 | 多步骤任务 |
| **记忆能力** | 会话级 | 长期记忆 |
| **自主决策** | 无 | 有 |

---

## Agent 的架构

### 基本架构

```
┌─────────────────────────────────────────────────────────┐
│                    AI Agent 架构                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐          │
│  │  输入    │ ──▶│  推理    │ ──▶│  输出    │          │
│  │ Input   │     │ Reasoning│     │ Output  │          │
│  └─────────┘     └────┬────┘     └─────────┘          │
│                       │                                 │
│                       ▼                                 │
│              ┌─────────────┐                           │
│              │   工具调用   │                           │
│              │   Tools     │                           │
│              └─────────────┘                           │
│                       │                                 │
│                       ▼                                 │
│              ┌─────────────┐                           │
│              │   环境反馈   │                           │
│              │  Feedback   │                           │
│              └─────────────┘                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 核心组件

#### 1. 规划模块 (Planning)

- 任务分解
- 步骤排序
- 资源分配
- 时间估算

#### 2. 记忆模块 (Memory)

- 短期记忆（当前会话）
- 长期记忆（向量存储）
- 上下文管理
- 知识检索

#### 3. 工具模块 (Tools)

- 文件操作
- API 调用
- 命令执行
- 数据库查询

#### 4. 反思模块 (Reflection)

- 结果验证
- 错误处理
- 策略调整
- 重试机制

---

## Agent 的类型

### 1. 单 Agent 系统

由一个 Agent 完成所有任务：

```
┌─────────────────┐
│    Agent       │
│  ┌───────────┐  │
│  │ Planning  │  │
│  │ Memory    │  │
│  │ Tools     │  │
│  │ Action    │  │
│  └───────────┘  │
└─────────────────┘
```

**特点**：
- 实现简单
- 适合单领域任务
- 容易调试

### 2. 多 Agent 系统

多个 Agent 协同工作：

```
┌─────────────────────────────────────────────────────────┐
│                   Multi-Agent System                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐         │
│  │  Planner │ ──▶│  Coder   │ ──▶│  Tester  │         │
│  │  Agent   │    │  Agent   │    │  Agent   │         │
│  └──────────┘    └──────────┘    └──────────┘         │
│       │               │               │                │
│       └───────────────┴───────────────┘                │
│                       ▼                                 │
│              ┌──────────────┐                           │
│              │ Coordinator  │                           │
│              │    Agent     │                           │
│              └──────────────┘                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**特点**：
- 专业化分工
- 可并行处理
- 适合复杂任务

**常见角色**：

| Agent 角色 | 职责 |
| ---------- | ---- |
| **Planner** | 任务规划、分解 |
| **Coder** | 代码生成、修改 |
| **Reviewer** | 代码审查、验证 |
| **Tester** | 测试用例生成 |
| **Debugger** | 问题定位、修复 |
| **Documenter** | 文档生成 |

### 3. 层级 Agent 系统

Agent 之间存在上下级关系：

```
┌─────────────────────────────────────────────────────────┐
│              Hierarchical Agent System                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────────────────────────────────┐             │
│  │        Manager Agent (L1)             │             │
│  │     任务分配、进度监控、协调          │             │
│  └─────────────┬─────────────────────────┘             │
│                │                                         │
│     ┌──────────┼──────────┐                             │
│     ▼          ▼          ▼                             │
│  ┌──────┐ ┌──────┐ ┌──────┐                           │
│  │Coder ││Tester││Doc   │ (L2)                         │
│  │Agent ││Agent ││Agent │                              │
│  └──────┘ └──────┘ └──────┘                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 主流 Agent 框架

### 1. LangChain Agent

```python
from langchain.agents import create_openai_functions_agent
from langchain.tools import Tool

# 定义工具
tools = [
    Tool(
        name="calculator",
        func=lambda x: eval(x),
        description="执行数学计算"
    )
]

# 创建 Agent
agent = create_openai_functions_agent(
    llm=chat_model,
    tools=tools,
    prompt=prompt
)
```

### 2. AutoGen

```python
from autogen import AssistantAgent, UserProxyAgent

# 创建 Agent
assistant = AssistantAgent(
    name="assistant",
    llm_config={"model": "gpt-4"}
)

user_proxy = UserProxyAgent(
    name="user_proxy",
    code_execution_config={"work_dir": "coding"}
)

# 启动对话
user_proxy.initiate_chat(
    assistant,
    message="计算斐波那契数列的第 10 项"
)
```

### 3. Claude Code Task Agent

```typescript
// 使用 Claude Code 的子代理
import { Task } from '@anthropic-ai/claude-code';

const result = await Task({
  description: "分析项目代码结构",
  subagentType: "explore",
  model: "claude-opus-4-5"
});
```

### 4. Cursor Composer

Cursor 的 Agent 系统：
- **Composer**：多步骤任务执行
- **Background Agent**：后台处理
- **Multi-Agent Interface**：并行多智能体

---

## Agent 的设计模式

### 1. ReAct (Reasoning + Acting)

```
Thought (思考) → Action (行动) → Observation (观察) → Thought (思考) → ...
```

**示例**：
```
Thought: 我需要读取文件内容
Action: ReadFile(path="src/main.js")
Observation: 读取到 100 行代码
Thought: 我看到了问题所在
Action: EditFile(...)
```

### 2. Chain of Thought

逐步推理，展示思考过程：

```
问题：用户报告登录失败

思考步骤：
1. 检查认证逻辑
2. 查看日志文件
3. 验证 API 配置
4. 定位问题原因
```

### 3. Plan-and-Execute

先规划再执行：

```
1. 规划阶段：
   - 分析需求
   - 制定计划
   - 分解任务

2. 执行阶段：
   - 按步骤执行
   - 记录进度
   - 处理异常
```

### 4. Self-Refine

自我反思和改进：

```
1. 生成初始方案
2. 自我审查
3. 识别问题
4. 改进方案
5. 重复 2-4
```

---

## Agent 的最佳实践

### 1. 明确目标

- 清晰定义任务边界
- 设定成功标准
- 明确输出格式

### 2. 工具设计

- 工具功能单一
- 输入输出明确
- 错误处理完善

### 3. 记忆管理

- 合理设置上下文窗口
- 使用向量存储长期记忆
- 定期清理无关信息

### 4. 安全考虑

- 限制可执行的操作
- 实施权限控制
- 记录所有行动

### 5. 可观测性

- 记录决策过程
- 监控执行状态
- 追踪资源使用

---

## Agent 的应用场景

| 场景 | Agent 类型 | 说明 |
| ---- | ---------- | ---- |
| **代码生成** | Coder Agent | 生成、修改代码 |
| **代码审查** | Reviewer Agent | 审查代码质量 |
| **自动化测试** | Tester Agent | 生成测试用例 |
| **Bug 修复** | Debugger Agent | 定位和修复问题 |
| **文档生成** | Documenter Agent | 生成技术文档 |
| **数据分析** | Analyst Agent | 处理数据任务 |
| **运维自动化** | Ops Agent | 自动化运维操作 |

---

## 参考资源

### 论文

- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
- [AutoGen: Enabling Next-Gen LLM Applications](https://arxiv.org/abs/2308.08155)

### 框架文档

- [LangChain Agents](https://python.langchain.com/docs/modules/agents/)
- [AutoGen Documentation](https://microsoft.github.io/autogen/)
- [Claude Code CLI](https://docs.anthropic.com/claude-code)

---

**文档更新时间：2025 年 12 月**
