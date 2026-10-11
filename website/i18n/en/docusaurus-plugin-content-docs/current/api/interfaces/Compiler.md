---
title: Compiler
description: 'Framework compiler methods for generation, immutable snapshots, transforms, invalidation, and lifecycle management.'
keywords:
  - weapp-tailwindcss
  - API
  - Compiler
  - framework integration
  - TypeScript
  - reference
  - options
  - interfaces
  - Tailwind CSS 4
  - cross-platform
  - mini app
  - uni-app
  - Taro
  - React Native
  - Lynx
---

# Compiler

The framework-owned compiler returned by `createCompiler()`.

## Properties

### createSnapshot()

> **createSnapshot()**: `(request: CreateCompilerSnapshotRequest) => CompilerSnapshot`

Creates an immutable snapshot from a class set already validated by another Tailwind generation chain.

#### Parameters

##### request

[`CreateCompilerSnapshotRequest`](./CreateCompilerSnapshotRequest.md)

#### Returns

[`CompilerSnapshot`](./CompilerSnapshot.md)

---

### dispose()

> **dispose()**: `() => Promise<void>`

Waits for active work, releases every root session, and rejects subsequent work. Repeated calls are safe.

#### Returns

`Promise<void>`

---

### generate()

> **generate()**: `(request: CompilerGenerateRequest) => Promise<CompilerGenerateResult>`

Generates CSS for one opaque logical root. Work for the same root is committed serially while separate roots can run concurrently.

#### Parameters

##### request

[`CompilerGenerateRequest`](./CompilerGenerateRequest.md)

#### Returns

`Promise<CompilerGenerateResult>`

---

### invalidate()

> **invalidate()**: `(ids: Iterable<string>) => readonly string[]`

Marks exact root or dependency IDs as invalid and returns the affected root IDs. IDs are not path-normalized.

#### Parameters

##### ids

`Iterable<string>`

#### Returns

`readonly string[]`

---

### mergeSnapshots()

> **mergeSnapshots()**: `(snapshots: Iterable<CompilerSnapshot>) => CompilerSnapshot`

Deterministically merges snapshots reachable from the caller's module graph. Conflicting revisions, content, or targets are rejected.

#### Parameters

##### snapshots

`Iterable<CompilerSnapshot>`

#### Returns

[`CompilerSnapshot`](./CompilerSnapshot.md)

---

### remove()

> **remove()**: `(id: string) => Promise<void>`

Waits for active work on a root and releases its generation state. Repeated calls are safe.

#### Parameters

##### id

`string`

#### Returns

`Promise<void>`

---

### transformCss()

> **transformCss()**: `(css: string, snapshot: CompilerSnapshot, options?: Partial<IStyleHandlerOptions>) => Promise<PostcssResult<Root | Document>>`

Transforms CSS text without collecting a runtime class set.

---

### transformCssRoot()

> **transformCssRoot()**: `(root: Root, snapshot: CompilerSnapshot, options?: Partial<IStyleHandlerOptions>) => Promise<PostcssResult<Root>>`

Transforms a PostCSS Root without mutating the input or sharing a mutable output AST.

---

### transformJavaScript()

> **transformJavaScript()**: `(source: string, snapshot: CompilerSnapshot, options?: CreateJsHandlerOptions) => Promise<JsHandlerResult>`

Transforms only classes that exactly match the snapshot and preserves the existing `error`, `map`, and `linked` result contract.

---

### transformTemplate()

> **transformTemplate()**: `(source: string, snapshot: CompilerSnapshot, options?: CompilerTemplateTransformOptions) => Promise<string>`

Transforms only static classes and expressions that exactly match the snapshot.
