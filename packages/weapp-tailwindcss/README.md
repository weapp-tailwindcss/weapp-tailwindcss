# weapp-tailwindcss

> English | [简体中文](./README.zh-CN.md)

Bring Tailwind CSS to every platform. `weapp-tailwindcss` is the core compiler and build integration layer for delivering utility-first styles to Web, mini programs, and native cross-platform runtimes.

## What it provides

- Tailwind CSS v4 generation through a shared compiler boundary.
- Vite, Webpack, Rspack, Gulp, PostCSS, and Node.js integration points.
- Precise class transformation based on the generated Tailwind candidate set.
- CSS compatibility transforms for WeChat, Alipay, ByteDance, QQ, and other mini-program style environments.
- Shared generation foundations for React Native, Expo, ReactLynx, and Rspeedy integrations.

## Choose an integration

| Target | Recommended entry |
| --- | --- |
| Web / H5 | `weapp-tailwindcss/vite/web` for plain Vite, or `weapp-tailwindcss/vite`, Webpack/Rspack integration |
| uni-app / uni-app x | Vite or Webpack integration selected by the framework build chain |
| Taro / Mpx / native mini programs | Vite, Webpack, Rspack, or Gulp integration |
| React Native / Expo | `@weapp-tailwindcss/react-native` |
| ReactLynx / Rspeedy | `@weapp-tailwindcss/lynx` |

Start with the [installation guide](https://tw.weapp.dev/docs/quick-start/install) or select a framework from the [documentation website](https://tw.weapp.dev/).

Plain Vite Web projects can use the dedicated entry to pin the Web target and avoid inheriting framework detection from an enclosing monorepo:

```ts
import { WeappTailwindcssWeb } from 'weapp-tailwindcss/vite/web'

export default {
  plugins: [WeappTailwindcssWeb()],
}
```

The repository provides three canonical templates: [uni-app](../../templates/uni-app-tailwindcss-v4), [Taro Vite](../../templates/taro-vite-tailwindcss-v4), and [weapp-vite](../../templates/weapp-vite-tailwindcss-v4). Each can be installed independently and verified with the template smoke build.

## Tailwind CSS 4 entry

Your CSS entry must be imported by the application build graph. Configure `cssEntries` with absolute paths resolved from the project root when stable entry discovery is required, but do not treat it as a replacement for importing the CSS file.

```css
@import "tailwindcss";
@source "./src";
```

Tailwind generation remains owned by `weapp-tailwindcss`. Do not add `@tailwindcss/vite` or `@tailwindcss/postcss` as a second generator in the same build.

## CLI

Install the independently published CLI together with this package and Tailwind CSS:

```bash
pnpm add -D @weapp-tailwindcss/cli weapp-tailwindcss tailwindcss
pnpm exec weapp-tw -i src/input.css -o dist/output.css --watch
```

The CLI generates Web CSS by default. `--target weapp` performs CSS-only mini-program compatibility conversion; complete WXML, JavaScript, and WXSS projects still require a bundler integration. Watch mode uses `@parcel/watcher` native events by default and supports explicit polling with `--poll`.

See the [CLI guide](https://tw.weapp.dev/docs/tools/weapp-tw-cli) for source maps, stdin/stdout, watch mode, and `canonicalize`.

## Runtime requirements

- Node.js `^22.18.0 || >=24.11.0` for the current release line.
- HBuilderX `>=5.11` when using uni-app or uni-app x through HBuilderX.

## Community and support

- [Documentation](https://tw.weapp.dev/)
- [GitHub Issues](https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues)
- [GitHub Discussions](https://github.com/weapp-tailwindcss/weapp-tailwindcss/discussions)

## License

[MIT](../../LICENSE)
