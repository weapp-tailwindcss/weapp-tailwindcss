---
title: CreateCompilerOptions
description: User options and bounded root-cache configuration accepted by createCompiler().
keywords:
  - weapp-tailwindcss
  - API
  - createCompiler
  - compiler options
  - TypeScript
  - reference
  - options
  - CreateCompilerOptions
  - interfaces
  - Tailwind CSS 4
  - cross-platform
  - mini app
  - uni-app
  - Taro
  - React Native
  - Lynx
---

# CreateCompilerOptions

`CreateCompilerOptions` includes every [`UserDefinedOptions`](./UserDefinedOptions.md) field used by the existing CSS, template, and JavaScript handlers, plus compiler lifecycle options.

## Properties

### compiler?

> Optional | **compiler**: `{ maxRoots?: number }`

Compiler-specific lifecycle and cache settings.

#### maxRoots?

> Optional | **maxRoots**: `number`

Maximum number of idle logical root sessions retained by one compiler. Active roots are allowed to finish, then the store returns to this bound. Defaults to `128`.
