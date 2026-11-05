---
"@weapp-tailwindcss/cli": patch
"@weapp-tailwindcss/cn": patch
"@weapp-tailwindcss/debug-uni-app-x": patch
"@weapp-tailwindcss/engine": patch
"@weapp-tailwindcss/init": patch
"@weapp-tailwindcss/lynx": patch
"@weapp-tailwindcss/postcss": patch
"@weapp-tailwindcss/postcss-calc": patch
"@weapp-tailwindcss/react-native": patch
"@weapp-tailwindcss/reset": patch
"@weapp-tailwindcss/ui": patch
"@weapp-tailwindcss/variants": patch
tailwindcss-injector: patch
theme-transition: patch
weapp-tailwindcss: patch
wetw: patch
---

更新依赖。

### @weapp-tailwindcss/cli

- 更新 dependencies 中的 `semver`：`~7.8.5`，`锁定 7.8.5` → `~7.8.6`，`锁定 7.8.6`。
- 更新 peerDependencies 中的 `tailwindcss`：`^4.0.0`，`锁定 4.3.3` → `^4.0.0`，`锁定 4.3.4`。

### @weapp-tailwindcss/cn

- 更新 dependencies 中的 `cn`：`^0.4.0`，`锁定 0.4.0` → `^0.5.2`，`锁定 0.5.2`。

### @weapp-tailwindcss/debug-uni-app-x

- 更新 devDependencies 中的 `vite`：`7.3.7`，`锁定 7.3.7(@types/node@26.6.5)(jiti@2.7.0)(less@4.9.1(supports-color@10.2.2))(lightningcss@1.33.0)(sass-embedded@1.106.1)(sass@1.106.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)` → `7.3.7`，`锁定 7.3.7(@types/node@26.6.6)(jiti@2.7.0)(less@4.9.1(supports-color@10.2.2))(lightningcss@1.33.0)(sass-embedded@1.107.1)(sass@1.107.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)`。

### @weapp-tailwindcss/engine

- 更新 dependencies 中的 `@tailwindcss/node`：`catalog:tailwindcss4`，`范围 ^4.3.3`，`锁定 4.3.3` → `catalog:tailwindcss4`，`范围 ^4.3.4`，`锁定 4.3.4`。
- 更新 dependencies 中的 `@tailwindcss/oxide`：`catalog:tailwindcss4`，`范围 ^4.3.3`，`锁定 4.3.3` → `catalog:tailwindcss4`，`范围 ^4.3.4`，`锁定 4.3.4`。
- 更新 devDependencies 中的 `tailwindcss`：`catalog:tailwindcss4`，`范围 ^4.3.3`，`锁定 4.3.3` → `catalog:tailwindcss4`，`范围 ^4.3.4`，`锁定 4.3.4`。
- 更新 peerDependencies 中的 `tailwindcss`：`^4.0.0`，`锁定 4.3.3` → `^4.0.0`，`锁定 4.3.4`。

### @weapp-tailwindcss/init

- 更新 dependencies 中的 `semver`：`catalog:compilerUtilities`，`范围 ~7.8.5`，`锁定 7.8.5` → `catalog:compilerUtilities`，`范围 ~7.8.6`，`锁定 7.8.6`。

### @weapp-tailwindcss/lynx

- 更新 devDependencies 中的 `@lynx-js/rspeedy`：`^0.18.3`，`锁定 0.18.3(@rspack/core@2.2.9(@swc/helpers@0.5.23))(@types/node@26.6.5)(clean-css@5.3.3)(core-js@3.51.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.112.2)` → `^0.18.4`，`锁定 0.18.4(@rspack/core@2.2.9(@swc/helpers@0.5.23))(@types/node@26.6.6)(clean-css@5.3.3)(core-js@3.51.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.112.2)`。
- 更新 devDependencies 中的 `tailwindcss`：`catalog:tailwindcss4`，`范围 ^4.3.3`，`锁定 4.3.3` → `catalog:tailwindcss4`，`范围 ^4.3.4`，`锁定 4.3.4`。
- 更新 devDependencies 中的 `vitest`：`catalog:vitest`，`范围 ~5.0.5`，`锁定 5.0.5(@types/node@26.6.5)(@vitest/coverage-v8@5.0.5)(@vitest/ui@5.0.5)(jsdom@29.1.1)(vite@7.3.7(@types/node@26.6.5)(jiti@2.7.0)(less@4.9.1(supports-color@10.2.2))(lightningcss@1.33.0)(sass-embedded@1.106.1)(sass@1.106.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:vitest`，`范围 ~5.1.0`，`锁定 5.1.0(@types/node@26.6.6)(@vitest/coverage-v8@5.0.5)(@vitest/ui@5.0.5)(jsdom@29.1.1)(vite@7.3.7(@types/node@26.6.6)(jiti@2.7.0)(less@4.9.1(supports-color@10.2.2))(lightningcss@1.33.0)(sass-embedded@1.107.1)(sass@1.107.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。
- 更新 peerDependencies 中的 `@lynx-js/react-rsbuild-plugin`：`>=0.12.4`，`锁定 0.22.0(@lynx-js/react@0.129.0(@lynx-js/types@4.3.0)(@types/react@19.3.0))(@lynx-js/rspeedy@0.18.3(@rspack/core@2.2.9(@swc/helpers@0.5.23))(@types/node@26.6.5)(clean-css@5.3.3)(core-js@3.51.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.112.2))(@rsbuild/core@2.2.9(core-js@3.51.0))(clean-css@5.3.3)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(tslib@2.8.1)(webpack@5.112.2)` → `>=0.12.4`，`锁定 0.22.0(@lynx-js/react@0.129.0(@lynx-js/types@4.3.0)(@types/react@19.3.0))(@lynx-js/rspeedy@0.18.4(@rspack/core@2.2.9(@swc/helpers@0.5.23))(@types/node@26.6.6)(clean-css@5.3.3)(core-js@3.51.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.112.2))(@rsbuild/core@2.2.9(core-js@3.51.0))(clean-css@5.3.3)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(tslib@2.8.1)(webpack@5.112.2)`。
- 更新 peerDependencies 中的 `@lynx-js/rspeedy`：`>=0.16.0`，`锁定 0.18.3(@rspack/core@2.2.9(@swc/helpers@0.5.23))(@types/node@26.6.5)(clean-css@5.3.3)(core-js@3.51.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.112.2)` → `>=0.16.0`，`锁定 0.18.4(@rspack/core@2.2.9(@swc/helpers@0.5.23))(@types/node@26.6.6)(clean-css@5.3.3)(core-js@3.51.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.112.2)`。
- 更新 peerDependencies 中的 `tailwindcss`：`>=4.0.0`，`锁定 4.3.3` → `>=4.0.0`，`锁定 4.3.4`。

### @weapp-tailwindcss/postcss

- 更新 dependencies 中的 `@csstools/css-color-parser`：`catalog:csstools`，`范围 ^4.2.6`，`锁定 4.2.6(@csstools/css-parser-algorithms@4.0.2(@csstools/css-tokenizer@4.0.2))(@csstools/css-tokenizer@4.0.2)` → `catalog:csstools`，`范围 ^4.2.7`，`锁定 4.2.7(@csstools/css-parser-algorithms@4.0.2(@csstools/css-tokenizer@4.0.2))(@csstools/css-tokenizer@4.0.2)`。
- 更新 dependencies 中的 `postcss-preset-env`：`catalog:postcssUtilities`，`范围 ^11.6.1`，`锁定 11.6.1(patch_hash=3efb75a5127fc72703f3e6630e3a0deda57294e8c3aa7e18fa46be07e6e628a3)(postcss@8.5.32)` → `catalog:postcssUtilities`，`范围 ^11.6.2`，`锁定 11.6.2(postcss@8.5.32)`。

### @weapp-tailwindcss/postcss-calc

- 更新 devDependencies 中的 `@eslint/js`：`^10.0.1`，`锁定 10.0.1(eslint@10.13.0(jiti@2.7.0)(supports-color@10.2.2))` → `^10.0.1`，`锁定 10.0.1(eslint@10.14.0(jiti@2.7.0)(supports-color@10.2.2))`。
- 更新 devDependencies 中的 `@types/node`：`catalog:typesNode2410`，`范围 ^26.6.5`，`锁定 26.6.5` → `catalog:typesNode2410`，`范围 ^26.6.6`，`锁定 26.6.6`。
- 更新 devDependencies 中的 `eslint`：`catalog:eslint10`，`范围 ^10.13.0`，`锁定 10.13.0(jiti@2.7.0)(supports-color@10.2.2)` → `catalog:eslint10`，`范围 ^10.14.0`，`锁定 10.14.0(jiti@2.7.0)(supports-color@10.2.2)`。
- 更新 devDependencies 中的 `eslint-config-prettier`：`^10.1.8`，`锁定 10.1.8(eslint@10.13.0(jiti@2.7.0)(supports-color@10.2.2))` → `^10.1.8`，`锁定 10.1.8(eslint@10.14.0(jiti@2.7.0)(supports-color@10.2.2))`。
- 更新 devDependencies 中的 `vitest`：`catalog:vitest`，`范围 ~5.0.5`，`锁定 5.0.5(@types/node@26.6.5)(@vitest/coverage-v8@5.0.5)(@vitest/ui@5.0.5)(jsdom@29.1.1)(vite@7.3.7(@types/node@26.6.5)(jiti@2.7.0)(less@4.9.1(supports-color@10.2.2))(lightningcss@1.33.0)(sass-embedded@1.106.1)(sass@1.106.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:vitest`，`范围 ~5.1.0`，`锁定 5.1.0(@types/node@26.6.6)(@vitest/coverage-v8@5.0.5)(@vitest/ui@5.0.5)(jsdom@29.1.1)(vite@7.3.7(@types/node@26.6.6)(jiti@2.7.0)(less@4.9.1(supports-color@10.2.2))(lightningcss@1.33.0)(sass-embedded@1.107.1)(sass@1.107.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。

### @weapp-tailwindcss/react-native

- 更新 devDependencies 中的 `vitest`：`catalog:vitest`，`范围 ~5.0.5`，`锁定 5.0.5(@types/node@26.6.5)(@vitest/coverage-v8@5.0.5)(@vitest/ui@5.0.5)(jsdom@29.1.1)(vite@7.3.7(@types/node@26.6.5)(jiti@2.7.0)(less@4.9.1(supports-color@10.2.2))(lightningcss@1.33.0)(sass-embedded@1.106.1)(sass@1.106.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:vitest`，`范围 ~5.1.0`，`锁定 5.1.0(@types/node@26.6.6)(@vitest/coverage-v8@5.0.5)(@vitest/ui@5.0.5)(jsdom@29.1.1)(vite@7.3.7(@types/node@26.6.6)(jiti@2.7.0)(less@4.9.1(supports-color@10.2.2))(lightningcss@1.33.0)(sass-embedded@1.107.1)(sass@1.107.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。
- 更新 peerDependencies 中的 `tailwindcss`：`>=4.0.0`，`锁定 4.3.3` → `>=4.0.0`，`锁定 4.3.4`。

### @weapp-tailwindcss/reset

- 更新 peerDependencies 中的 `tailwindcss`：`^3.0.0 || ^4.0.0`，`锁定 4.3.3` → `^3.0.0 || ^4.0.0`，`锁定 4.3.4`。

### @weapp-tailwindcss/ui

- 更新 dependencies 中的 `tailwind-variants`：`catalog:runtimeVariants`，`范围 ^3.3.1`，`锁定 3.3.1(tailwind-merge@3.7.0)(tailwindcss@4.3.3)` → `catalog:runtimeVariants`，`范围 ^4.0.1`，`锁定 4.0.1`。
- 更新 devDependencies 中的 `@storybook/react-vite`：`catalog:storybook`，`范围 ^10.6.5`，`锁定 10.6.5(@types/react-dom@18.3.7(@types/react@18.3.31))(@types/react@18.3.31)(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(rollup@4.65.1(patch_hash=3cc78a4e1129fb7d9924d6efa20b57cec5fd9f1547b12e0ff9866d06b0380adf))(storybook@10.6.5(@types/react@18.3.31)(prettier@3.9.10)(react@18.3.1))(supports-color@10.2.2)(typescript@6.0.3)(vite@7.3.7(@types/node@26.6.5)(jiti@2.7.0)(less@4.9.1(supports-color@10.2.2))(lightningcss@1.33.0)(sass-embedded@1.106.1)(sass@1.106.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:storybook`，`范围 ^10.6.5`，`锁定 10.6.5(@types/react-dom@18.3.7(@types/react@18.3.31))(@types/react@18.3.31)(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(rollup@4.65.1(patch_hash=3cc78a4e1129fb7d9924d6efa20b57cec5fd9f1547b12e0ff9866d06b0380adf))(storybook@10.6.5(@types/react@18.3.31)(prettier@3.9.10)(react@18.3.1))(supports-color@10.2.2)(typescript@6.0.3)(vite@7.3.7(@types/node@26.6.6)(jiti@2.7.0)(less@4.9.1(supports-color@10.2.2))(lightningcss@1.33.0)(sass-embedded@1.107.1)(sass@1.107.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。
- 更新 devDependencies 中的 `tailwindcss`：`catalog:tailwindcss4`，`范围 ^4.3.3`，`锁定 4.3.3` → `catalog:tailwindcss4`，`范围 ^4.3.4`，`锁定 4.3.4`。
- 更新 devDependencies 中的 `vite`：`catalog:vite724`，`范围 ^7.3.7`，`锁定 7.3.7(@types/node@26.6.5)(jiti@2.7.0)(less@4.9.1(supports-color@10.2.2))(lightningcss@1.33.0)(sass-embedded@1.106.1)(sass@1.106.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)` → `catalog:vite724`，`范围 ^7.3.7`，`锁定 7.3.7(@types/node@26.6.6)(jiti@2.7.0)(less@4.9.1(supports-color@10.2.2))(lightningcss@1.33.0)(sass-embedded@1.107.1)(sass@1.107.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)`。

### @weapp-tailwindcss/variants

- 更新 dependencies 中的 `tailwind-variants`：`catalog:runtimeVariants`，`范围 ^3.3.1`，`锁定 3.3.1(tailwind-merge@3.7.0)(tailwindcss@4.3.3)` → `catalog:runtimeVariants`，`范围 ^4.0.1`，`锁定 4.0.1`。

### tailwindcss-injector

- 更新 dependencies 中的 `tailwindcss`：`catalog:tailwindcss4`，`范围 ^4.3.3`，`锁定 4.3.3` → `catalog:tailwindcss4`，`范围 ^4.3.4`，`锁定 4.3.4`。

### theme-transition

- 更新 peerDependencies 中的 `tailwindcss`：`>=3 <5`，`锁定 4.3.3` → `>=3 <5`，`锁定 4.3.4`。

### weapp-tailwindcss

- 更新 dependencies 中的 `local-pkg`：`catalog:buildUtilities`，`范围 ^1.2.1`，`锁定 1.2.1` → `catalog:buildUtilities`，`范围 ^2.0.0`，`锁定 2.0.0`。
- 更新 dependencies 中的 `oxc-parser`：`catalog:compilerUtilities`，`范围 ^0.156.0`，`锁定 0.156.0` → `catalog:compilerUtilities`，`范围 ^0.157.0`，`锁定 0.157.0`。
- 更新 dependencies 中的 `oxc-walker`：`catalog:compilerUtilities`，`范围 ^1.1.1`，`锁定 1.1.1(@oxc-project/types@0.156.0)(oxc-parser@0.156.0)(rolldown@1.2.15)` → `catalog:compilerUtilities`，`范围 ^1.1.1`，`锁定 1.1.1(@oxc-project/types@0.156.0)(oxc-parser@0.157.0)(rolldown@1.2.15)`。
- 更新 dependencies 中的 `semver`：`catalog:compilerUtilities`，`范围 ~7.8.5`，`锁定 7.8.5` → `catalog:compilerUtilities`，`范围 ~7.8.6`，`锁定 7.8.6`。
- 更新 devDependencies 中的 `@iconify/tailwind4`：`^1.2.3`，`锁定 1.2.3(tailwindcss@4.3.3)` → `^1.2.3`，`锁定 1.2.3(tailwindcss@4.3.4)`。
- 更新 devDependencies 中的 `vite`：`catalog:vite724`，`范围 ^7.3.7`，`锁定 7.3.7(@types/node@26.6.5)(jiti@2.7.0)(less@4.9.1(supports-color@10.2.2))(lightningcss@1.33.0)(sass-embedded@1.106.1)(sass@1.106.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)` → `catalog:vite724`，`范围 ^7.3.7`，`锁定 7.3.7(@types/node@26.6.6)(jiti@2.7.0)(less@4.9.1(supports-color@10.2.2))(lightningcss@1.33.0)(sass-embedded@1.107.1)(sass@1.107.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)`。
- 更新 devDependencies 中的 `webpack`：`5.112.2`，`锁定 5.112.2(patch_hash=d88b84ac3b6ac0a4bd43ec9b9cc901ea089fb7c182e6e3f22255578d50f2a79b)(@swc/core@1.16.20(@swc/helpers@0.5.23))(clean-css@5.3.3)(cssnano@9.9.0(postcss@8.5.32))(csso@5.0.5)(esbuild@0.28.2)(html-minifier-terser@7.2.0)(lightningcss@1.33.0)(postcss@8.5.32)(sharp@0.35.5(@types/node@26.6.5))(svgo@4.1.0)(uglify-js@3.19.3)(webpack-cli@7.2.3)` → `5.112.2`，`锁定 5.112.2(patch_hash=d88b84ac3b6ac0a4bd43ec9b9cc901ea089fb7c182e6e3f22255578d50f2a79b)(@swc/core@1.16.21(@swc/helpers@0.5.23))(clean-css@5.3.3)(cssnano@9.9.0(postcss@8.5.32))(csso@5.0.5)(esbuild@0.28.2)(html-minifier-terser@7.2.0)(lightningcss@1.33.0)(postcss@8.5.32)(sharp@0.35.5(@types/node@26.6.6))(svgo@4.1.0)(uglify-js@3.19.3)(webpack-cli@7.3.1)`。
- 更新 peerDependencies 中的 `tailwindcss`：`^4.0.0`，`锁定 4.3.3` → `^4.0.0`，`锁定 4.3.4`。
- 更新 peerDependencies 中的 `vite`：`^5.2.0 || ^6.0.0 || ^7.0.0 || ^8.0.0`，`锁定 7.3.7(@types/node@26.6.5)(jiti@2.7.0)(less@4.9.1(supports-color@10.2.2))(lightningcss@1.33.0)(sass-embedded@1.106.1)(sass@1.106.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)` → `^5.2.0 || ^6.0.0 || ^7.0.0 || ^8.0.0`，`锁定 7.3.7(@types/node@26.6.6)(jiti@2.7.0)(less@4.9.1(supports-color@10.2.2))(lightningcss@1.33.0)(sass-embedded@1.107.1)(sass@1.107.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)`。

### wetw

- 更新 dependencies 中的 `@inquirer/prompts`：`catalog:inquirerPrompts`，`范围 ^8.7.5`，`锁定 8.7.5(@types/node@26.6.5)` → `catalog:inquirerPrompts`，`范围 ^8.7.5`，`锁定 8.7.5(@types/node@26.6.6)`。
