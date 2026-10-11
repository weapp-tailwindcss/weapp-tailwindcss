# @weapp-tailwindcss/postcss

The `/syntax`, `/transform`, and `/plugin` subpaths separate syntax helpers, CSS transformations, and PostCSS generation orchestration. Existing root exports remain available.

> English | [简体中文](./README.zh-CN.md)

This package is the CSS processing core of weapp-tailwindcss. It handles PostCSS AST transforms, selector compatibility, platform differences, and Tailwind output post-processing for mini programs.

## Repeated CSS Comparisons

For repeated comparisons against one CSS string, `createCssRuleMatcher(baseCss)` provides `contains(css)` and `filter(css)` with reusable, lazy comparison indexes. It preserves the semantics of `containsCssAfterMinify` and `filterExistingCssRules`. Create a new matcher when the base CSS changes; release it after the batch.

## Native compiler

The isolated `@weapp-tailwindcss/postcss/native` entry provides `compileNativeCss(css, options)` for CSS-to-native style translation. It returns rules, variables, and warnings. React Native manifest IDs, Tailwind generation, and runtime integration remain in `@weapp-tailwindcss/react-native`; importing its `/runtime` entry does not load this compiler.

## Experimental transforms

Experimental LightningCSS selector transforms live under `@weapp-tailwindcss/postcss/experimental/lightningcss`. They are not exported from the stable root. The `@weapp-tailwindcss/experimental/lightningcss` facade loads the LightningCSS engine; the PostCSS subpath itself only imports its types. The optional peer is needed only by consumers of these experimental types.

## Website

For setup guides, configuration references, and framework examples, see the [official weapp-tailwindcss documentation](https://tw.weapp.dev).
