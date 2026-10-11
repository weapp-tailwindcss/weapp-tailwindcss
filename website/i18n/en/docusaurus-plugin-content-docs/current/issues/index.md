---
title: FAQ
description: Currently, the WeChat developer tools enable the code automatic hot reloading compileHotReLoad function by default. This function performs well in native development, but there are certain problems in frameworks such as uni-app and taro. See issues#37. Therefore, if you encounter such problems, it is recommended to turn off the compileHotReLoad function.
keywords:
  - FAQ
  - Troubleshooting
  - compatibility
  - issues
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
  - mpx
---

# FAQ

:::info component external style class must read
Styles are split when custom component uses `externalClasses`? Please check "[Support for component external style classes (externalClasses)] (/docs/issues/externalClasses)" first, and follow the `customAttributes` configuration in the document to solve the problem.
:::

:::tip Run the diagnostic command first
When the access fails, the style is not generated, Tailwind CSS v4 PostCSS reports an error, or the JS string class is not escaped, you can run `pnpm exec weapp-tailwindcss doctor` first. For details, see "[Use doctor command to diagnose project configuration] (/docs/issues/doctor)".
:::

## Why does the hot update fail when I change the class, save it and repackage it?

[[#93](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/93)]

Currently, the WeChat developer tools enable the code automatic hot reloading `compileHotReLoad` function by default. This function performs well in native development, but there are certain problems in frameworks such as `uni-app` and

## `disabled:opacity-50` This type of `tailwindcss` tool class does not take effect?

This is due to the native limitations of the WeChat applet `wxss` selector, which cannot be broken through. See [issue#33](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/33).

## `background-image` Why can't I use local paths?

The WeChat applet prohibits `wxss` from referencing local files in `background-image`, and will directly report an `do-not-use-local-path` error when parsing. Therefore, writing methods like <code>bg-[url('/images/homebg.png')]</code> will not take effect. Please use one of the following methods instead:

- Use a remote image address that is accessible online, such as `bg-[url('https://example.com/bg.png')]`
- Convert the resource to `base64` and then inline it to `background-image`
- Use `<image>` component to render background effect instead

After selecting the appropriate solution, write the style through `tailwindcss` to avoid compilation errors.

## Notes on using with native components

If an error occurs when native components are introduced, you can refer to [issue#35](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/35) to ignore files in the specified directory and skip plug-in processing, such as `uni-app` in `wxcomponents`.

How to change? In the incoming configuration items `cssMatcher`, `htmlMatcher` and other configurations, to filter the specified directory or file.

## uni-app + Tailwind CSS 4 generates abnormal CSS after scanning `src/uni_modules`

### Problem phenomenon

When the CSS entry uses the following overly wide `@source` configuration:

```css
@import "tailwindcss";
@source "./src/**/*.{html,js,ts,jsx,tsx,vue}";
```

And when the `src/uni_modules/**/*` third-party package exists in the project, Tailwind may scan the regular fragment or sample text in the dependent source code, such as `[a-zA-Z:_]`, and extract it as an arbitrary property class.

In the mini program scenario, after `weapp-tailwindcss` translation, something like this may appear:

```css
._ba-zA-Z_c__B {
  a-z-a--z:;
}
```

Such an abnormal product.

### Root cause

The root cause of this kind of problem is not that the business code actually writes this class, but that the scanning scope is too wide and the source code, documents or built products in the third-party directory are mistakenly scanned.

### Recommended configuration

Please exclude `src/uni_modules` explicitly:

```css title="src/app.css"
@import "tailwindcss";
@source "./src/**/*.{html,js,ts,jsx,tsx,vue}";
@source not "./src/uni_modules";
```

### Best Practices

- `@source` should try to only cover the business source code directory
- `uni_modules`, `node_modules`, `dist`, `unpackage`, documentation and builds should be excluded by default
- If you must scan a certain `uni_modules` package, you should only include the exact files that actually carry the template class name, rather than scanning the entire directory.

## Notes on compiling to h5/app

Some users use cross-terminal frameworks such as `uni-app` to develop not only various small programs, but also `H5` or Apps. Starting from v5, H5/Web and ordinary uni-app App WebView builds no longer need to disable `WeappTailwindcss`: the plug-in will automatically switch the generator target to `UNI_PLATFORM=h5/app/app-plus` based on `web` and output the browser's native Tailwind CSS.

```js
// Let’s take the demo uni-app-vue3-vite as an example
// vite.config.ts
import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';
import { WeappTailwindcss } from "weapp-tailwindcss/vite";
// vite plug-in configuration
const vitePlugins = [uni(),WeappTailwindcss({
  cssOptions: {
    rem2rpx: true,
  },
})];

export default defineConfig({
  plugins: vitePlugins
});

// Tailwind CSS is taken over by the WeappTailwindcss generation mode.
// If the project already has PostCSS configuration, only non-Tailwind plug-ins such as autoprefixer and business custom plug-ins will be retained.
```

If your custom build environment does not inject `UNI_PLATFORM=h5/app/app-plus`, you can specify the web output explicitly:

```js
WeappTailwindcss({
  generator: {
    target: "web",
  },
  cssOptions: {
    rem2rpx: true,
  },
});
```

`disabled` is only suitable for RN, Harmony, standalone native or custom builds that do not want plugins to be involved at all, and is not a general configuration for H5/normal App WebView.

## Error TypeError: Cannot use 'in' operator to search for 'CallExpression' in undefined

Encountering this problem is caused by version conflicts between `babel`-related packages. In this case, you can delete the `lock` files (`yarn.lock`, `pnpm-lock.yaml`, `package-lock.json`) and then reinstall.

## In taro webpack5 environment, using this plug-in with the externally installed `terser-webpack-plugin` will cause the plug-in escaping function to become invalid.

Related issue: [#142](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/142)

For example: `.h-4/6`,

Please compress the code and don't use the method in [link](https://docs.taro.zone/docs/config-detail/#terserenable), it's too old.

Use the `taro` configuration item in the `terser` configuration item, see [`terser` configuration item](https://docs.taro.zone/docs/config-detail#terser).

> The `terser` configuration only takes effect in production mode. If you are using `watch` mode and want to enable `terser`, you need to set `process.env.NODE_ENV` to `production`.

In other words, when developing the `watch` mode, just set the environment variable `NODE_ENV` to `production`.

In addition, you can also use the compression code option within the WeChat developer tools instead of using the `webpack` plug-in to compress the code.

## Why does space-y-1 not work?

Related issue: [#108](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/108)

Considering the implementation of the mini program component `shadow root`, by default `space` with sub-selectors only takes effect on the `view` element.

That is, the selector becomes `.space-y-1 > view + view`

There are 3 solutions at this time:

- The component is wrapped with an `<view>` element.
- `virtualHost` solution, adding `options: { virtualHost: true }` in the custom component can solve this problem.
- [`cssOptions.cssChildCombinatorReplaceValue`](/docs/api/options/important#cssoptions) configuration item

## When using uni-app vite vue to register a plug-in, when publishing to h5 environment, an error occurs: [plugin:vite-plugin-uni-app-weapp-tailwindcss-adaptor] 'import' and 'export' may appear only with 'sourceType: "module"' (1:0)

Solution:

```js
import { WeappTailwindcss } from "weapp-tailwindcss/vite";
const vitePlugins = [uni(), WeappTailwindcss({
  cssOptions: {
    rem2rpx: true,
  },
})];
```

That is, H5 and the ordinary uni-app App WebView environment continue to retain the plug-in, and the generator automatically switches to the `web` target. `generator: { target: "web" }` can be set explicitly when a custom build environment does not inject platform variables.

## Failed to register using pnpm@8 plug-in

This version of pnpm 8 changes some default values, among which the default value of `resolution-mode` becomes `lowest-direct`.

This will cause all dependencies to be installed to the minimum version you registered in `package.json`, which may cause some problems. How to solve it?

Create an `.npmrc` in the directory, set `resolution-mode` to `highest`, and then reinstall.

Or, use `pnpm up -Li` to upgrade the dependency package version in your `package.json` to the latest version.

## uni-app In the process of upgrading from v1 to v2, if you use cloud function-related functions, there will be problems when compiling into a small program.

See solution: https://ask.dcloud.net.cn/question/170057

Related issue: [#74](https://github.com/sonofmagic/weapp-tailwindcss/issues/74#issuecomment-1573033475)

## The css in uni-app vue2 uses @import to introduce other css, resulting in `rpx` not taking effect under H5

`postcss-import` needs to be added and configured, see [issues/75](https://github.com/sonofmagic/weapp-tailwindcss/issues/75#issuecomment-1574592907).

You can refer to `demo/uni-app-vue3-vite` in the warehouse for configuration.

## Why does writing class names in Taro JSX/JS not take effect?

In `weapp-tailwindcss@5`, it is no longer necessary to execute `weapp-tw patch`. Whether the class names in JS/JSX can be translated mainly depends on whether these class names have entered the scanning range of Tailwind and appear in the `classNameSet` collected during the build.

Check order:

- Check whether `@source` in the CSS entry covers the corresponding source code directory
- Check whether the project also uses the official Tailwind PostCSS/Vite plug-in and `weapp-tailwindcss` for the applet target at the same time; the applet generation link should be taken over by `weapp-tailwindcss`
- If the arbitrary value class name is written in a dynamic splicing string, Tailwind may not be able to scan it; in this case, you need to change it to a complete literal, or add safelist / `@source`

## Is the writing method of arbitrary values in the monorepo project invalid?

This is usually because the Tailwind context is not positioned correctly, or the source code is not scanned. There are two things you can check first:

- Configure [tailwindcssBasedir](https://tw.weapp.dev/docs/api/interfaces/UserDefinedOptions#tailwindcssbasedir) to let the plugin parse Tailwind from the correct project directory

- Check `@source` / `cssEntries`

If the monorepo's dependency upgrade causes the Tailwind versions obtained by different packages to be inconsistent, consider limiting the `tailwindcss` package upgrade. The specific configuration depends on the package manager.
