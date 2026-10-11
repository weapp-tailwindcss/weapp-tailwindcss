---
sidebar: aiSidebar
title: MCP (Model Context Protocol)
description: MCP (Model Context Protocol)，覆盖 AI 工作流、提示词和工程化实践。
keywords:
  - AI 编程
  - LLM
  - 工作流
  - MCP
  - Model
  - Context
  - Protocol
  - ai
  - basics
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - uni-app
  - taro
---

# MCP (Model Context Protocol)

## 概述

**MCP (Model Context Protocol)** 是一个开放协议，用于连接 AI 助手与系统上下文（数据源、工具、环境）。它由 Anthropic 于 2024 年 11 月发布，旨在解决 AI 应用与外部系统集成的标准化问题。

> **官方文档**：[https://modelcontextprotocol.io](https://modelcontextprotocol.io)
> **GitHub**：[https://github.com/modelcontextprotocol](https://github.com/modelcontextprotocol)

---

## 核心概念

### 1. MCP 的定义

MCP 是一种**客户端-服务端协议**，定义了：

- AI 应用（客户端）如何请求数据和操作
- 数据源/工具（服务端）如何暴露其能力
- 消息传输的标准格式

### 2. 架构组件

```
┌─────────────────────────────────────────────────────────┐
│                    MCP 架构                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐         ┌──────────────┐            │
│  │   MCP Client │ ───────▶│  MCP Server  │            │
│  │   (AI 应用)   │  ◀──────│  (数据源)    │            │
│  └──────────────┘         └──────────────┘            │
│         │                         │                     │
│         ▼                         ▼                     │
│  ┌──────────────┐         ┌──────────────┐            │
│  │ Claude Code  │         │ 文件系统     │            │
│  │ Cursor IDE   │         │ 数据库       │            │
│  │ Cline        │         │ API 服务     │            │
│  │ 自定义应用    │         │ Git 仓库     │            │
│  └──────────────┘         └──────────────┘            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## MCP 的核心能力

### 1. 资源 (Resources)

**资源**是服务端暴露给客户端的**数据读取接口**。

```typescript
// 资源示例
{
  "uri": "file:///Users/project/README.md",
  "name": "项目 README",
  "description": "项目根目录的 README 文件",
  "mimeType": "text/markdown"
}
```

**常见资源类型**：

| 类型 | URI 示例 | 说明 |
| ---- | -------- | ---- |
| 文件 | `file:///path/to/file` | 本地文件系统 |
| Git | `git:///repo/file` | Git 仓库内容 |
| 数据库 | `postgres://query` | 数据库查询结果 |
| API | `https://api/data` | HTTP API 响应 |
| 内存 | `memory://variable` | 运行时数据 |

### 2. 提示词模板 (Prompts)

**提示词模板**是服务端提供的**预定义提示词**。

```typescript
// 提示词模板示例
{
  "name": "code-review",
  "description": "代码审查提示词",
  "arguments": {
    "file": "要审查的文件路径",
    "focus": "审查重点（安全/性能/风格）"
  }
}
```

### 3. 工具 (Tools)

**工具**是服务端暴露的**可执行功能**。

```typescript
// 工具示例
{
  "name": "execute_command",
  "description": "在终端执行命令",
  "inputSchema": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
        "description": "要执行的命令"
      }
    }
  }
}
```

---

## MCP 传输层

MCP 支持多种传输方式：

### 1. STDIO（标准输入/输出）

适用于**本地进程间通信**：

```bash
# 通过 STDIO 启动 MCP 服务端
claude-code mcp install my-server
my-server --stdio
```

### 2. SSE（Server-Sent Events）

适用于**本地 HTTP 通信**：

```typescript
// SSE 连接
const client = new MCPClient({
  url: "http://localhost:3000/sse",
  transport: "sse"
});
```

### 3. 自定义传输

支持自定义 WebSocket、gRPC 等传输层。

---

## 使用场景

### 1. Claude Code 中的 MCP

Claude Code 原生支持 MCP，可以：

- 通过 MCP 读取项目文件
- 通过 MCP 执行 Git 命令
- 通过 MCP 访问数据库
- 通过 MCP 调用外部 API

**配置示例**：

```json
// .claude/mcp_config.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/project"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    }
  }
}
```

### 2. Cursor IDE 中的 MCP

Cursor 支持 MCP 扩展：

- 安装 MCP 兼容的服务端
- Cursor 自动发现可用资源
- 在 Chat 中引用 MCP 资源

### 3. Cline 中的 MCP

Cline（VS Code 插件）支持 MCP：

- 通过 MCP 获取项目上下文
- 通过 MCP 执行构建命令
- 通过 MCP 访问测试结果

---

## MCP 服务端示例

### 文件系统服务端

```bash
# 官方文件系统服务端
npx -y @modelcontextprotocol/server-filesystem /path/to/directory
```

### GitHub 服务端

```bash
# 官方 GitHub 服务端
npx -y @modelcontextprotocol/server-github
```

### 数据库服务端

```bash
# PostgreSQL 服务端
npx -y @modelcontextprotocol/server-postgres "postgresql://..."
```

### 自定义服务端

```typescript
// 自定义 MCP 服务端
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'my-custom-server',
  version: '1.0.0'
});

// 添加资源
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'custom://data',
      name: '自定义数据',
      description: '我的自定义数据源'
    }
  ]
}));

// 启动服务端
const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## MCP 的优势

| 优势 | 说明 |
| ---- | ---- |
| **标准化** | 统一的协议，无需为每个 AI 应用单独适配 |
| **模块化** | 数据源独立于 AI 应用，可复用 |
| **可扩展** | 支持自定义传输层和数据源 |
| **安全性** | 明确的权限控制和数据隔离 |
| **开放性** | 开源协议，社区驱动发展 |

---

## MCP 与其他方案的对比

| 方案 | MCP | LangChain Tools | OpenAI Function Calling |
| ---- | --- | --------------- | ---------------------- |
| **标准化程度** | ✅ 开放协议 | ❌ 厂商特定 | ❌ 厂商特定 |
| **传输层** | 多种支持 | HTTP/RPC | HTTP |
| **AI 兼容性** | 多模型 | 主流 LLM | OpenAI only |
| **社区生态** | 快速增长 | 成熟 | 成熟 |
| **学习曲线** | 简单 | 中等 | 简单 |

---

## 快速开始

### 1. 安装 Claude Code MCP 集成

```bash
# 安装 Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 初始化 MCP 配置
claude-code mcp init
```

### 2. 添加 MCP 服务端

```bash
# 添加文件系统服务端
claude-code mcp install @modelcontextprotocol/server-filesystem

# 添加 GitHub 服务端
claude-code mcp install @modelcontextprotocol/server-github
```

### 3. 在 Claude Code 中使用

```
@mcp://filesystem/Users/project/src 请分析这个目录下的代码结构
```

---

## 参考资源

### 官方资源

- [MCP 官方网站](https://modelcontextprotocol.io)
- [MCP GitHub](https://github.com/modelcontextprotocol)
- [MCP SDK 文档](https://modelcontextprotocol.io/sdk)

### 社区资源

- [MCP 服务端列表](https://github.com/modelcontextprotocol/servers)
- [MCP 客户端列表](https://github.com/modelcontextprotocol/clients)
- [Claude Code MCP 文档](https://docs.anthropic.com/claude-code/mcp)

---

**文档更新时间：2025 年 12 月**
