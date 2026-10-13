<p align="center">
  <a href="https://tw.weapp.dev">
    <img src="./assets/logo.png" alt="weapp-tailwindcss logo" width="128">
  </a>
</p>

<h1 align="center">weapp-tailwindcss</h1>

<p align="center">
  <strong>Bring Tailwind CSS to every platform!</strong>
</p>

<p align="center">
  <a href="./README.md">简体中文</a> | English
</p>

<p align="center">
  <a href="https://tw.weapp.dev">Website</a> ·
  <a href="https://tw.weapp.dev/docs/intro">Docs</a> ·
  <a href="https://tw.weapp.dev/docs/quick-start/install">Quick Start</a> ·
  <a href="https://tw.weapp.dev/docs/tools/weapp-tw-cli">CLI</a> ·
  <a href="https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/demo">Examples</a>
</p>

<p align="center">
  <a href="https://github.com/weapp-tailwindcss/weapp-tailwindcss/stargazers"><img src="https://badgen.net/github/stars/weapp-tailwindcss/weapp-tailwindcss" alt="GitHub stars"></a>
  <a href="https://www.npmjs.com/package/weapp-tailwindcss"><img src="https://badgen.net/npm/dm/weapp-tailwindcss" alt="npm downloads"></a>
  <a href="https://www.npmjs.com/package/weapp-tailwindcss"><img src="https://badgen.net/npm/license/weapp-tailwindcss" alt="license"></a>
  <a href="https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/workflows/ci.yml"><img src="https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://codecov.io/gh/weapp-tailwindcss/weapp-tailwindcss"><img src="https://codecov.io/gh/weapp-tailwindcss/weapp-tailwindcss/branch/main/graph/badge.svg?token=zn05qXYznt" alt="codecov"></a>
  <a href="https://deepwiki.com/weapp-tailwindcss/weapp-tailwindcss"><img src="https://deepwiki.com/badge.svg" alt="DeepWiki"></a>
</p>

## What It Is

`weapp-tailwindcss` is a cross-platform Tailwind CSS toolchain. It brings one utility-first development experience to Web/H5, mini programs, App WebViews, React Native, and Lynx.

The core package owns Tailwind CSS v4 generation, class transforms, platform compatibility, and builder lifecycle integrations. Platform and runtime packages extend the same workflow to different renderers and application frameworks.

The goal is simple: use one Tailwind input and generate the correct artifact for each target, instead of maintaining disconnected class rules for every platform.

## Support Matrix

| Target | Recommended entry | Use it for |
| --- | --- | --- |
| Web / H5 | `weapp-tailwindcss/vite/web` (CSS-only), `weapp-tailwindcss/vite`, `/webpack`, `/rspack`, `/gulp`, or the Node API | Browser CSS, H5, and regular Web builds |
| Mini programs | The matching builder entry, or `@weapp-tailwindcss/cli --target weapp` | WeChat, Alipay, Douyin, QQ, and other mini-program CSS |
| App WebView | `weapp-tailwindcss` framework integrations | App WebView builds from frameworks such as uni-app and Taro |
| uni-app x | `weapp-tailwindcss/vite` | Native Android, iOS, and HarmonyOS application builds |
| React Native / Expo | `@weapp-tailwindcss/react-native` | Metro, Babel, and React Native style manifests |
| ReactLynx / Rspeedy | `@weapp-tailwindcss/lynx` | Lynx CSS and Rspeedy builds |

The current mainline targets Tailwind CSS v4. Each integration reuses the core generator, while CSS properties and selectors still need to be verified against the real target runtime.

## Quick Start

### 1. Install Tailwind CSS and the core package

```bash
pnpm add -D tailwindcss weapp-tailwindcss
```

### 2. Create a CSS-first entry

```css
@import "tailwindcss";

@source "./**/*.{html,js,ts,jsx,tsx,vue}";
@source not "../node_modules";
@source not "../dist";
```

The entry must be imported by the project. `cssEntries` tells the generator which Tailwind entry to track; it does not replace the bundler module graph.

### 3. Register the builder integration

For a pure Web project, use the CSS-only Vite entry:

```ts
import { defineConfig } from 'vite'
import { WeappTailwindcssWeb } from 'weapp-tailwindcss/vite/web'

export default defineConfig({
  plugins: [
    WeappTailwindcssWeb(),
  ],
})
```

`vite/web` only handles Tailwind CSS generation, CSS transforms, CSS HMR, and Web CSS finalization. It does not register JavaScript/template transforms, framework extensions, subpackage processing, or mini-program finalizers. The built-in `styleInjector` is disabled by default and is enabled only when explicitly configured. SSR, library mode, `optimizeDeps`, `cssMinify`, and sourcemaps remain Vite responsibilities; the CSS entry must be imported into Vite's module graph.

When the same build also needs mini-program output, framework extensions, or multiple entries, use the main `weapp-tailwindcss/vite` entry and set `generator.target` or `platform` explicitly. An unmarked Generic Vite project automatically reuses the Web CSS-only profile after Vite resolves its configuration.

See the [framework integration guides](https://tw.weapp.dev/docs/quick-start/frameworks/uni-app-vite) for Webpack, Rspack, Gulp, Taro, uni-app, Mpx, and native mini-program projects.

## Canonical Templates

The repository includes independently installable and verifiable minimal templates:

- [uni-app + Vue 3](./templates/uni-app-tailwindcss-v4)
- [Taro + Vite + React](./templates/taro-vite-tailwindcss-v4)
- [weapp-vite native mini program](./templates/weapp-vite-tailwindcss-v4)

These templates use `weapp-tailwindcss` as the only Tailwind CSS generator. Do not add `@tailwindcss/postcss` or `@tailwindcss/vite`. See the [support matrix](./website/i18n/en/docusaurus-plugin-content-docs/current/reference/support-matrix.md) for automated and local evidence.

## CLI

For standalone CSS builds, watch mode, or canonicalization, install `@weapp-tailwindcss/cli`:

```bash
pnpm add -D @weapp-tailwindcss/cli weapp-tailwindcss tailwindcss

# Generate Web CSS by default
pnpm exec weapp-tw -i src/app.css -o dist/output.css

# Explicitly generate mini-program-compatible CSS
pnpm exec weapp-tw -i src/app.css -o dist/app.wxss --target weapp
```

The CLI defaults to `web` and supports stdin/stdout, watch mode, native watchers, `--poll`, minify, optimize, source maps, and `canonicalize`. `--target weapp` is CSS-only: it does not scan or rewrite WXML, JS, TS, JSX, or TSX, and it does not replace a full project builder integration.

See the complete [weapp-tw CLI guide](https://tw.weapp.dev/docs/tools/weapp-tw-cli) for all options and compatibility commands.

## Choose The Right Package

| Need | Package |
| --- | --- |
| Tailwind CSS generation, class transforms, and builder integrations | `weapp-tailwindcss` |
| Standalone CSS CLI, watch, and canonicalize | `@weapp-tailwindcss/cli` |
| PostCSS AST transforms, selector compatibility, and CSS platform transforms | `@weapp-tailwindcss/postcss` |
| React Native / Expo compilation | `@weapp-tailwindcss/react-native` |
| ReactLynx / Rspeedy integration | `@weapp-tailwindcss/lynx` |
| Runtime `twMerge`, `tv`, and `cva` utilities | `@weapp-tailwindcss/runtime`, `@weapp-tailwindcss/merge`, `@weapp-tailwindcss/variants`, `@weapp-tailwindcss/cva` |
| Typography, theme transitions, and cross-platform UI | `@weapp-tailwindcss/typography`, `theme-transition`, `@weapp-tailwindcss/ui` |

## Important Boundaries

- Tailwind CSS v4 generation is owned by `weapp-tailwindcss`. Do not register `tailwindcss`, `@tailwindcss/postcss`, or `@tailwindcss/vite` as a second generator in mini-program builds.
- JS and WXML classes are transformed only when they belong to the exact candidate set confirmed by the Tailwind generator. Ordinary business strings are not rewritten heuristically.
- Builder integrations use Vite, Webpack, Rspack, and Gulp lifecycle APIs to preserve source, style, dependency, and watch relationships instead of reconstructing state from a post-build directory scan.
- React Native, Lynx, and mini-program CSS capabilities are not identical to browser CSS. Validate unsupported properties, selectors, and runtime behavior on the actual target.

## Requirements

- Node.js `^22.18.0 || >=24.11.0`
- Tailwind CSS `>=4.0.0`
- HBuilderX `>=5.11` for `uni-app` / `uni-app x` projects using HBuilderX

## Documentation And Examples

- [Official website](https://tw.weapp.dev)
- [Install and quick start](https://tw.weapp.dev/docs/quick-start/install)
- [Tailwind CSS v4 guide](https://tw.weapp.dev/docs/tailwindcss/v4-reference)
- [Framework integrations](https://tw.weapp.dev/docs/quick-start/frameworks/uni-app-vite)
- [React Native / Expo](https://tw.weapp.dev/docs/quick-start/react-native-expo)
- [ReactLynx / Rspeedy](https://tw.weapp.dev/docs/quick-start/frameworks/lynx)
- [uni-app x configuration reference](https://tw.weapp.dev/docs/config/uni-app-x)
- [ReactLynx / Rspeedy configuration reference](https://tw.weapp.dev/docs/config/react-lynx)
- [React Native / Expo configuration reference](https://tw.weapp.dev/docs/config/react-native)
- [Multi-platform guide](https://tw.weapp.dev/docs/multi-platform)
- [API reference](https://tw.weapp.dev/docs/api/interfaces/UserDefinedOptions)
- [CLI guide](https://tw.weapp.dev/docs/tools/weapp-tw-cli)
- [Framework examples](https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/demo)
- [React Native and Lynx examples](https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/examples)
- [Mirror documentation](https://ice-tw.netlify.app/)

## AI Skills

The official suite contains one router plus seven focused workflows for setup, migration, troubleshooting, runtime classes, custom builds, React Native, and ReactLynx. Install the complete suite with:

```bash
npx skills add sonofmagic/skills \
  --skill weapp-tailwindcss \
  --skill weapp-tailwindcss-setup \
  --skill weapp-tailwindcss-migrate \
  --skill weapp-tailwindcss-troubleshoot \
  --skill weapp-tailwindcss-runtime \
  --skill weapp-tailwindcss-custom-build \
  --skill weapp-tailwindcss-react-native \
  --skill weapp-tailwindcss-lynx \
  -y
```

The original single-skill command remains available:

```bash
npx skills add sonofmagic/skills --skill weapp-tailwindcss
```

Read more in the [Skill documentation](https://tw.weapp.dev/docs/ai/basics/skill).

## Contributing

Issues, reproducible bug reports, framework examples, documentation improvements, transform fixes, and tests are welcome. Before contributing, read the root `AGENTS.md` and the closest `AGENTS.md` for the target directory, then run the relevant `pnpm` checks locally.

## License

[MIT](./LICENSE)

## Star History

<a href="https://www.star-history.com/?repos=weapp-tailwindcss%2Fweapp-tailwindcss&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=weapp-tailwindcss/weapp-tailwindcss&type=date&theme=dark&legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=weapp-tailwindcss/weapp-tailwindcss&type=date&legend=top-left" />
    <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=weapp-tailwindcss/weapp-tailwindcss&type=date&legend=top-left" />
  </picture>
</a>
