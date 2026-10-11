# @weapp-tailwindcss/css-compat

> English | [简体中文](./README.zh-CN.md)

A framework-independent CSS cascade layer compiler. Version `0.1.0` provides layer registration, ordered compilation and source-aware diagnostics. Generator, scanner, runtime, selector/value transforms and Tailwind defaults remain in their adapters.

## Install and exports

```sh
pnpm add -D @weapp-tailwindcss/css-compat postcss
```

Requires Node `^22.18.0 || >=24.11.0` and PostCSS `^8.5.29`. All four entrypoints ship ESM/CJS and matching declarations:

- Root and `/layers`: `compileCascadeLayers`, `createCascadeLayersPlugin` and options.
- `/diagnostics`: diagnostic types and `CascadeLayerError`.
- `/legacy`: `consumeCascadeLayers`, preserving the existing anchor algorithm.

## AST API

```ts
import { compileCascadeLayers } from '@weapp-tailwindcss/css-compat/layers'
import postcss from 'postcss'

const root = postcss.parse(css, { from: 'input.css' })
const result = compileCascadeLayers(root, {
  mode: 'ordered',
  onConflict: 'warning',
  inputStage: 'native',
})
console.log(result.root.toString(), result.diagnostics)
```

`mode` is required. `ordered` mutates and returns the same Root only after all checks pass. Errors throw `CascadeLayerError` with diagnostics and leave the input content, structure and node identities intact. `preserve` returns the original Root with no diagnostics, suitable for targets supporting native layers.

`onConflict` defaults to `warning`; `error` rejects conservative diagnostics as well. `inputStage` defaults to `native`. Explicitly polyfilled input is rejected by ordered mode. Flattened CSS without provenance cannot recover layer semantics; author `:not(...)` selectors are retained without guessing their origin.

## PostCSS pipeline

```ts
import { createCascadeLayersPlugin } from '@weapp-tailwindcss/css-compat'
import postcss from 'postcss'

const result = await postcss([
  createCascadeLayersPlugin({ mode: 'ordered', onConflict: 'error' }),
]).process(css, { from: 'input.css', to: 'output.css', map: { inline: false } })
```

Complete generation, import expansion, preprocessor conditionals and CSS nesting before ordered compilation. Put the plugin after those processors; it runs in `OnceExit`. Diagnostics become PostCSS warnings with a stable `code` and the full `diagnostic` attached. Standard PostCSS processing retains from/to/map and result messages.

Variable safety analysis needs the original variable scope and layer information. Selector/value transforms can change specificity or introduce overrides; finish them before analyzing the final selectors. Merge inputs before compilation instead of flattening separate fragments and concatenating them.

## Ordered contract and limits

| Capability | Behavior |
| --- | --- |
| Named, repeated, dotted, nested, anonymous and escaped layers | First registration determines sibling order; anonymous identities never merge with author names |
| Normal declarations | Child layers precede direct parent declarations; later layers win; unlayered declarations have highest priority |
| Important declarations | Layer priority reverses; unlayered priority is lowest; fallback order within a layer stays intact |
| Conditions and source maps | Wrappers and sources are retained; conditional first registration is diagnosed |
| Descriptors | Preserved whole, once; cross-layer duplicate or uncertain identities are diagnosed |
| Reprocessing | No-layer input is retained; Root reuse, serialization and processor reuse are stable |
| Different specificity across layers | Potential inversions are diagnosed; ordering cannot emulate arbitrary cascade specificity |

Normal and important declarations are analyzed separately, including selector lists. Property names are tokenizer-decoded while custom properties remain case-sensitive. Aliases and shorthand longhands share property identities. Logical/physical overlap, reset shorthands and unknown properties receive conservative treatment. Selector intersection and mutually exclusive conditions are not proven, so diagnostics may include false positives.

Any remaining `@import`, `revert-layer`, nesting, invalid layer names, unconsumed preprocessor conditionals and explicitly polyfilled input always fail ordered mode, even with `onConflict: 'warning'`. Matching text inside strings and URLs is not interpreted as syntax. Independent whitespace around dotted layer separators is invalid; comments and escape-terminating whitespace are supported.

## Diagnostics

Diagnostics contain `code`, `severity`, `message`, `suggestion`, available source file/line/column and optional `related`, `layer`, `selector` and `property`. Nodes without source metadata do not get invented positions.

| Code | Meaning |
| --- | --- |
| `LAYER_OPTIONS` | Invalid API options |
| `LAYER_INPUT_STAGE` | Explicitly polyfilled input |
| `LAYER_IMPORT` | Remaining import or invalid prologue location |
| `LAYER_REVERT` | Unsupported revert-layer |
| `LAYER_NESTING` | Remaining nesting or invalid declaration location |
| `LAYER_NAME` | Invalid layer name/list |
| `LAYER_PREPROCESSOR` | Unconsumed conditional compilation |
| `LAYER_CONDITIONAL_ORDER` | Conditional first layer registration |
| `LAYER_SPECIFICITY` | Potential cross-layer specificity inversion |
| `LAYER_SELECTOR_UNKNOWN` | Selector cannot be reliably analyzed |
| `LAYER_DESCRIPTOR_ORDER` | Cross-layer descriptor semantics need validation |
| `LAYER_WRAPPER_SEMANTICS` | Unknown/scoping wrapper equivalence cannot be proven |

## Scope and migration

One Root represents one merged cascade scope. Merge using the actual import/build graph. Isolated components, independent subpackages and different targets require separate compilation. The caller owns graph relationships, caching and HMR invalidation; every compiler call owns independent state.

`@weapp-tailwindcss/postcss/transform` continues re-exporting `consumeCascadeLayers(root)` from `/legacy`, including its existing limitations. The new API does not switch the published Tailwind layer defaults. Tailwind preflight/theme/components markers and Panda codec/recipes/runtime stay with their adapters.

For Panda 2.1.2, disable generator polyfilling and pass generated CSS to this public plugin. Isolated tarball tests exercise real generated CSS without changing the Panda repository. Selector, variable, unit and color compatibility are follow-up work.

## Verification

```sh
pnpm --filter @weapp-tailwindcss/css-compat build
pnpm --filter @weapp-tailwindcss/css-compat test
pnpm --filter @weapp-tailwindcss/css-compat typecheck
pnpm --filter @weapp-tailwindcss/css-compat properties:check
pnpm --filter @weapp-tailwindcss/css-compat test:package
pnpm --filter @weapp-tailwindcss/css-compat test:consumers
pnpm --filter @weapp-tailwindcss/css-compat test:browser
pnpm --filter @weapp-tailwindcss/css-compat bench
```

Consumer tests require this checkout's PostCSS and generation-engine dependency builds. Browser tests require the installed Playwright version's Chromium, Firefox and WebKit binaries and fail if unavailable. Each engine runs headlessly and releases its browser/context/page. Package/browser evidence does not constitute WeChat or device acceptance. The compact property table is generated from pinned `mdn-data@2.37.2` (CC0-1.0) with explicit shorthand corrections; regenerate with `properties:generate`.
