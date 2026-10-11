---
sidebar: aiSidebar
title: MCP (Model Context Protocol)
description: >-
  MCP (Model Context Protocol): Current concepts, configuration guidance, and practical examples for weapp-tailwindcss
  users.
keywords:
  - AI programming
  - LLM
  - Workflow
  - MCP
  - Model
  - Context
  - Protocol
  - ai
  - basics
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
---

# MCP (Model Context Protocol)

## Overview

**MCP (Model Context Protocol)** is an open protocol used to connect AI assistants and system context (data sources, tools, environments). Released by Anthropic in November 2024, it aims to solve the standardization problem of integrating AI applications with external systems.

> **Official Document**: [https://modelcontextprotocol.io](https://modelcontextprotocol.io)
> **GitHub**: [https://github.com/modelcontextprotocol](https://github.com/modelcontextprotocol)

---

## Core concepts

### 1. Definition of MCP

MCP is a **client-server protocol** that defines:

- How AI applications (clients) request data and operations
- How data sources/tools (server) expose their capabilities
- Standard format for message transmission

### 2. Architecture components

```
┌─────────────────────────────────────────────────────────┐
│ MCP Architecture │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐         ┌──────────────┐            │
│  │   MCP Client │ ───────▶│  MCP Server  │            │
│ │ (AI application) │ ◀──────│ (data source) │ │
│  └──────────────┘         └──────────────┘            │
│         │                         │                     │
│         ▼                         ▼                     │
│  ┌──────────────┐         ┌──────────────┐            │
│ │ Claude Code │ │ File System │ │
│ │ Cursor IDE │ │ Database │ │
│ │ Cline │ │ API Service │ │
│ │ Custom Application │ │ Git Repository │ │
│  └──────────────┘         └──────────────┘            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## MCP Core Competencies

### 1. Resources

**Resource** is the **data reading interface** exposed by the server to the client.

```typescript
// Resource example
{
  "uri": "file:///Users/project/README.md",
"name": "Project README",
"description": "README file in the project root directory",
  "mimeType": "text/markdown"
}
```

**Common resource types**:

| Type     | URI Example            | Description            |
| -------- | ---------------------- | ---------------------- |
| Files    | `file:///path/to/file` | Local File System      |
| Git      | `git:///repo/file`     | Git repository content |
| Database | `postgres://query`     | Database query results |
| API      | `https://api/data`     | HTTP API response      |
| Memory   | `memory://variable`    | Runtime data           |

### 2. Prompt word templates (Prompts)

**Prompt word template** is a **predefined prompt word** provided by the server.

```typescript
// Example of prompt word template
{
  "name": "code-review",
"description": "code review prompt word",
  "arguments": {
"file": "The path of the file to be reviewed",
"focus": "Review focus (security/performance/style)"
  }
}
```

### 3. Tools

**Tools** are **executable functions** exposed by the server.

```typescript
// Tool example
{
  "name": "execute_command",
"description": "Execute commands in the terminal",
  "inputSchema": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
"description": "Command to be executed"
      }
    }
  }
}
```

---

## MCP transport layer

MCP supports multiple transmission methods:

### 1. STDIO (standard input/output)

Applies to **local inter-process communication**:

```bash
# Start the MCP server through STDIO
claude-code mcp install my-server
my-server --stdio
```

### 2. SSE (Server-Sent Events)

Applies to **Local HTTP Communication**:

```typescript
// SSE connection
const client = new MCPClient({
  url: "http://localhost:3000/sse",
  transport: "sse"
});
```

### 3. Custom transmission

Supports customizing transport layers such as WebSocket and gRPC.

---

## Usage scenarios

### 1. MCP in Claude Code

Claude Code natively supports MCP and can:

- Read project files via MCP
- Execute Git commands through MCP
- Access database via MCP
- Call external API via MCP

**Configuration Example**:

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

### 2. MCP in Cursor IDE

Cursor supports MCP extensions:

- Install MCP compatible server
- Cursor automatically discovers available resources
- Reference MCP resources in Chat

### 3. MCP in Cline

Cline (VS Code plugin) supports MCP:

- Get project context via MCP
- Execute build commands via MCP
- Access test results via MCP

---

## MCP server example

### File system server

```bash
#Official file system server
npx -y @modelcontextprotocol/server-filesystem /path/to/directory
```

### GitHub server

```bash
# Official GitHub server
npx -y @modelcontextprotocol/server-github
```

### Database server

```bash
# PostgreSQL server
npx -y @modelcontextprotocol/server-postgres "postgresql://..."
```

### Custom server

```typescript
// Customize MCP server
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'my-custom-server',
  version: '1.0.0'
});

//Add resources
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'custom://data',
name: 'custom data',
description: 'My custom data source'
    }
  ]
}));

//Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## Advantages of MCP

| Advantages          | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| **Standardization** | Unified protocol, no need to adapt separately for each AI application |
| **Modular**         | Data sources are independent of AI applications and can be reused     |
| **Extensible**      | Supports custom transport layers and data sources                     |
| **Security**        | Explicit permission control and data isolation                        |
| **Openness**        | Open source protocol, community-driven development                    |

---

## Comparison of MCP and other solutions

| Solutions                     | MCP              | LangChain Tools    | OpenAI Function Calling |
| ----------------------------- | ---------------- | ------------------ | ----------------------- |
| **Degree of Standardization** | ✅ Open Protocol | ❌ Vendor Specific | ❌ Vendor Specific      |
| **Transport Layer**           | Multiple support | HTTP/RPC           | HTTP                    |
| **AI Compatibility**          | Multi-model      | Mainstream LLM     | OpenAI only             |
| **Community Ecology**         | Rapid growth     | Mature             | Mature                  |
| **Learning Curve**            | Easy             | Medium             | Easy                    |

---

## Quick start

### 1. Install Claude Code MCP integration

```bash
# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

#Initialize MCP configuration
claude-code mcp init
```

### 2. Add MCP server

```bash
# Add file system server
claude-code mcp install @modelcontextprotocol/server-filesystem

# Add GitHub server
claude-code mcp install @modelcontextprotocol/server-github
```

### 3. Use in Claude Code

```
@mcp://filesystem/Users/project/src Please analyze the code structure in this directory
```

---

## Reference resources

### Official resources

- [MCP official website](https://modelcontextprotocol.io)
- [MCP GitHub](https://github.com/modelcontextprotocol)
- [MCP SDK Documentation](https://modelcontextprotocol.io/sdk)

### Community Resources

- [MCP server list](https://github.com/modelcontextprotocol/servers)
- [MCP Client List](https://github.com/modelcontextprotocol/clients)
- [Claude Code MCP Documentation](https://docs.anthropic.com/claude-code/mcp)

---

**Document updated: December 2025**
