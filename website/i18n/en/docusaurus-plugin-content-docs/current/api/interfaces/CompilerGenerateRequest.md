---
title: CompilerGenerateRequest
description: Generation request for one logical framework-owned Tailwind root.
keywords:
  - weapp-tailwindcss
  - API
  - compiler generation
  - Tailwind CSS
  - TypeScript
  - reference
  - options
  - CompilerGenerateRequest
  - interfaces
  - Tailwind CSS 4
  - cross-platform
  - mini app
  - uni-app
  - Taro
  - React Native
  - Lynx
---

# CompilerGenerateRequest

Provide exactly one of `source` or `sourceOptions`.

## Properties

### id

> **id**: `string`

The caller-defined logical root ID. Core treats this value as opaque and does not normalize it as a file path.

---

### source

> **source**: `TailwindV4ResolvedSource`

An already resolved Tailwind CSS 4 source. Mutually exclusive with `sourceOptions`.

---

### sourceOptions

> **sourceOptions**: `TailwindV4SourceOptions`

Options passed to the existing Tailwind source resolver. Mutually exclusive with `source`.

---

### target?

> Optional | **target**: [`CompilerTarget`](./CompilerTarget.md)

The desired CSS output shape. Defaults to `weapp`.

---

### candidates?

> Optional | **candidates**: `Iterable<string>`

Explicit candidates owned by the framework for this root.

---

### sources?

> Optional | **sources**: `TailwindV4CandidateSource[]`

Additional candidate sources passed to the Tailwind engine.

---

### scanSources?

> Optional | **scanSources**: `boolean | TailwindV4SourcePattern[]`

Controls file-system candidate scanning.

---

### incrementalCache?

> Optional | **incrementalCache**: `boolean`

Controls the Tailwind engine's incremental generation cache.

---

### bareArbitraryValues?

> Optional | **bareArbitraryValues**: `boolean | { units?: string[] }`

Enables supported UnoCSS-style bare arbitrary values.

---

### styleOptions?

> Optional | **styleOptions**: `Partial<IStyleHandlerOptions>`

Additional options used when generating mini-program-compatible CSS.
