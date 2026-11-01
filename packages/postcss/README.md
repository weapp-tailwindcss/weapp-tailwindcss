# @weapp-tailwindcss/postcss

The `/syntax`, `/transform`, and `/plugin` subpaths separate syntax helpers, CSS transformations, and PostCSS generation orchestration. Existing root entry points remain available; the pipeline API migration below changes the returned contract.

> English | [简体中文](./README.zh-CN.md)

This package is the CSS processing core of weapp-tailwindcss. It handles PostCSS AST transforms, selector compatibility, platform differences, and Tailwind output post-processing for mini programs.

## Repeated CSS Comparisons

For repeated comparisons against one CSS string, `createCssRuleMatcher(baseCss)` provides `contains(css)` and `filter(css)` with reusable, lazy comparison indexes. It preserves the semantics of `containsCssAfterMinify` and `filterExistingCssRules`. Create a new matcher when the base CSS changes; release it after the batch.

## Pipeline API migration (major)

`createStylePipeline(options)` and `handler.getPipeline()` synchronously return a discriminated `StyleProcessingPipeline`. Use its common Promise API to execute either variant:

```ts
import { createStyleHandler, postcss } from '@weapp-tailwindcss/postcss/transform'

const handler = createStyleHandler({ cssPreflight: false })
const pipeline = handler.getPipeline()
const result = await pipeline.process('.card { width: calc(1px + 2px) }', { from: undefined })

if (pipeline.kind === 'flat') {
  // The array and each node.plugin are real AcceptedPlugin values.
  const native = postcss(pipeline.plugins).process('.card { color: red }', { from: undefined })
  console.log(native.css)
}
console.log(result.css)
```

The `flat` variant retains `plugins`, `nodes[].plugin`, and native PostCSS composition, including native synchronous behavior. The `phased` variant exposes semantic `nodes` and explicit first-prepare `controls`; it has no plugin array or Processor interface. Its author options capture precedes author preparation, and its platform message handoff precedes platform preparation. Call `await pipeline.process(input, processOptions, afterPlugins)` directly; its Promise does not provide `.sync()`, `.async()` or `.use()`. `afterPlugins` is the native platform tail list, including native `prepare` timing, rather than another completed phase.

A phased plan is selected only on the former author-wrapper path: after native UVUE author early returns, the actual calc plugin must exist and the configured author list must be nonempty. An author list normalized by PostCSS to no members skips author execution. The first native `process` receives the original input and options, including Result, LazyResult, Document, and objects with `toString()`. Its constructor errors keep native synchronous timing; subsequent asynchronous and platform errors reject the Promise. Pending asynchronous LazyResults are not implicitly awaited or retried.

Authors finish traversal and serialization before platform preparation. The platform receives their final Root or Document and exact messages in a separate array. Author processing uses one shallow options shell with `map: false`; the platform uses the captured original options object, including native mutations from the initial input/parser. The author Result's generated map is not injected as a new `prev` map. Each phased plan retains normalized author/preset instances, while each phased execution creates a context and library pre/post instances. Third-party closures remain shared. Existing cache admissions still apply; a CSS result cache hit does not execute plugins again.

**Document migration:** authors now process the whole Document once. Their `prepare`, legacy transformer, Result, and serialization count changes from one per child Root to one per Document; native object `Once`/`OnceExit` still run per child Root. Replacement roots now reach the platform. Author source-map annotation cleanup follows whole-Document native behavior, so child Root annotations can remain where the former per-child wrapper removed them. Consumers requiring the old per-child contract must explicitly orchestrate their own child processing. Synchronous construction does not resolve module strings or factory tuples; the handler's existing external configuration path continues to own that normalization.

Handler protection, external-author recursion, framework/compiler finalizers, and terminal source-map limitations retain their existing policies. This migration does not establish that every final map matches all later CSS rewriting.

## Native compiler

The isolated `@weapp-tailwindcss/postcss/native` entry provides `compileNativeCss(css, options)` for CSS-to-native style translation. It returns rules, variables, and warnings. React Native manifest IDs, Tailwind generation, and runtime integration remain in `@weapp-tailwindcss/react-native`; importing its `/runtime` entry does not load this compiler.

`unsupportedVariant(className)` returns the first variant outside `dark`, `ios`, `android`, and `native`, allowing native adapters to reject compound browser conditions before deriving a rule from a generated base class.

`@weapp-tailwindcss/postcss/native-runtime` exposes the pure JavaScript `resolveNativeBoxShadow()` value interpreter. It resolves class variables using each declaration's source defaults, without loading the PostCSS compiler, Node APIs, or Tailwind generation.

## Experimental transforms

Experimental LightningCSS selector transforms live under `@weapp-tailwindcss/postcss/experimental/lightningcss`. They are not exported from the stable root. The `@weapp-tailwindcss/experimental/lightningcss` facade loads the LightningCSS engine; the PostCSS subpath itself only imports its types. The optional peer is needed only by consumers of these experimental types.

## Website

For setup guides, configuration references, and framework examples, see the [official weapp-tailwindcss documentation](https://tw.weapp.dev).
