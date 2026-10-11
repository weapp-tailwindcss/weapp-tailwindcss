# @weapp-tailwindcss/source-scan

> English | [简体中文](./README.zh-CN.md)

Shared source descriptions, path identity, glob normalization, matching, exclusion, and grouping for weapp-tailwindcss.

This package does not parse CSS, enumerate files, extract candidates, or generate styles. It depends on neither Tailwind, PostCSS, nor a bundler. Callers inject file enumeration; the engine uses Oxide.

```ts
import { createSourceScanPlan, isFileMatchedByTailwindSourceEntries } from '@weapp-tailwindcss/source-scan'

const entries = createSourceScanPlan({
  base: projectRoot,
  mode: 'explicit',
  entries: [{ base: projectRoot, pattern: '**/*.qxml', negated: false }],
})
const included = isFileMatchedByTailwindSourceEntries(file, entries)
```

`auto` adds the default source; `fallback` adds it only when no positive source is supplied. `explicit` uses only supplied sources, and `disabled` disables automatic discovery while preserving explicit sources. `ignoredPatterns` applies the same exclusions to each source root. Matchers treat exclusion-only lists as filters unless `requirePositive: true` is supplied. File expansion always requires a positive source.

Path identity resolves existing ancestors, preserving symlink identity across deletion and recreation. Windows drive roots, UNC paths and separators are supported. The default template extensions include `.qxml`.

ESM, CJS and TypeScript declarations are available. Node.js: `^22.18.0 || >=24.11.0`.
