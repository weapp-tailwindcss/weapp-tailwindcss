---
sidebar: aiSidebar
title: LLMs.txt (LLM friendly document)
description: >-
  LLMs.txt (LLM friendly document): Current concepts, configuration guidance, and practical examples for
  weapp-tailwindcss users.
keywords:
  - AI programming
  - LLM
  - Workflow
  - LLMs.txt
  - Friendly documentation
  - ai
  - basics
  - llms txt
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
  - mpx
---

# LLMs.txt (LLM friendly document)

## Overview

**llms.txt** is a text file in the project root directory that provides project context for the Large Language Model (LLM). It is similar to `README.md`, but designed specifically for AI tools (such as Claude Code, Cursor, Cline) to help AI better understand and manipulate code bases.

> **Core Value**: Let AI quickly understand project structure, coding standards, and technology stack, and provide more accurate help

---

## The role of llms.txt

### 1. Provide project context for AI

```
Traditional way:
AI: "What is this project about?"
User: "This is a small program project..."
AI: "What framework to use?"
User: "Use native mini programs..."
AI: "What are the coding standards?"
User: "......"

With llms.txt:
AI directly reads llms.txt → automatically understands project information → provides accurate help
```

### 2. Relationship with Claude Code CLAUDE.md

| Documentation | Target users             | Content focus                                   |
| ------------- | ------------------------ | ----------------------------------------------- |
| **llms.txt**  | General LLM              | Project overview, technology stack, quick start |
| **CLAUDE.md** | Exclusive to Claude Code | Detailed workflow, commands, best practices     |

### 3. Standard vs Custom

```
llms.txt (standard)
├── Common format
├── All LLMs can understand
└── Community Standards

Custom naming
├── .cursorrules (Cursor exclusive)
├── .clinerules (exclusive to Cline)
└── project_context.md (custom)
```

---

## Standard format of llms.txt

### Recommended structure

```markdown
# Project name

## Project Overview
Describe the project in one sentence

## Technology stack
- Frame: ...
- language: ...
- tool: ...

## Project structure
short catalog description

## Quick start
How to run the project

## Coding specifications
Code style requirements

## IMPORTANT NOTE
Other things to note
```

---

## llms.txt template

### Complete template

```markdown
# [project name]

## Project Overview
[Describe in one sentence what the project does]

## Technology stack
- **Framework**: [Main framework used]
- **Language**: [Main programming language]
- **Build tools**: [such as webpack, vite, gulp]
- **Testing framework**: [such as vitest, jest]
- **Other tools**: [Other important dependencies]

## Project structure
```

src/
├── components/ # component directory
├── utils/ # Utility function
├── pages/ # pages
└── styles/ # style file

````

## Quick start

### Install dependencies
```bash
pnpm install
````

### Development mode

```bash npm2yarn
npm run dev
```

### Build

```bash npm2yarn
npm run build
```

### test

```bash npm2yarn
npm test
```

## Coding specifications

- Use TypeScript strict mode
- Use functional declarations for components
- File naming uses kebab-case
- Follow ESLint rules

## IMPORTANT NOTE

-[Special agreement]

- [Notes]
- [Known issues]

````

### Mini program project template

```markdown
# Mini program project name

## Project Overview
A [Function Description] application based on the native applet framework

## Technology stack
- **Framework**: Native mini program (WeChat/Alipay/Douyin)
- **Build**: gulp + weapp-tailwindcss
- **Style**: TailwindCSS (Atomic CSS)
- **Language**: JavaScript / TypeScript

## Project structure
````

pages/ # Page directory
├── index/ # Home page
├── profile/ # personal center
components/ # component directory
utils/ # Utility function
styles/ # Global styles
assets/ # Static resources

````

## Quick start
```bash
# Install dependencies
pnpm install

# Development mode (WeChat applet)
pnpm dev:wechat

# Build
pnpm build
````

## Coding specifications

- Use kebab-case for component naming
- Use kebab-case for page naming
- Styles use TailwindCSS atomic classes
- Avoid using id selectors

## IMPORTANT NOTE

- Use weapp-tailwindcss for CSS transformations
  -Image resources need to be placed in the assets/ directory
- Follow mini program development specifications

````

### React project template

```markdown
# React project name

## Project Overview
[Project Description] Built with React + TypeScript

## Technology stack
- **Framework**: React 18+
- **Language**: TypeScript
- **Build**: Vite
- **State Management**: Zustand / Redux
- **Routing**: React Router
- **UI**: TailwindCSS + shadcn/ui

## Project structure
````

src/
├── components/ # Common components
├── pages/ # Page component
├── hooks/ # Custom Hooks
├── store/ # Status management
├── services/ # API services
├── types/ # TypeScript types
└── utils/ # Utility function

````

## Quick start
```bash
pnpm install
pnpm dev
````

## Coding specifications

- Components use functional declaration + hooks
- Use TypeScript types
- Follow ESLint + Prettier rules

```

---

## AI tool support for llms.txt

### 1. Claude Code

Claude Code will automatically read `llms.txt` in the project root directory:

```

Project root directory/
├── llms.txt ← AI automatic reading
├── CLAUDE.md ← Claude Code exclusive configuration
├── package.json
└── src/

````

### 2. Cursor

Cursor supports `llms.txt` and also supports `.cursorrules`:

```diff
+ llms.txt # Generic LLM context
+ .cursorrules # Cursor specific rules
````

### 3. Cline

Cline (VS Code plugin) reads `.clinerules` or `llms.txt`:

```
Project root directory/
├── .clinerules ← Cline configuration
├── llms.txt ← Backup
└── src/
```

### 4. Other tools

| Tools        | Supported files        |
| ------------ | ---------------------- |
| **Roo Code** | `roo-rules.txt`        |
| **Continue** | `continue_config.json` |
| **Aider**    | `.aider.conf.yml`      |

---

## llms.txt Best Practices

### 1. Keep it simple

```markdown
# ❌ Too detailed
This project is a complex enterprise-level application, including... (long story)

# ✅ Concise and clear
E-commerce mini program, including product display, shopping cart, and payment functions
```

### 2. Structured information

````markdown
# ✅ Use lists and code blocks

## Technology stack
- React 18
- TypeScript
- TailwindCSS

## Order
```bash
pnpm dev # development
pnpm build # build
````

````

### 3. Highlight the key points

```markdown
## Important Agreement
1. All API requests must go through services/api.ts
2. Components must use TypeScript to define props
3. Styles can only use TailwindCSS atomic classes
````

### 4. Keep updated

```markdown
## Last updated
2025-12-26

## Recent changes
- Migrate to Vite 6
- Added PWA support
```

---

## llms.txt example

### Example 1: Mini Program Project

```markdown
# Mini Program Mall

## Project Overview
WeChat mini program mall supports product browsing, shopping cart, and WeChat payment

## Technology stack
- Native applet framework
- weapp-tailwindcss (TailwindCSS)
- gulp build tool

## Project structure
```

pages/
├── home/ # Home page
├── category/ # Category
├── product/ # product details
├── cart/ # shopping cart
└── order/ # order
components/
├── product-card/ # Product card
├── address-picker/# address selection
utils/
├── request.js #API encapsulation
└── auth.js # Login authentication

````

## Quick start
```bash
pnpm install
pnpm dev:wechat
````

## Coding specifications

- Component naming: kebab-case
- Style: TailwindCSS atomic class
- Don't use id selector
- Use absolute paths for image paths

## API configuration

- Base URL: `https://api.example.com`
- Interfaces that require login automatically bring tokens

## IMPORTANT NOTE

- Use WeChat to log in to obtain user information
- Pay using WeChat Pay API

````

### Example 2: Full stack project

```markdown
# Full stack task management system

## Project Overview
Full-stack task management application, including front-end, back-end and database

## Technology stack

### front end
- React 18 + TypeScript
- Vite
- TailwindCSS + shadcn/ui
- React Query (TanStack Query)

### rear end
- Node.js + Express
- TypeScript
- Prisma ORM
- PostgreSQL

## Project structure
````

frontend/ # React frontend
├── src/
│ ├── components/
│ ├── pages/
│ ├── hooks/
│ └── services/
backend/ # Node.js backend
├── src/
│ ├── routes/
│ ├── services/
│ ├── models/
│ └── middleware/

````

## Quick start
```bash
# front end
cd frontend && pnpm dev

# rear end
cd backend && pnpm dev

# database
docker-compose up -d postgres
````

## Coding specifications

- Both front-end and back-end use TypeScript
- API follows RESTful specification
- Use functional declarations for components
- Using ESLint + Prettier

## Environment variables

```
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret
API_URL=http://localhost:3001
```

```

---

## Cooperation between llms.txt and CLAUDE.md

### Recommended configuration structure

```

Project root directory/
├── llms.txt # AI universal context (all LLMs)
├── CLAUDE.md # Claude Code exclusive configuration
├── .cursorrules # Cursor exclusive rules (optional)
└── .clinerules # Cline exclusive rules (optional)

````

### Content division of labor

| Documentation | Content |
| ---- | ---- |
| **llms.txt** | Project overview, technology stack, structure, quick start |
| **CLAUDE.md** | Claude's exclusive workflow, commands, plug-in configuration |

### llms.txt example

```markdown
# Project name

## Project Overview
A React + Node.js full-stack application

## Technology stack
- React 18 + TypeScript
- Node.js + Express
- PostgreSQL

## Quick start
pnpm install
pnpm dev
````

### CLAUDE.md example

```markdown
# Claude Code configuration

## Project context
This project uses React + Node.js full-stack architecture

## Workflow
1. For new functions, first create components in frontend/src/
2. API changes are modified in backend/src/routes/
3. Run pnpm test to verify

## Common commands
- pnpm dev: Start the development server
- pnpm test: run tests
- pnpm lint: code inspection

## Notes
- Front-end components must use TypeScript
- API routing needs to add authentication middleware
```

---

## refer to

### Official resources

- [llmstxt.org](https://llmstxt.org) - llms.txt official website
- [llms.txt specification](https://github.com/pydantic/llms.txt)

### Related documents

- [CLAUDE.md Best Practices](https://docs.anthropic.com/claude-code/project-knowledge)
- [Cursor Rules](https://cursor.com/docs/rules)

---

**Document updated: December 2025**
