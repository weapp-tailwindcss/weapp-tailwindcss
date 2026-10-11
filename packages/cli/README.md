# @weapp-tailwindcss/cli

> English | [简体中文](./README.zh-CN.md)

A Tailwind CSS v4 command-line interface for Web and mini-program CSS. It generates browser-compatible Web CSS by default and can emit mini-program-compatible CSS explicitly with `--target weapp`.

> [!IMPORTANT]
> Versions `3.x` and `4.0.0-alpha.x` on npm belong to the legacy Gulp workflow for native mini programs. The current CLI starts from the `5.x` release line and does not provide the legacy `init`, Sass/Less, or project-directory scanning workflow.

## Installation

```bash
pnpm add -D @weapp-tailwindcss/cli weapp-tailwindcss tailwindcss
```

## Quick start

`weapp-tw` and `weapp-tailwindcss` are equivalent command names:

```bash
pnpm exec weapp-tw -i src/input.css -o dist/output.css
pnpm exec weapp-tw build -i src/input.css -o dist/output.css --minify
pnpm exec weapp-tailwindcss canonicalize "py-3 p-1 px-3"
```

The CLI reuses the Tailwind v4 generator, design system, and CSS transformation APIs from `weapp-tailwindcss`. It neither depends on nor invokes `@tailwindcss/cli`.

## Output targets

| Target | Behavior |
| --- | --- |
| `web` | The default. Preserves Tailwind CSS browser selectors, escaping, and Web semantics. |
| `weapp` | Transforms generated CSS for mini-program style environments. |

`--target weapp` is CSS-only. It does not scan or rewrite WXML, JavaScript, TypeScript, JSX, TSX, or existing WXSS assets. Use the Vite, Webpack, Rspack, or Gulp integrations from `weapp-tailwindcss` for complete mini-program projects.

## Watch mode

Watch mode uses native file-system events through `@parcel/watcher` by default. Pass `--poll` or `--poll=500` to use polling instead. The CLI also falls back automatically when the native watcher is unavailable.

```bash
pnpm exec weapp-tw -i src/input.css -o dist/output.css --watch
pnpm exec weapp-tw -i src/input.css -o dist/output.css --watch --poll=500
```

## Programmatic API

```ts
import { runCli } from '@weapp-tailwindcss/cli'

const exitCode = await runCli(['-i', 'src/input.css', '-o', 'dist/output.css'])
```

Importing the package does not execute the CLI. `runCli` follows the same stdout, stderr, and `process.exitCode` behavior as the binary.

Use `weapp-tw doctor` when integrating or upgrading a project. It only reports duplicate Tailwind generation when a configuration actually references `@tailwindcss/vite` or `@tailwindcss/postcss`; a plain PostCSS config is not treated as an error.

## Documentation

See the [CLI guide](https://tw.weapp.dev/docs/tools/weapp-tw-cli) for all options, stdin/stdout, source maps, watch mode, and `canonicalize`.
