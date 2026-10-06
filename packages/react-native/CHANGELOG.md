# @weapp-tailwindcss/react-native

## 0.3.0

### Minor Changes

- 修正 React Native 样式类型契约：统一使用原生 StyleProp，支持已注册的 StyleSheet ID、嵌套数组与空样式值；组合样式保留内联类型，移除将返回值伪装为普通对象的断言。读取样式属性请使用 StyleSheet.flatten。同步修复 Babel 类型来源和 Metro 同步、异步返回声明，新增严格源码与组件消费端类型门禁。

  此变更收紧公开类型：根入口和 runtime 的样式声明需要 React Native 类型，普通数字不再冒充原生注册 ID。纯 Node 消费方未安装可选原生 peer 时，请从 compiler、tailwind、metro 子入口导入；这些入口的声明与原生运行时隔离，已有独立项目回归验证。

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

- 将发布包的仓库与问题反馈地址更新为 weapp-tailwindcss 组织下的主仓库，使 npm 包元数据与迁移后的 OIDC 发布来源一致。保留现有包名、导出接口、npm 所有权和文档域名。

- 修复 Metro 热更新期间将过期 CSS 编译结果发布为当前样式的问题。编译前后核对显式输入版本，读取者等待当前刷新，旧轮次和迟到失败均不能覆盖新轮次；合法清空 CSS 仍正常生效。虚拟模块和 manifest 通过同目录原子替换发布，跨进程读取核对发布版本，编译失败或等待超时明确报错，不再悄悄使用空样式或旧结果。

  独立 worker 即使未收到 Metro 自定义字段，也根据发布身份从同一份 manifest 生成虚拟模块，避免重新应用过期空样式；文件监听在编辑器连续原子保存后仍然有效。

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.11
  - weapp-tailwindcss@5.5.12

## 0.2.23

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.10
  - weapp-tailwindcss@5.5.11

## 0.2.22

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
  - @weapp-tailwindcss/postcss@3.3.9
  - weapp-tailwindcss@5.5.10

## 0.2.21

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
  - @weapp-tailwindcss/postcss@3.3.8
  - weapp-tailwindcss@5.5.9

## 0.2.20

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.7
  - weapp-tailwindcss@5.5.8

## 0.2.19

### Patch Changes

- 将共享生成流程、Vite 产物清理、Webpack 兼容和 Harmony apply 的样式变换归入 PostCSS 包，保留主包编排接口，减少重复解析、声明签名计算和未命中规则克隆。

  继续统一源码追踪、主题与引用组装、import 改写、候选扫描和入口指纹；删除重复的 inline/config/source 解析，复用单次调用的 CSS 分析结果，同时保持文件解析、平台和构建会话归主包管理。

  将 Vite 预处理前独占行的 `@config` 清理一并迁入 PostCSS，保留 Sass 源码兼容及原有换行语义。

  将 React Native CSS 编译迁入独立 PostCSS native 子入口，保留原编译器 API、精确类名过滤、告警与稳定 ID；运行时不加载 CSS 编译依赖。

  将 injector 的纯指令插入和 LightningCSS 的实验性样式转换归入 PostCSS。模板依赖追踪仍由 injector 管理；LightningCSS 引擎仍只由实验入口加载，稳定入口不导入实验实现。

  修复完整验收中发现的既有 uni-app x Web 类名身份不一致：Web 模板与脚本保留生成器使用的原始变体类名，局部样式仍按精确候选生成别名，小程序转换行为保持不变。

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.6
  - weapp-tailwindcss@5.5.7

## 0.2.18

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.6

## 0.2.17

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.5

## 0.2.16

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.4

## 0.2.15

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.3

## 0.2.14

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.2

## 0.2.13

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.1

## 0.2.12

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.0

## 0.2.11

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.4.2

## 0.2.10

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.4.1

## 0.2.9

### Patch Changes

- 将公开 npm 包的主页和相关文档入口迁移到新的 `https://tw.weapp.dev` 域名，并补齐缺失的包主页元数据。

- Updated dependencies:
  - weapp-tailwindcss@5.4.0

## 0.2.8

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.3.6

## 0.2.7

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.3.5

## 0.2.6

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.3.4

## 0.2.5

### Patch Changes

- 收紧 React Native 样式编译边界，只生成平台明确支持的属性和条件变体，并补充比例值、百分比透明度、项目根目录及 CSS 入口类型支持，避免未知 CSS 属性或浏览器 selector 变体被误报为可用原生样式。

  稳定 Babel 静态 lookup 使用的 StyleSheet ID，避免 TSX 或 CSS HMR 改变规则顺序后串用其他 class 的样式；同时加入 Expo Web、Android、iOS 共用的 118 项兼容性报告、截图和独立 TSX/CSS HMR 门禁。

  Metro transformer 在未透传自定义 id 或 manifest 路径时也会按项目根目录等待异步样式生成完成，并通过跨进程 ready 标记同步 manifest 与 virtual module，避免构建速度较慢或 HMR 刷新时使用空 manifest 导致静态 className 未被转换。

  React Native 类型增强入口改为纯类型依赖，不再从 workspace 包目录额外加载另一份 React Native 运行时，避免 Metro bundle 与 Expo 原生二进制使用不同 patch 版本后出现原生模块注册表为空的问题。

  Android 与 iOS 的 Metro resolver 进一步把 `react`、`react-native` 及其子路径锚定到应用项目根目录，确保 linked workspace 包与原生二进制共用同一份 React Native runtime；Web 保留 Expo 原有的平台解析与 `react-native-web` 映射。

- Updated dependencies:
  - weapp-tailwindcss@5.3.3

## 0.2.4

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.3.2

## 0.2.3

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.3.1

## 0.2.2

### Patch Changes

- 🐛 **统一更新各发布包的 npm 描述与中英文 README，明确 `weapp-tailwindcss` 面向 Web、小程序、React Native、Lynx 与跨端框架的全端 Tailwind CSS 定位。公开包现在默认展示英文 README，并提供统一命名的简体中文入口，同时保留各子包的具体职责边界。** [#1079](https://github.com/sonofmagic/weapp-tailwindcss/pull/1079) by @sonofmagic
- 📦 **Dependencies** [`c2ba271`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c2ba271ac62ba851c23549a8de1038a71bb868d6)
  → `weapp-tailwindcss@5.3.0`

## 0.2.1

### Patch Changes

- 🐛 **同步 React Native 包开发环境与工作区 React 版本，避免依赖升级后 Expo 示例解析到不同 peer 上下文而丢失 `className` 类型增强。** [`92ea656`](https://github.com/sonofmagic/weapp-tailwindcss/commit/92ea656d6bf211ac846a7c8af3919606d58be1ea) by @sonofmagic
- 📦 **Dependencies** [`3f3f3b3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3f3f3b3045d9aac099a359b514cd9f3b7cab1d3f)
  → `weapp-tailwindcss@5.2.5`

## 0.2.0

### Minor Changes

- ✨ **新增面向 React Native 与 Expo 的 Tailwind CSS v4 原生样式编译器、Babel 转换器、Metro 集成和运行时 helper。Expo Metro 自动生成 manifest/classSet，静态 className 使用 StyleSheet lookup，动态 className 使用带缓存的 tw()，并支持 source order、`!important`、平台/深色变体和 `env` 类型入口。** [#1020](https://github.com/sonofmagic/weapp-tailwindcss/pull/1020) by @sonofmagic

### Patch Changes

- 📦 **Dependencies** [`d28f70d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d28f70dbb581673416868a5bb9517e82e0e24c98)
  → `weapp-tailwindcss@5.2.3`
