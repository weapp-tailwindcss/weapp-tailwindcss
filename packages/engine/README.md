# @weapp-tailwindcss/engine

> English | [简体中文](./README.zh-CN.md)

Candidate extraction, source scanning, and style generation for Tailwind CSS 4. Use this package independently or through `weapp-tailwindcss`, its PostCSS package, and CLI.

```ts
import { createTailwindV4Engine, resolveTailwindV4Source } from '@weapp-tailwindcss/engine'

const source = await resolveTailwindV4Source({
  projectRoot: process.cwd(),
  css: '@import "tailwindcss";',
})
const engine = createTailwindV4Engine(source)
const result = await engine.generate({ candidates: ['flex', 'text-red-500'] })
console.log(result.css)
```

The root entry exports candidate extraction, position reports, source scanning, and the v4 API. `@weapp-tailwindcss/engine/v4` exports the v4 API. Both entries support ESM, CJS, and TypeScript. Extract candidates from templates, JavaScript strings, SFCs, and CSS `@apply`, with source positions and valid candidate sets.

Supports `@source`, multiple CSS sources, the design system, bare arbitrary values, incremental generation sessions, and cache disposal. Only Tailwind CSS 4 is supported. There are no v3, multi-version dispatcher, custom generator, or HTML parser compatibility entry points. Platform compatibility transforms belong to `@weapp-tailwindcss/postcss`.

`createTailwindGenerationSession(source, options)` and `createTailwindV4Engine(source, options)` accept an optional `prepareSource(source, designSystem)` callback. It receives the actual CSS selected for the scan mode and returns CSS while sharing the design system used for candidate validation. Limit preparation to generated rule ordering or nonsemantic markers; do not change themes, utilities, variants, configuration, plugins, imports, or source directives. The session retains source metadata, reruns preparation after invalidation, and reuses prepared CSS when candidates are deleted. Keep the callback and its configuration unchanged for the session lifetime.

## Source

The source and corresponding v4 and extraction tests were migrated from the MIT-licensed [tailwindcss-mangle](https://github.com/sonofmagic/tailwindcss-mangle/tree/6bf58cebe073a06dfeac7ed44f55ecff50deb763/packages/engine) commit identified by the npm provenance for `@tailwindcss-mangle/engine@0.2.0`. The original [MIT license](./LICENSE) is retained. This package is maintained independently and does not depend on the old engine or a local submodule at runtime.
