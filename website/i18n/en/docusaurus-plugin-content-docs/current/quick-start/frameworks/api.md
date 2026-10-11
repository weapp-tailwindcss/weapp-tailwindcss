---
title: Node.js API
description: Use weapp-tailwindcss/core to handle Tailwind CSS, applet templates, and JavaScript in self-developed builders or scripts, and correctly maintain runtime class name collections.
keywords:
  - Node.js API
  - createCompiler
  - snapshot
  - createContext
  - transformJs
  - transformWxml
  - transformWxss
  - runtimeSet
  - classNameSet
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - Self-developed builder
---

# Node.js API

`weapp-tailwindcss/core` provides a framework compiler and text transforms without depending on Vite, Webpack, or Gulp lifecycles. New integrations should use `createCompiler()` for Tailwind roots, revisions, and immutable snapshots. `createContext()` remains available with its existing automatic runtime behavior.

:::caution Advanced entrance

For ordinary `uni-app`, Taro, Mpx, weapp-vite or native applet projects, the corresponding Vite, Webpack or Gulp plug-ins should be used first. The builder plugin already takes care of CSS entry, module graphs, watch/HMR, caching, and product writeback; the Core API hands these responsibilities off to the caller.

Current package requirements Node.js `^22.18.0 || >=24.11.0`.

:::

## First understand the boundaries of responsibilities

The Core API only processes incoming memory text. It will not scan the output directory, write files for you, and will not automatically add CSS entries to the build graph just because `cssEntries` is configured.

| Capabilities                       | Core API Responsible                                                                     | Caller Responsible                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Collection of Tailwind class names | Collect, cache, and refresh from explicitly configured Tailwind CSS entries and sources  | Ensure entries and sources are correct, and trigger refreshes at the appropriate build phases               |
| CSS                                | Convert the generated CSS into a target-compatible style                                 | Let the Tailwind CSS portal actually participate in the generation and hand the result to `transformWxss()` |
| Templates such as WXML / AXML      | Escape confirmed class names in static classes and expressions                           | Read, write back products and select the correct platform template file                                     |
| JavaScript                         | Only translate classes confirmed by runtime collection, retain ordinary business strings | Handle parsing errors, source maps, associated modules and file writeback                                   |
| watch / HMR                        | Reuse runtime cache in the same context                                                  | Monitor source code and configuration changes and re-collect the runtime collection after changes           |

Style generation for Tailwind CSS v4 must continue to be taken over by the `weapp-tailwindcss` link. Do not additionally register `@tailwindcss/postcss` or `@tailwindcss/vite` as a build fallback for the Core API.

## Framework API with `createCompiler()`

`createCompiler()` is intended for framework authors such as vite-plugin-taro and weapp-vite that already own a module graph and asset lifecycle. It reuses the Tailwind engine, Scanner, candidate index, and source graph without guessing source directories, normalizing module IDs, or writing build output.

```ts
import path from 'node:path'
import { createCompiler } from 'weapp-tailwindcss/core'

const projectRoot = process.cwd()
const compiler = createCompiler({ appType: 'taro' })
const generated = await compiler.generate({
  id: 'virtual:tailwind/main',
  sourceOptions: {
    projectRoot,
    cssEntries: [path.resolve(projectRoot, 'src/tailwind.css')],
  },
  candidates: ['p-4', 'w-[10px]'],
  scanSources: false,
  target: 'web',
})

const cssResult = await compiler.transformCss(generated.css, generated.snapshot)
const template = await compiler.transformTemplate(rawTemplate, generated.snapshot)
const jsResult = await compiler.transformJavaScript(rawJs, generated.snapshot)
```

| Method                      | Contract                                                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate(request)`         | Generates `web`, `weapp`, or raw Tailwind CSS for an opaque root ID and returns revision, incremental CSS, dependencies, source patterns, cache reuse state, and a snapshot |
| `createSnapshot(request)`   | Imports a classSet already validated by another Tailwind generation chain without sharing the input Set                                                                     |
| `mergeSnapshots(snapshots)` | Deterministically merges roots reachable in the caller's module graph and rejects conflicting revisions, content, or targets                                                |
| `transformCss()`            | Transforms CSS text without scanning the runtime classSet                                                                                                                   |
| `transformCssRoot()`        | Transforms a PostCSS Root without mutating the input or sharing mutable output ASTs                                                                                         |
| `transformTemplate()`       | Transforms only static classes and expression candidates that exactly match the snapshot                                                                                    |
| `transformJavaScript()`     | Returns the existing `JsHandlerResult`, including `error`, `map`, and `linked`                                                                                              |
| `invalidate(ids)`           | Exactly matches root and dependency IDs and returns affected roots without path or query normalization                                                                      |
| `remove(id)` / `dispose()`  | Idempotently wait for active work and release root, generator, and Scanner state                                                                                            |

Generations for one root commit serially while different roots can run in parallel. Candidate-only updates reuse the engine. CSS or configuration dependency invalidation replaces the session. A failed generation does not replace the last successful snapshot, and no new work is accepted after disposal begins.

Normal subpackages usually merge the main and current subpackage snapshots. Independent subpackages keep their own snapshot:

```ts
const normalSnapshot = compiler.mergeSnapshots([main.snapshot, subpackage.snapshot])
const independentSnapshot = independent.snapshot

const affectedRoots = compiler.invalidate(changedModuleIds)
// Schedule generate() for affected roots and write assets through the bundler API.
```

The public classSet is immutable and isolated. Transform hot paths retrieve the internal Set in O(1); do not rebuild snapshots with heuristic candidates.

The default `graph` path of the official Vite, Webpack, Rspack, and Gulp adapters shares one compiler session. Adapters still own the module graph, watch/HMR scheduling, subpackage reachability, and asset writeback; Core receives only explicit sources, dependencies, and candidates. Third-party frameworks can follow the same boundary without importing bundler types or treating module IDs as filesystem paths.

## Configure Tailwind CSS entry

Tailwind CSS v4 projects should pass the absolute path to `cssEntries`. The entry is used to identify `@import "tailwindcss"`, `@source` and `@config`, but it still must be actually loaded by your build process.

```css title="src/tailwind.css"
@import "tailwindcss" source(none);

@source "./**/*.{html,wxml,js,ts,jsx,tsx,vue}";
@source not "../dist";
@source not "../unpackage";
```

```js
import path from 'node:path'
import { createContext } from 'weapp-tailwindcss/core'

const root = process.cwd()
const cssEntry = path.resolve(root, 'src/tailwind.css')

const ctx = createContext({
  tailwindcssBasedir: root,
  cssEntries: [cssEntry],
})
```

Multiple entry, subcontracted or individually subcontracted projects should list all true entries. `cssEntries` is equivalent to the quick configuration of `tailwindcss.v4.cssEntries`. See [`UserDefinedOptions`](/docs/api/interfaces/UserDefinedOptions) and [`cssEntries`](/docs/api/options/important#cssentries) for complete configuration types.

## Compatible `createContext()` API

The four methods returned by `createContext(options)` share the same set of Tailwind runtime states and class names.

| Methods                                | Inputs          | Return Values          | Key Behaviors                                                             |
| -------------------------------------- | --------------- | ---------------------- | ------------------------------------------------------------------------- |
| `getRuntimeSet(options?)`              | Refresh options | `Promise<Set<string>>` | Collect or refresh Tailwind confirmed runtime class names                 |
| `transformWxss(rawCss, options?)`      | Generated CSS   |
| `transformWxml(rawTemplate, options?)` | Template string | `Promise<string>`      | Escape confirmed class names in class attributes and template expressions |
| `transformJs(rawJs, options?)`         | JS string       |

:::warning The return value is not of the same type

Don’t treat the return values of the three transforms as strings:

- `transformWxss()` returns PostCSS Result with final CSS in `result.css`.
- `transformWxml()` returns a string directly.
- `transformJs()` returns the object and the final JavaScript is in `result.code`.

:::

## Recommended calling sequence

A production build cycle is recommended to follow the following sequence:

1. Create and reuse an `createContext()`, do not recreate the context for each file.
2. Let the Tailwind CSS portal enter the actual generation link first to obtain the CSS to be adapted.
3. Call `transformWxss()` to process the main style; after this step, the internal runtime collection will be synchronized.
4. Call `getRuntimeSet()` to read the same collection, or explicitly force the collection in a custom lifecycle.
5. Call `transformWxml()` and `transformJs()` using the same context.
6. Check for JS parsing errors, and then have your builder write back the results through its own product API or file flow.

If your build process processes templates or JavaScript first, you can also call:

```js
const runtimeSet = await ctx.getRuntimeSet({
  forceCollect: true,
})
```

When `runtimeSet` is not passed in explicitly, `transformWxml()` and `transformJs()` are automatically collected once when the internal collection is empty. The value of explicit calls is to make build phases, error localization, and watch refreshes clearer.

## Complete file processing example

The following assumes that the upstream build step has written Tailwind CSS to `.build/tailwind.generated.css`. The example only shows the memory translation and file writeback boundaries of the Core API.

```js title="scripts/transform.mjs"
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createContext } from 'weapp-tailwindcss/core'

const root = process.cwd()
const sourceRoot = path.resolve(root, 'src')
const outputRoot = path.resolve(root, 'dist')

const ctx = createContext({
  tailwindcssBasedir: root,
  cssEntries: [path.resolve(sourceRoot, 'tailwind.css')],
  rem2rpx: true,
})

async function main() {
  const [generatedCss, rawWxml, rawJs] = await Promise.all([
    readFile(path.resolve(root, '.build/tailwind.generated.css'), 'utf8'),
    readFile(path.resolve(sourceRoot, 'pages/index/index.wxml'), 'utf8'),
    readFile(path.resolve(sourceRoot, 'pages/index/index.js'), 'utf8'),
  ])

  const cssResult = await ctx.transformWxss(generatedCss)
  const runtimeSet = await ctx.getRuntimeSet()
  const wxmlCode = await ctx.transformWxml(rawWxml)
  const jsResult = await ctx.transformJs(rawJs)

  if (jsResult.error) {
    throw jsResult.error
  }

  console.log(`collected ${runtimeSet.size} Tailwind classes`)

  await mkdir(path.resolve(outputRoot, 'pages/index'), { recursive: true })
  await Promise.all([
    writeFile(path.resolve(outputRoot, 'app.wxss'), cssResult.css),
    writeFile(path.resolve(outputRoot, 'pages/index/index.wxml'), wxmlCode),
    writeFile(path.resolve(outputRoot, 'pages/index/index.js'), jsResult.code),
  ])
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

CommonJS projects can use `const { createContext } = require('weapp-tailwindcss/core')`, and the rest of the API contract is consistent.

## `getRuntimeSet()` Refresh options

The default call will give priority to reusing caches whose signatures have not changed; if the first result is empty, the runtime will be refreshed and collected again.

| Options | Behavior | Applicable scenarios |
| ------- | -------- | -------------------- |
|         |
|         |
|         |
|         |

`clearCache: true` used alone does not guarantee triggering a refresh and should be combined with `forceCollect` or `forceRefresh`.

```js
// First build or ordinary source code changes
await ctx.getRuntimeSet({ forceCollect: true })

// Tailwind configuration, entry or source map changes
await ctx.getRuntimeSet({
  forceRefresh: true,
  clearCache: true,
})
```

Collections must be refreshed in watch/HMR before affected JS and templates are processed. Do not use heuristic escaping to make up for expired collections; when the new class has not yet entered the collection, it is safer to keep the original value than to accidentally change the business string.

`jsArbitraryValueFallback` is deprecated and is only used for compatibility with older configurations. Neither `true` nor `'auto'` bypasses `classNameSet`; when the set is empty or the candidate is not hit, `transformJs()` keeps the source code unchanged.

## Security boundary of `runtimeSet`

The core principle of `transformJs()` is that `classNameSet` is an exact hit: only classes generated or verified by Tailwind can enter the translation path of ordinary JS strings.

```js
const rawJs = [
  'const className = "text-[12px] w-1/2"',
  'callApi("order/get_order_amount", {}, "POST")',
].join('\n')

const { code, error } = await ctx.transformJs(rawJs)

if (error) {
  throw error
}

// text-[12px] w-1/2 -> text-_b12px_B w-1_f2
// order/get_order_amount remains as is
console.log(code)
```

`transformJs(rawJs, { runtimeSet })` is a coverage entry for testing and deep integration of self-developed builders. The following constraints should be observed when passing it in:

- Collection should come from build/validation results of `getRuntimeSet()` or Tailwind v4.
- Don't stuff all strings found by the scanner directly into the collection.
- Do not treat API, routes, resource paths, MIME or log text as classes.
- Do not modify an `Set` that is being reused by other concurrent transformations; use the new collection snapshot after refreshing.

As of `weapp-tailwindcss@5.1.8`, there is additional protection for normal slash paths in non-class contexts, but this is only defense in depth and not a substitute for proper candidate validation. See [issue #903](https://github.com/sonofmagic/weapp-tailwindcss/issues/903) for related regression.

## Exactly ignore conflicting strings

Normal projects do not need to configure ignore rules for API paths. If the business string is indeed identical to a valid Tailwind class, you can choose local or global protection.

### Partial protection

A label template named `weappTwIgnore` is recognized by default:

```js
import { weappTwIgnore } from 'weapp-tailwindcss/escape'

const value = weappTwIgnore`w-1/2`
```

### Global rules

```js
const ctx = createContext({
  jsPreserveClass: keyword => keyword.startsWith('internal-route:'),
})
```

`jsPreserveClass` Retains the current string when returning `true`. See [`jsPreserveClass`](/docs/api/options/important#jspreserveclass) and [`ignoreTaggedTemplateExpressionIdentifiers`](/docs/api/options/important#ignoretaggedtemplateexpressionidentifiers) for detailed configuration.

:::danger Use with caution `alwaysEscape`

`transformJs(rawJs, { alwaysEscape: true })` bypasses the `classNameSet` security boundary. It is only suitable for dedicated conversion steps where the input content has been determined to be all classes, and should not be enabled for normal business JavaScript.

:::

## Return value and error handling

### `transformWxss()`

Return PostCSS Result. Commonly used fields include:

- `css`: Final target-side CSS.
- `map`: PostCSS source map after enabling source map.
- `messages`: Metadata and hints generated by the PostCSS plugin.
- `warnings()`: Collect PostCSS warning.

If `isMainChunk` is not passed, it will be processed according to the main style by default. When dealing with subcontracted or secondary styles, you should explicitly pass in the correct `IStyleHandlerOptions` according to your build graph.

### `transformWxml()`

Return the template string directly. The collection used by the current call can be overridden via `{ runtimeSet }`, but generally the collections maintained automatically by the context should be reused.

### `transformJs()`

Return `JsHandlerResult`:

- `code`: Transformed JavaScript; keep original input when parsing fails.
- `map`: source map generated when enabled.
- `error`: Babel parsing error. The Core API will put errors in the result, and the caller must actively check.
- `linked`: The associated module results generated after enabling `filename + moduleGraph` cross-module analysis are keyed by absolute paths; the caller is responsible for handing them back to the build graph.

Except for the explicit underlying parameter `alwaysEscape: true`, `transformJs()` only translates candidates that exactly hit the current `classNameSet`. Empty sets, missing sets, and miss candidates are left intact.

## Troubleshooting common problems

| Phenomenon                                                     | Priority Check                                                                                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt "cssEntries not detected"                               | Whether the absolute path is passed in; whether the entry really contains a Tailwind reference                                                        |
| CSS has classes, JS/WXML has no escape                         | Whether `@source` covers the source code; whether the collection is collected before Tailwind generation is completed                                 |
| Watch new class does not take effect                           | Whether to call `getRuntimeSet({ forceCollect: true })` after the source code changes, and convert the product after refreshing                       |
| Still using old results after modifying Tailwind configuration | Calling `getRuntimeSet({ forceRefresh: true, clearCache: true })`                                                                                     |
| The API, route or resource path is rewritten                   | Upgrade to the latest version; confirm that `alwaysEscape` is not used, and check whether the manual `runtimeSet` is contaminated by ordinary strings |
|                                                                |
| `cssEntries` is configured but there is no CSS product         | `cssEntries` only provides entry semantics and does not replace the builder to load or generate CSS                                                   |

## Differences from builder plugins

| How to use                  | Suitable for scenarios                                 | Build life cycle                                                              |
| --------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
|                             |
| `weapp-tailwindcss/webpack` | Webpack, Taro Webpack, Mpx                             | Plugin accepts compilation, loader and product diagram                        |
| `weapp-tailwindcss/gulp`    | Streaming construction of native applet                | Plug-in takes over Vinyl files and incremental tasks                          |
| `weapp-tailwindcss/core`    | Self-developed builder, batch script, platform adapter | The caller explicitly organizes generation, refresh, conversion and writeback |

For ordinary projects, please read [Tailwind CSS 4 Default Mode Reference] (/docs/tailwindcss/v4-reference) first, and then select the access page of the corresponding framework.
