# @weapp-tailwindcss/escape

> [English](./README.md) | 简体中文

小程序类名的 escape/unescape 基础包，现由 weapp-tailwindcss monorepo 维护，以 `@weapp-tailwindcss/escape` 发布，独立版本从 0.0.1 开始；实现来自 `@weapp-core/escape@8.0.0`。

```sh
pnpm add @weapp-tailwindcss/escape
```

```ts
import { escape, MappingChars2String, unescape } from '@weapp-tailwindcss/escape'

const options = { map: MappingChars2String }
const className = escape('hover:bg-red-500', options)
const original = unescape(className, options)
```

支持 ESM import 和 CommonJS require。`EscapeOptions`、`UnescapeOptions` 提供 `map` 和 `ignoreHead`，双向转换应使用一致配置。本次迁移保持已有映射和转换语义。

导出包含 `escape`、`unescape`、`isAllowedClassName`、`isAsciiNumber`、`MappingChars2String`、`ComplexMappingChars2String` 及其 entries、`SYMBOL_TABLE`、`MAX_ASCII_CHAR_CODE`、`toEscapeOptions`、`toUnescapeOptions` 和相关 TypeScript 类型。

源码来源、发布切换见[迁移记录](./MIGRATION.md)，跨包调用关系见[维护规则](./AGENTS.md)。
