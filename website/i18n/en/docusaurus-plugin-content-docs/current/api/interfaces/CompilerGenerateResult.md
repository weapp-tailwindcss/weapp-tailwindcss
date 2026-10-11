---
title: CompilerGenerateResult
description: 'CSS generation result, incremental metadata, and immutable transaction snapshot.'
keywords:
  - weapp-tailwindcss
  - API
  - compiler result
  - incremental CSS
  - TypeScript
  - reference
  - options
  - CompilerGenerateResult
  - interfaces
  - Tailwind CSS 4
  - cross-platform
  - mini app
  - uni-app
  - Taro
  - React Native
  - Lynx
---

# CompilerGenerateResult

## Properties

### revision

> **revision**: `number`

The successful, monotonically increasing revision for this root.

---

### target

> **target**: [`CompilerTarget`](./CompilerTarget.md)

The requested compiler target.

---

### css

> **css**: `string`

The generated CSS for the requested target. For `tailwind`, this is the raw Tailwind output.

---

### rawCss

> **rawCss**: `string`

The unmodified Tailwind CSS output.

---

### incrementalCss?

> Optional | **incrementalCss**: `string`

CSS newly produced by this generation transaction.

---

### incrementalRawCss?

> Optional | **incrementalRawCss**: `string`

Raw Tailwind CSS newly produced by this transaction.

---

### classSet

> **classSet**: `ReadonlySet<string>`

The immutable public view of classes validated by Tailwind.

---

### rawCandidates

> **rawCandidates**: `ReadonlySet<string>`

The immutable public view of raw candidates.

---

### dependencies

> **dependencies**: `readonly string[]`

Exact dependency IDs associated with this root.

---

### sources

> **sources**: `readonly TailwindV4SourcePattern[]`

Resolved source patterns associated with this root.

---

### cache

> **cache**: `Readonly<CompilerCacheReuseState>`

[`CompilerCacheReuseState`](./CompilerCacheReuseState.md)

---

### snapshot

> **snapshot**: [`CompilerSnapshot`](./CompilerSnapshot.md)

The immutable credential that must be shared by CSS, template, and JavaScript transforms in the same transaction.

---

### root

> **root**: `TailwindV4CompiledSourceRoot`

The underlying Tailwind compiled source root.
