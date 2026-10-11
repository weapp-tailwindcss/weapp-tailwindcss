---
title: CreateCompilerSnapshotRequest
description: Input used to create an immutable compiler snapshot from an externally validated class set.
keywords:
  - weapp-tailwindcss
  - API
  - compiler snapshot
  - class set
  - TypeScript
  - reference
  - options
  - CreateCompilerSnapshotRequest
  - interfaces
  - Tailwind CSS 4
  - cross-platform
  - mini app
  - uni-app
  - Taro
  - React Native
  - Lynx
---

# CreateCompilerSnapshotRequest

## Properties

### classSet

> **classSet**: `Iterable<string>`

Classes already validated by a Tailwind generation chain. The compiler copies the input and exposes an immutable view.

---

### id

> **id**: `string`

The caller-defined opaque logical root ID.

---

### revision?

> Optional | **revision**: `number`

The non-negative safe integer revision. Defaults to `0`.

---

### dependencies?

> Optional | **dependencies**: `Iterable<string>`

Exact dependency IDs associated with the external class set.

---

### sources?

> Optional | **sources**: `Iterable<TailwindV4SourcePattern>`

Resolved source patterns associated with the external class set.

---

### target?

> Optional | **target**: [`CompilerTarget`](./CompilerTarget.md)

Defaults to `weapp`.
