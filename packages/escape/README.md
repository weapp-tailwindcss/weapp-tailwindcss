# @weapp-tailwindcss/escape

> English | [简体中文](./README.zh-CN.md)

Escape and unescape mini-program class names. This package is maintained in the weapp-tailwindcss monorepo and is published as `@weapp-tailwindcss/escape` with an independent version starting at 0.0.1. The implementation originates from `@weapp-core/escape@8.0.0`.

```sh
pnpm add @weapp-tailwindcss/escape
```

```ts
import { escape, MappingChars2String, unescape } from '@weapp-tailwindcss/escape'

const options = { map: MappingChars2String }
const className = escape('hover:bg-red-500', options)
const original = unescape(className, options)
```

Both ESM imports and CommonJS require are supported. `EscapeOptions` and `UnescapeOptions` accept `map` and `ignoreHead`; use the same options on both sides. Existing mappings and conversion semantics are unchanged by the migration.

Exports include `escape`, `unescape`, `isAllowedClassName`, `isAsciiNumber`, `MappingChars2String`, `ComplexMappingChars2String`, their entry arrays, `SYMBOL_TABLE`, `MAX_ASCII_CHAR_CODE`, `toEscapeOptions`, `toUnescapeOptions`, and the corresponding TypeScript types.

See [source provenance and release handover](./MIGRATION.md) and [maintenance boundaries](./AGENTS.md).
