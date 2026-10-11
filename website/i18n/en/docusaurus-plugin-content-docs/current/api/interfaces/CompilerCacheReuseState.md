---
title: CompilerCacheReuseState
description: Cache reuse information returned by a compiler generation transaction.
keywords:
  - weapp-tailwindcss
  - API
  - compiler cache
  - incremental generation
  - TypeScript
  - reference
  - options
  - CompilerCacheReuseState
  - interfaces
  - Tailwind CSS 4
  - cross-platform
  - mini app
  - uni-app
  - Taro
  - React Native
  - Lynx
---

# CompilerCacheReuseState

## Properties

### source

> **source**: `boolean`

Whether the resolved source fingerprint matched the previous successful generation.

---

### engine

> **engine**: `boolean`

Whether the current root reused its Tailwind engine and Scanner.

---

### output

> **output**: `boolean`

Whether the transaction reused a result with no newly generated incremental CSS.
