---
title: "CompilerCssTransformOptions"
description: "Options for transforming CSS through the core compiler."
keywords:
  - "weapp-tailwindcss"
  - "API"
  - "compiler"
  - "CSS"
  - "TypeScript"
  - "Tailwind CSS"
  - "mini-program"
  - "PostCSS"
---

# CompilerCssTransformOptions

Options accepted by `Compiler.transformCss()` and `Compiler.transformCssRoot()`.

## Properties

### finalize?

> **finalize**: `boolean`

Whether to finalize CSS for mini-program output after the style compatibility transform. It defaults to `true` when `snapshot.target` is `"weapp"`; set it to `false` to preserve build-time at-rules.

### isMainChunk?

> **isMainChunk**: `boolean`

Whether this CSS is the main chunk. The remaining properties are inherited from the PostCSS style handler options, including `cssPreflight`, `cssOptions`, `postcssOptions`, `majorVersion`, and `appType`.
