---
title: WeappTailwindcssPostcssPluginOptions
description: >-
  WeappTailwindcssPostcssPluginOptions: API contracts, types, and integration details for cross-platform Tailwind CSS
  workflows.
keywords:
  - weapp-tailwindcss
  - API
  - Interface documentation
  - Configuration items
  - Mini program
  - tailwindcss
  - WeChat applet
  - WeappTailwindcssPostcssPluginOptions
  - WeappTailwindcssPostcssPluginOptions interface
  - WeappTailwindcssPostcssPluginOptions type definition
  - TypeScript
---

# WeappTailwindcssPostcssPluginOptions

`weapp-tailwindcss` PostCSS plugin configuration.

## Properties

### projectRoot?

> Optional | **projectRoot**: `string`

---

### base?

> Optional | **base**: `string`

---

### css?

> Optional | **css**: `string`

---

### packageName?

> Optional | **packageName**: `string`

---

### generator?

> Optional | **generator**: `WeappTailwindcssPostcssGeneratorUserOptions`

Generator configuration to control target and Tailwind configuration paths.

---

### config?

> Optional | **config**: `string`

Tailwind configuration file path.

---

### postcssPlugin?

> Optional | **postcssPlugin**: `string`

Tailwind PostCSS plugin name.

---

### candidates?

> Optional | **candidates**: `Iterable<string>`

Additional candidate class names passed in.

---

### scanSources?

> Optional | **scanSources**: `boolean`

Whether to scan candidate class names in the Tailwind v4 source code entry.

---

### sources?

> Optional | **sources**: `TailwindCandidateSource[]`

Additional incoming Tailwind v4 inline candidate sources.

---

### styleOptions?

> Optional | **styleOptions**: `Partial<IStyleHandlerOptions>`

Additional configuration passed to the applet CSS compatible converter.
