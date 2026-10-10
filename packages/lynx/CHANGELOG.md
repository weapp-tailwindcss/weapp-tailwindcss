# @weapp-tailwindcss/lynx

## 0.4.2

### Patch Changes

- 更新依赖。

  ### @weapp-tailwindcss/lynx

  - 更新 devDependencies 中的 `@lynx-js/rspeedy`：`^0.18.0`，`锁定 0.18.0(@emnapi/core@1.11.3)(@emnapi/runtime@1.11.3)(@rspack/core@2.2.2(@swc/helpers@0.5.23))(clean-css@5.3.3)(core-js@3.50.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(supports-color@10.2.2)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.105.4)` → `^0.18.0`，`锁定 0.18.0(@emnapi/core@1.11.3)(@emnapi/runtime@1.11.3)(@rspack/core@2.2.8(@swc/helpers@0.5.23))(clean-css@5.3.3)(core-js@3.50.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(supports-color@10.2.2)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.105.4)`。
  - 更新 peerDependencies 中的 `@lynx-js/rspeedy`：`>=0.16.0`，`锁定 0.18.0(@emnapi/core@1.11.3)(@emnapi/runtime@1.11.3)(@rspack/core@2.2.2(@swc/helpers@0.5.23))(clean-css@5.3.3)(core-js@3.50.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(supports-color@10.2.2)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.105.4)` → `>=0.16.0`，`锁定 0.18.0(@emnapi/core@1.11.3)(@emnapi/runtime@1.11.3)(@rspack/core@2.2.8(@swc/helpers@0.5.23))(clean-css@5.3.3)(core-js@3.50.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(supports-color@10.2.2)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.105.4)`。

  ### weapp-tailwindcss

  - 更新 devDependencies 中的 `webpack`：`5.105.4`，`锁定 5.105.4(patch_hash=62575961fe06ebda9d614707f0556a45ea20d5177838826a10ca25ba5d35c519)(@swc/core@1.16.13(@swc/helpers@0.5.23))(clean-css@5.3.3)(cssnano@8.0.10(postcss@8.5.29))(csso@5.0.5)(esbuild@0.28.2)(html-minifier-terser@7.2.0)(lightningcss@1.33.0)(postcss@8.5.29)(uglify-js@3.19.3)(webpack-cli@7.2.3)` → `5.105.4`，`锁定 5.105.4(patch_hash=62575961fe06ebda9d614707f0556a45ea20d5177838826a10ca25ba5d35c519)(@swc/core@1.16.13(@swc/helpers@0.5.23))(clean-css@5.3.3)(cssnano@9.3.2(postcss@8.5.29))(csso@5.0.5)(esbuild@0.28.2)(html-minifier-terser@7.2.0)(lightningcss@1.33.0)(postcss@8.5.29)(uglify-js@3.19.3)(webpack-cli@7.2.3)`。

- Updated dependencies:
  - weapp-tailwindcss@5.6.1

## 0.4.1

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.6.0

## 0.4.0

### Minor Changes

- 通过 ReactLynx 构建器公开的模板编码 hook，默认启用原生递归 CSS 变量解析，避免嵌套的 Tailwind utility 变量仍走单次占位符替换路径。保留用户显式页面配置和动态变量依赖，不改变目标 SDK；缺少宿主模板 API 时明确报错，同时保持 ESM 与 CJS 公共入口可用。

  此变更收紧旧构建器支持范围：ReactLynx 构建插件至少需要 0.12.4 提供宿主模板 API，递归变量解析要求 Lynx runtime 3.6 以上；更旧的项目需要先升级。当前固定 4.0.1 原生矩阵仍需重新验收。

### Patch Changes

- 更新依赖。

  ### @weapp-tailwindcss/debug-uni-app-x

  - 更新 devDependencies 中的 `vite`：`7.2.7`，`锁定 7.2.7(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)` → `7.2.7`，`锁定 7.2.7(@types/node@26.6.4)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.105.1)(sass@1.105.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)`。

  ### @weapp-tailwindcss/lynx

  - 更新 devDependencies 中的 `vitest`：`catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.2(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:vitest`，`范围 ~5.0.3`，`锁定 5.0.3(@types/node@26.6.4)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.4)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.105.1)(sass@1.105.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。

  ### @weapp-tailwindcss/postcss

  - 更新 dependencies 中的 `@csstools/css-color-parser`：`catalog:csstools`，`范围 ^4.2.3`，`锁定 4.2.4(@csstools/css-parser-algorithms@4.0.1(@csstools/css-tokenizer@4.0.2))(@csstools/css-tokenizer@4.0.2)` → `catalog:csstools`，`范围 ^4.2.5`，`锁定 4.2.5(@csstools/css-parser-algorithms@4.0.2(@csstools/css-tokenizer@4.0.2))(@csstools/css-tokenizer@4.0.2)`。
  - 更新 dependencies 中的 `@csstools/css-parser-algorithms`：`catalog:csstools`，`范围 ^4.0.0`，`锁定 4.0.1(@csstools/css-tokenizer@4.0.2)` → `catalog:csstools`，`范围 ^4.0.2`，`锁定 4.0.2(@csstools/css-tokenizer@4.0.2)`。
  - 更新 dependencies 中的 `postcss-preset-env`：`catalog:postcssUtilities`，`范围 ^11.5.3`，`锁定 11.5.4(postcss@8.5.28)` → `catalog:postcssUtilities`，`范围 ^11.5.5`，`锁定 11.5.5(postcss@8.5.28)`。
  - 更新 devDependencies 中的 `postcss-custom-properties`：`^15.0.2`，`锁定 15.0.2(postcss@8.5.28)` → `^15.0.3`，`锁定 15.0.3(postcss@8.5.28)`。

  ### @weapp-tailwindcss/postcss-calc

  - 更新 devDependencies 中的 `@types/node`：`catalog:typesNode2410`，`范围 ^26.6.2`，`锁定 26.6.2` → `catalog:typesNode2410`，`范围 ^26.6.4`，`锁定 26.6.4`。
  - 更新 devDependencies 中的 `vitest`：`catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.2(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:vitest`，`范围 ~5.0.3`，`锁定 5.0.3(@types/node@26.6.4)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.4)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.105.1)(sass@1.105.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。

  ### @weapp-tailwindcss/react-native

  - 更新 devDependencies 中的 `vitest`：`catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.2(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:vitest`，`范围 ~5.0.3`，`锁定 5.0.3(@types/node@26.6.4)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.4)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.105.1)(sass@1.105.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。

  ### @weapp-tailwindcss/ui

  - 更新 devDependencies 中的 `@storybook/addon-a11y`：`catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(storybook@10.6.0(@types/react@19.2.18)(prettier@3.9.9)(react@18.3.1))` → `catalog:storybook`，`范围 ^10.6.1`，`锁定 10.6.1(storybook@10.6.1(@types/react@19.2.18)(prettier@3.9.9)(react@18.3.1))`。
  - 更新 devDependencies 中的 `@storybook/react`：`catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(@types/react-dom@19.2.5(@types/react@19.2.18))(@types/react@19.2.18)(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(storybook@10.6.0(@types/react@19.2.18)(prettier@3.9.9)(react@18.3.1))(supports-color@10.2.2)(typescript@6.0.3)` → `catalog:storybook`，`范围 ^10.6.1`，`锁定 10.6.1(@types/react-dom@19.2.5(@types/react@19.2.18))(@types/react@19.2.18)(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(storybook@10.6.1(@types/react@19.2.18)(prettier@3.9.9)(react@18.3.1))(supports-color@10.2.2)(typescript@6.0.3)`。
  - 更新 devDependencies 中的 `@storybook/react-vite`：`catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(@types/react-dom@19.2.5(@types/react@19.2.18))(@types/react@19.2.18)(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(rollup@4.63.1(patch_hash=c8c92d871ccf0418d1ba8b1f11a3371b706a1787f102194edb01d655e1ae84e0))(storybook@10.6.0(@types/react@19.2.18)(prettier@3.9.9)(react@18.3.1))(supports-color@10.2.2)(typescript@6.0.3)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:storybook`，`范围 ^10.6.1`，`锁定 10.6.1(@types/react-dom@19.2.5(@types/react@19.2.18))(@types/react@19.2.18)(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(rollup@4.63.5(patch_hash=618e46f264569db024ce086e1f1476e9bba0e6814413dc29febeaf4c22932fa6))(storybook@10.6.1(@types/react@19.2.18)(prettier@3.9.9)(react@18.3.1))(supports-color@10.2.2)(typescript@6.0.3)(vite@7.3.6(@types/node@26.6.4)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.105.1)(sass@1.105.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。
  - 更新 devDependencies 中的 `storybook`：`catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(@types/react@19.2.18)(prettier@3.9.9)(react@18.3.1)` → `catalog:storybook`，`范围 ^10.6.1`，`锁定 10.6.1(@types/react@19.2.18)(prettier@3.9.9)(react@18.3.1)`。
  - 更新 devDependencies 中的 `vite`：`catalog:vite724`，`范围 ^7.3.6`，`锁定 7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)` → `catalog:vite724`，`范围 ^7.3.6`，`锁定 7.3.6(@types/node@26.6.4)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.105.1)(sass@1.105.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)`。

  ### weapp-tailwindcss

  - 更新 dependencies 中的 `oxc-walker`：`catalog:compilerUtilities`，`范围 ^1.1.1`，`锁定 1.1.1(@oxc-project/types@0.149.0)(oxc-parser@0.152.0)(rolldown@1.2.7)` → `catalog:compilerUtilities`，`范围 ^1.1.1`，`锁定 1.1.1(@oxc-project/types@0.149.0)(oxc-parser@0.152.0)(rolldown@1.2.12)`。
  - 更新 devDependencies 中的 `vite`：`catalog:vite724`，`范围 ^7.3.6`，`锁定 7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)` → `catalog:vite724`，`范围 ^7.3.6`，`锁定 7.3.6(@types/node@26.6.4)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.105.1)(sass@1.105.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)`。
  - 更新 devDependencies 中的 `webpack`：`5.105.4`，`锁定 5.105.4(@swc/core@1.16.2(@swc/helpers@0.5.23))(clean-css@5.3.3)(cssnano@8.0.10(postcss@8.5.28))(csso@5.0.5)(esbuild@0.28.2)(html-minifier-terser@7.2.0)(lightningcss@1.33.0)(postcss@8.5.28)(uglify-js@3.19.3)(webpack-cli@7.2.3)` → `5.105.4`，`锁定 5.105.4(@swc/core@1.16.13(@swc/helpers@0.5.23))(clean-css@5.3.3)(cssnano@8.0.10(postcss@8.5.28))(csso@5.0.5)(esbuild@0.28.2)(html-minifier-terser@7.2.0)(lightningcss@1.33.0)(postcss@8.5.28)(uglify-js@3.19.3)(webpack-cli@7.2.3)`。
  - 更新 peerDependencies 中的 `vite`：`^5.2.0 || ^6.0.0 || ^7.0.0 || ^8.0.0`，`锁定 7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)` → `^5.2.0 || ^6.0.0 || ^7.0.0 || ^8.0.0`，`锁定 7.3.6(@types/node@26.6.4)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.105.1)(sass@1.105.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)`。

  ### wetw

  - 更新 dependencies 中的 `@inquirer/prompts`：`catalog:inquirerPrompts`，`范围 ^8.7.2`，`锁定 8.7.2(@types/node@26.6.2)` → `catalog:inquirerPrompts`，`范围 ^8.7.2`，`锁定 8.7.2(@types/node@26.6.4)`。

- 修复 Lynx 编码时因 Tailwind 默认变量规则包含 `::backdrop` 而整组丢失的问题，保留边框、阴影等 utility 依赖的默认值和动态覆写；补齐默认过渡和等宽字体主题值的静态化，并保守保留局部、条件覆写及无法完整解析的主题别名。

- 修复 Tailwind v4 的百分比透明度在 Lynx 原生端不生效的问题：将明确的 `opacity: 50%` 等声明转换为原生数字 `opacity: 0.5`，覆盖关键帧和条件规则，保留动态变量、其它属性的百分比及无效输入。普通 Web 输出保持原语义。

- 将发布包的仓库与问题反馈地址更新为 weapp-tailwindcss 组织下的主仓库，使 npm 包元数据与迁移后的 OIDC 发布来源一致。保留现有包名、导出接口、npm 所有权和文档域名。

- Updated dependencies:
  - weapp-tailwindcss@5.5.12

## 0.3.20

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.11

## 0.3.19

### Patch Changes

- 更新依赖。

  ### @weapp-tailwindcss/lynx

  - 更新 devDependencies 中的 `vitest`：`catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.1(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.2(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。

  ### @weapp-tailwindcss/postcss

  - 更新 dependencies 中的 `@csstools/css-color-parser`：`catalog:csstools`，`范围 ^4.2.3`，`锁定 4.2.3(@csstools/css-parser-algorithms@4.0.0(@csstools/css-tokenizer@4.0.1))(@csstools/css-tokenizer@4.0.1)` → `catalog:csstools`，`范围 ^4.2.3`，`锁定 4.2.4(@csstools/css-parser-algorithms@4.0.1(@csstools/css-tokenizer@4.0.2))(@csstools/css-tokenizer@4.0.2)`。
  - 更新 dependencies 中的 `@csstools/css-parser-algorithms`：`catalog:csstools`，`范围 ^4.0.0`，`锁定 4.0.0(@csstools/css-tokenizer@4.0.1)` → `catalog:csstools`，`范围 ^4.0.0`，`锁定 4.0.1(@csstools/css-tokenizer@4.0.2)`。
  - 更新 dependencies 中的 `@csstools/css-tokenizer`：`catalog:csstools`，`范围 ^4.0.1`，`锁定 4.0.1` → `catalog:csstools`，`范围 ^4.0.1`，`锁定 4.0.2`。
  - 更新 dependencies 中的 `postcss-preset-env`：`catalog:postcssUtilities`，`范围 ^11.5.3`，`锁定 11.5.3(postcss@8.5.28)` → `catalog:postcssUtilities`，`范围 ^11.5.3`，`锁定 11.5.4(postcss@8.5.28)`。
  - 更新 devDependencies 中的 `@csstools/postcss-is-pseudo-class`：`^6.0.0`，`锁定 6.0.0(postcss@8.5.28)` → `^6.0.1`，`锁定 6.0.1(postcss@8.5.28)`。
  - 更新 devDependencies 中的 `postcss-custom-properties`：`^15.0.1`，`锁定 15.0.1(postcss@8.5.28)` → `^15.0.2`，`锁定 15.0.2(postcss@8.5.28)`。

  ### @weapp-tailwindcss/postcss-calc

  - 更新 devDependencies 中的 `vitest`：`catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.1(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.2(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。

  ### @weapp-tailwindcss/react-native

  - 更新 devDependencies 中的 `vitest`：`catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.1(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.2(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。

- Updated dependencies:
  - weapp-tailwindcss@5.5.10

## 0.3.18

### Patch Changes

- 更新依赖。

  ### @weapp-tailwindcss/debug-uni-app-x

  - 更新 dependencies 中的 `fs-extra`：`catalog:buildUtilities`，`范围 ^11.4.0`，`锁定 11.4.0` → `catalog:buildUtilities`，`范围 ^11.4.1`，`锁定 11.4.1`。
  - 更新 devDependencies 中的 `vite`：`7.2.7`，`锁定 7.2.7(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.104.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)` → `7.2.7`，`锁定 7.2.7(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)`。

  ### @weapp-tailwindcss/init

  - 更新 dependencies 中的 `fs-extra`：`catalog:buildUtilities`，`范围 ^11.4.0`，`锁定 11.4.0` → `catalog:buildUtilities`，`范围 ^11.4.1`，`锁定 11.4.1`。

  ### @weapp-tailwindcss/lynx

  - 更新 devDependencies 中的 `@lynx-js/rspeedy`：`^0.17.2`，`锁定 0.17.2(@emnapi/core@1.11.3)(@emnapi/runtime@1.11.3)(@rspack/core@2.2.2(@swc/helpers@0.5.23))(clean-css@5.3.3)(core-js@3.50.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(supports-color@10.2.2)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.105.4)` → `^0.18.0`，`锁定 0.18.0(@emnapi/core@1.11.3)(@emnapi/runtime@1.11.3)(@rspack/core@2.2.2(@swc/helpers@0.5.23))(clean-css@5.3.3)(core-js@3.50.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(supports-color@10.2.2)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.105.4)`。
  - 更新 devDependencies 中的 `vitest`：`catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.1(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.104.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.1(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。
  - 更新 peerDependencies 中的 `@lynx-js/rspeedy`：`>=0.16.0`，`锁定 0.17.2(@emnapi/core@1.11.3)(@emnapi/runtime@1.11.3)(@rspack/core@2.2.2(@swc/helpers@0.5.23))(clean-css@5.3.3)(core-js@3.50.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(supports-color@10.2.2)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.105.4)` → `>=0.16.0`，`锁定 0.18.0(@emnapi/core@1.11.3)(@emnapi/runtime@1.11.3)(@rspack/core@2.2.2(@swc/helpers@0.5.23))(clean-css@5.3.3)(core-js@3.50.0)(csso@5.0.5)(esbuild@0.28.2)(lightningcss@1.33.0)(supports-color@10.2.2)(tslib@2.8.1)(typescript@6.0.3)(webpack@5.105.4)`。

  ### @weapp-tailwindcss/postcss

  - 更新 dependencies 中的 `postcss-pxtrans`：`catalog:postcssCompat`，`范围 ^1.0.4`，`锁定 1.0.4(postcss@8.5.28)` → `catalog:postcssCompat`，`范围 ^1.0.5`，`锁定 1.0.5(postcss@8.5.28)`。
  - 更新 dependencies 中的 `postcss-rem-to-responsive-pixel`：`catalog:postcssRem`，`范围 ^7.0.5`，`锁定 7.0.5(postcss@8.5.28)` → `catalog:postcssRem`，`范围 ^7.0.6`，`锁定 7.0.6(postcss@8.5.28)`。
  - 更新 dependencies 中的 `postcss-rule-unit-converter`：`catalog:postcssCompat`，`范围 ^0.2.3`，`锁定 0.2.3(postcss@8.5.28)` → `catalog:postcssCompat`，`范围 ^0.2.4`，`锁定 0.2.4(postcss@8.5.28)`。

  ### @weapp-tailwindcss/postcss-calc

  - 更新 devDependencies 中的 `prettier`：`catalog:prettier371`，`范围 ^3.9.8`，`锁定 3.9.8` → `catalog:prettier371`，`范围 ^3.9.9`，`锁定 3.9.9`。
  - 更新 devDependencies 中的 `vitest`：`catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.1(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.104.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.1(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。

  ### @weapp-tailwindcss/react-native

  - 更新 devDependencies 中的 `vitest`：`catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.1(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.104.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:vitest`，`范围 ~5.0.1`，`锁定 5.0.1(@types/node@26.6.2)(@vitest/coverage-v8@5.0.0)(@vitest/ui@5.0.0)(jsdom@29.1.1)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。

  ### @weapp-tailwindcss/typography

  - 更新 dependencies 中的 `magic-string`：`catalog:buildUtilities`，`范围 ^1.4.1`，`锁定 1.4.1` → `catalog:buildUtilities`，`范围 ^1.4.2`，`锁定 1.4.2`。

  ### @weapp-tailwindcss/ui

  - 更新 devDependencies 中的 `@storybook/addon-a11y`：`catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(storybook@10.6.0(@types/react@19.2.18)(prettier@3.9.8)(react@18.3.1))` → `catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(storybook@10.6.0(@types/react@19.2.18)(prettier@3.9.9)(react@18.3.1))`。
  - 更新 devDependencies 中的 `@storybook/react`：`catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(@types/react-dom@19.2.5(@types/react@19.2.18))(@types/react@19.2.18)(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(storybook@10.6.0(@types/react@19.2.18)(prettier@3.9.8)(react@18.3.1))(supports-color@10.2.2)(typescript@6.0.3)` → `catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(@types/react-dom@19.2.5(@types/react@19.2.18))(@types/react@19.2.18)(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(storybook@10.6.0(@types/react@19.2.18)(prettier@3.9.9)(react@18.3.1))(supports-color@10.2.2)(typescript@6.0.3)`。
  - 更新 devDependencies 中的 `@storybook/react-vite`：`catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(@types/react-dom@19.2.5(@types/react@19.2.18))(@types/react@19.2.18)(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(rollup@4.63.1(patch_hash=c8c92d871ccf0418d1ba8b1f11a3371b706a1787f102194edb01d655e1ae84e0))(storybook@10.6.0(@types/react@19.2.18)(prettier@3.9.8)(react@18.3.1))(supports-color@10.2.2)(typescript@6.0.3)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.104.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))` → `catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(@types/react-dom@19.2.5(@types/react@19.2.18))(@types/react@19.2.18)(react-dom@18.3.1(react@18.3.1))(react@18.3.1)(rollup@4.63.1(patch_hash=c8c92d871ccf0418d1ba8b1f11a3371b706a1787f102194edb01d655e1ae84e0))(storybook@10.6.0(@types/react@19.2.18)(prettier@3.9.9)(react@18.3.1))(supports-color@10.2.2)(typescript@6.0.3)(vite@7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1))`。
  - 更新 devDependencies 中的 `storybook`：`catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(@types/react@19.2.18)(prettier@3.9.8)(react@18.3.1)` → `catalog:storybook`，`范围 ^10.6.0`，`锁定 10.6.0(@types/react@19.2.18)(prettier@3.9.9)(react@18.3.1)`。
  - 更新 devDependencies 中的 `vite`：`catalog:vite724`，`范围 ^7.3.6`，`锁定 7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.104.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)` → `catalog:vite724`，`范围 ^7.3.6`，`锁定 7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)`。

  ### tailwindcss-injector

  - 更新 dependencies 中的 `fs-extra`：`catalog:buildUtilities`，`范围 ^11.4.0`，`锁定 11.4.0` → `catalog:buildUtilities`，`范围 ^11.4.1`，`锁定 11.4.1`。
  - 更新 dependencies 中的 `magic-string`：`catalog:buildUtilities`，`范围 ^1.4.1`，`锁定 1.4.1` → `catalog:buildUtilities`，`范围 ^1.4.2`，`锁定 1.4.2`。

  ### weapp-tailwindcss

  - 更新 dependencies 中的 `magic-string`：`catalog:buildUtilities`，`范围 ^1.4.1`，`锁定 1.4.1` → `catalog:buildUtilities`，`范围 ^1.4.2`，`锁定 1.4.2`。
  - 更新 devDependencies 中的 `vite`：`catalog:vite724`，`范围 ^7.3.6`，`锁定 7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.104.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)` → `catalog:vite724`，`范围 ^7.3.6`，`锁定 7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)`。
  - 更新 peerDependencies 中的 `vite`：`^5.2.0 || ^6.0.0 || ^7.0.0 || ^8.0.0`，`锁定 7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.104.1)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)` → `^5.2.0 || ^6.0.0 || ^7.0.0 || ^8.0.0`，`锁定 7.3.6(@types/node@26.6.2)(jiti@2.7.0)(less@4.6.6)(lightningcss@1.33.0)(sass-embedded@1.104.1)(sass@1.105.0)(stylus@0.63.0(supports-color@10.2.2))(terser@5.51.2)(tsx@4.23.15)(yaml@2.9.1)`。

- Updated dependencies:
  - weapp-tailwindcss@5.5.9

## 0.3.17

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.8

## 0.3.16

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.7

## 0.3.15

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.6

## 0.3.14

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.5

## 0.3.13

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.4

## 0.3.12

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.3

## 0.3.11

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.2

## 0.3.10

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.1

## 0.3.9

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.0

## 0.3.8

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.4.2

## 0.3.7

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.4.1

## 0.3.6

### Patch Changes

- 将公开 npm 包的主页和相关文档入口迁移到新的 `https://tw.weapp.dev` 域名，并补齐缺失的包主页元数据。

- Updated dependencies:
  - weapp-tailwindcss@5.4.0

## 0.3.5

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.3.6

## 0.3.4

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.3.5

## 0.3.3

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.3.4

## 0.3.2

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.3.3

## 0.3.1

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.3.2

## 0.3.0

### Minor Changes

- 修复 ReactLynx/Rspeedy 多阶段 CSS loader 覆盖 Tailwind CSS 4 入口的问题，兼容 uni-app x 组件局部样式中的前置重要修饰符，并过滤小程序扫描中会生成非法 `:has()` 选择器的 `has-in`/`has-not-in` 变体；新增基于真实 CSS、encoder 与 iOS/Android runtime 报告的完整兼容性实验室。

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.3.1

## 0.2.1

### Patch Changes

- 🐛 **统一更新各发布包的 npm 描述与中英文 README，明确 `weapp-tailwindcss` 面向 Web、小程序、React Native、Lynx 与跨端框架的全端 Tailwind CSS 定位。公开包现在默认展示英文 README，并提供统一命名的简体中文入口，同时保留各子包的具体职责边界。** [#1079](https://github.com/sonofmagic/weapp-tailwindcss/pull/1079) by @sonofmagic
- 📦 **Dependencies** [`c2ba271`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c2ba271ac62ba851c23549a8de1038a71bb868d6)
  → `weapp-tailwindcss@5.3.0`

## 0.2.0

### Minor Changes

- ✨ **新增 ReactLynx 与 Rspeedy 的 Tailwind CSS v4 构建集成，保留原生 className，并在构建期静态化 Tailwind theme 变量，输出 Lynx 原生运行时可消费的 CSS。** [#1055](https://github.com/sonofmagic/weapp-tailwindcss/pull/1055) by @sonofmagic

### Patch Changes

- 📦 **Dependencies** [`13ee184`](https://github.com/sonofmagic/weapp-tailwindcss/commit/13ee18405356f092248c573f241c0e292cb01fb3)
  → `weapp-tailwindcss@5.2.13`
