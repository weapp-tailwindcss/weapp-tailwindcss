# @weapp-tailwindcss/init

> English | [简体中文](./README.zh-CN.md)

This package initializes `weapp-tailwindcss` project configuration.

The default mode targets Tailwind CSS 4 and `weapp-tailwindcss` 5: it updates `package.json` and creates the CSS-first `src/app.css` entry without writing `postcss.config.*`, `tailwind.config.*`, `@tailwindcss/postcss`, or `autoprefixer`.

Use `mode: 'legacy'` explicitly when maintaining a Tailwind 3 project that still needs the old PostCSS and Tailwind configuration files.

## Website

For setup guides, configuration references, and framework examples, see the [official weapp-tailwindcss documentation](https://tw.weapp.dev).

Dependency versions are selected as the highest stable versions within the requested major ranges, regardless of registry response order. If no stable version matches, initialization fails before writing project files; it does not fall back to another major version or a prerelease.
