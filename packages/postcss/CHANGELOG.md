# @weapp-tailwindcss/postcss

## 3.3.11

### Patch Changes

- 修复普通样式与自定义 variant 共用外层条件注释时，重复准备 Tailwind CSS 4 来源会不断嵌套同一条件的问题。仅沿覆盖整个 variant 的单节点条件链识别已有条件，保留不同方向、不同表达式、多分支以及普通样式的外层注释。

- 更新依赖。

  ### @weapp-tailwindcss/engine

  - 更新 dependencies 中的 `postcss`：`catalog:postcss85tilde`，`范围 ^8.5.28`，`锁定 8.5.28` → `catalog:postcss85tilde`，`范围 ^8.5.29`，`锁定 8.5.29`。

  ### @weapp-tailwindcss/postcss

  - 更新 dependencies 中的 `@csstools/css-color-parser`：`catalog:csstools`，`范围 ^4.2.5`，`锁定 4.2.5(@csstools/css-parser-algorithms@4.0.2(@csstools/css-tokenizer@4.0.2))(@csstools/css-tokenizer@4.0.2)` → `catalog:csstools`，`范围 ^4.2.6`，`锁定 4.2.6(@csstools/css-parser-algorithms@4.0.2(@csstools/css-tokenizer@4.0.2))(@csstools/css-tokenizer@4.0.2)`。
  - 更新 dependencies 中的 `autoprefixer`：`catalog:autoprefixer10`，`范围 ^10.6.1`，`锁定 10.6.1(postcss@8.5.28)` → `catalog:autoprefixer10`，`范围 ^10.6.1`，`锁定 10.6.1(postcss@8.5.29)`。
  - 更新 dependencies 中的 `postcss`：`catalog:postcss85tilde`，`范围 ^8.5.28`，`锁定 8.5.28` → `catalog:postcss85tilde`，`范围 ^8.5.29`，`锁定 8.5.29`。
  - 更新 dependencies 中的 `postcss-load-config`：`catalog:buildUtilities`，`范围 ^6.0.1`，`锁定 6.0.1(jiti@2.7.0)(postcss@8.5.28)(tsx@4.23.15)(yaml@2.9.1)` → `catalog:buildUtilities`，`范围 ^6.0.1`，`锁定 6.0.1(jiti@2.7.0)(postcss@8.5.29)(tsx@4.23.15)(yaml@2.9.1)`。
  - 更新 dependencies 中的 `postcss-preset-env`：`catalog:postcssUtilities`，`范围 ^11.5.5`，`锁定 11.5.5(postcss@8.5.28)` → `catalog:postcssUtilities`，`范围 ^11.6.1`，`锁定 11.6.1(postcss@8.5.29)`。
  - 更新 dependencies 中的 `postcss-pxtrans`：`catalog:postcssCompat`，`范围 ^1.0.6`，`锁定 1.0.6(postcss@8.5.28)` → `catalog:postcssCompat`，`范围 ^1.0.6`，`锁定 1.0.6(postcss@8.5.29)`。
  - 更新 dependencies 中的 `postcss-rem-to-responsive-pixel`：`catalog:postcssRem`，`范围 ^7.0.7`，`锁定 7.0.7(postcss@8.5.28)` → `catalog:postcssRem`，`范围 ^7.0.7`，`锁定 7.0.7(postcss@8.5.29)`。
  - 更新 dependencies 中的 `postcss-rule-unit-converter`：`catalog:postcssCompat`，`范围 ^0.2.5`，`锁定 0.2.5(postcss@8.5.28)` → `catalog:postcssCompat`，`范围 ^0.2.5`，`锁定 0.2.5(postcss@8.5.29)`。
  - 更新 dependencies 中的 `postcss-scss`：`catalog:postcssCompat`，`范围 ^4.0.9`，`锁定 4.0.9(postcss@8.5.28)` → `catalog:postcssCompat`，`范围 ^4.0.9`，`锁定 4.0.9(postcss@8.5.29)`。
  - 更新 devDependencies 中的 `@csstools/postcss-is-pseudo-class`：`^6.0.1`，`锁定 6.0.1(postcss@8.5.28)` → `^6.0.3`，`锁定 6.0.3(postcss@8.5.29)`。
  - 更新 devDependencies 中的 `postcss-custom-properties`：`^15.0.3`，`锁定 15.0.3(postcss@8.5.28)` → `^15.0.4`，`锁定 15.0.4(postcss@8.5.29)`。

  ### @weapp-tailwindcss/postcss-calc

  - 更新 devDependencies 中的 `@eslint/js`：`^10.0.1`，`锁定 10.0.1(eslint@10.11.0(jiti@2.7.0)(supports-color@10.2.2))` → `^10.0.1`，`锁定 10.0.1(eslint@10.12.0(jiti@2.7.0)(supports-color@10.2.2))`。
  - 更新 devDependencies 中的 `eslint`：`catalog:eslint10`，`范围 ^10.11.0`，`锁定 10.11.0(jiti@2.7.0)(supports-color@10.2.2)` → `catalog:eslint10`，`范围 ^10.12.0`，`锁定 10.12.0(jiti@2.7.0)(supports-color@10.2.2)`。
  - 更新 devDependencies 中的 `eslint-config-prettier`：`^10.1.8`，`锁定 10.1.8(eslint@10.11.0(jiti@2.7.0)(supports-color@10.2.2))` → `^10.1.8`，`锁定 10.1.8(eslint@10.12.0(jiti@2.7.0)(supports-color@10.2.2))`。
  - 更新 devDependencies 中的 `postcss`：`^8.5.28`，`锁定 8.5.28` → `^8.5.29`，`锁定 8.5.29`。
  - 更新 peerDependencies 中的 `postcss`：`^8.4.38`，`锁定 8.5.28` → `^8.4.38`，`锁定 8.5.29`。

  ### @weapp-tailwindcss/typography

  - 更新 dependencies 中的 `magic-string`：`catalog:buildUtilities`，`范围 ^1.4.2`，`锁定 1.4.2` → `catalog:buildUtilities`，`范围 ^1.4.3`，`锁定 1.4.3`。

  ### tailwindcss-injector

  - 更新 dependencies 中的 `magic-string`：`catalog:buildUtilities`，`范围 ^1.4.2`，`锁定 1.4.2` → `catalog:buildUtilities`，`范围 ^1.4.3`，`锁定 1.4.3`。

  ### weapp-tailwindcss

  - 更新 dependencies 中的 `magic-string`：`catalog:buildUtilities`，`范围 ^1.4.2`，`锁定 1.4.2` → `catalog:buildUtilities`，`范围 ^1.4.3`，`锁定 1.4.3`。

  ### wetw

  - 更新 dependencies 中的 `@inquirer/prompts`：`catalog:inquirerPrompts`，`范围 ^8.7.2`，`锁定 8.7.2(@types/node@26.6.4)` → `catalog:inquirerPrompts`，`范围 ^8.7.3`，`锁定 8.7.3(@types/node@26.6.4)`。

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

- 使用 32 位整数乘法减少样式缓存键的哈希开销，继续校验完整源码和配置，保持哈希碰撞、外部插件及 Root 来源的失效边界。

- 修复 Lynx 编码时因 Tailwind 默认变量规则包含 `::backdrop` 而整组丢失的问题，保留边框、阴影等 utility 依赖的默认值和动态覆写；补齐默认过渡和等宽字体主题值的静态化，并保守保留局部、条件覆写及无法完整解析的主题别名。

- 修复 Tailwind v4 的百分比透明度在 Lynx 原生端不生效的问题：将明确的 `opacity: 50%` 等声明转换为原生数字 `opacity: 0.5`，覆盖关键帧和条件规则，保留动态变量、其它属性的百分比及无效输入。普通 Web 输出保持原语义。

- 将类名转义基础包源码纳入本仓库，以 @weapp-tailwindcss/escape 从新版本序列独立发布，并统一替换编译端、PostCSS 和运行时的依赖及类型引用。保留原转义 API、ESM/CJS 入口和映射行为，增加旧发布版对照与新包名打包验证。

  公开 workspace 消费方统一使用 repoctl 要求的 `workspace:*`，发布 tarball 固定到同批 escape 版本，避免保留旧依赖范围策略导致 Release 协议校验失败。

- 将发布包的仓库与问题反馈地址更新为 weapp-tailwindcss 组织下的主仓库，使 npm 包元数据与迁移后的 OIDC 发布来源一致。保留现有包名、导出接口、npm 所有权和文档域名。

- 移除源码、声明和发布产物均未使用的 es-toolkit 生产依赖，减少独立消费项目的安装依赖和空间，不改变 CSS 转换行为。

- 修复用户 PostCSS 插件先生成厂商前缀或动态变量声明后，透明十六进制颜色因误判已有回退而遗漏 rgba 兼容转换的问题。保留浏览器目标、显式开关与 preserve 配置，并避免声明去重跨过作者覆写或 shorthand 边界，保证最终渐变和颜色层叠一致。

- 对同一份待比较的 CSS 延迟解析一次，并在规则文本索引与声明索引之间共享只读语法树，减少生成样式恢复时的重复解析；索引完成后释放语法树，保留条件规则、声明优先级及解析失败时的保守处理。

- 在同一轮 Vite 产物清理中复用未变化的根样式覆盖索引，减少多个页面和组件重复解析根 CSS 的开销；根样式变更时重新计算，并保留独立分包隔离。

- 修复 uni-app x 局部样式将 `space-x`、`space-y` 替换为局部类名后，对应子元素间距规则被错误过滤的问题。统一作者样式与纯 `@apply` 生成结果的选择器归属判断，保留结构后代、条件规则及完整 `:is`、`:where` 分支，同时继续排除独立 utility 后代和仅在否定条件中出现的作者类名。

- 修复 uni-app x 自动局部 utility 别名按模板出现顺序生成，导致同优先级样式覆盖顺序与 Tailwind 不一致的问题。根据当前实际生成来源、主题和目标兼容候选的 Tailwind 排名，稳定排序同一父级内连续的自动局部规则，保留作者规则、未知排名和层叠边界；作者样式重放同时清理内部排序标记，避免标记进入最终产物。

- 修复 uni-app x 小程序和 WebView 局部样式将 Tailwind 运行时变量误当作固定主题值的问题。保留 `--tw-leading` 等变量及其间接依赖的动态引用，使同节点、空值和条件覆盖继续生效；仅限制 preset 的变量静态化步骤，保持单位转换、其他兼容处理和原生 UVUE 静态降级契约。

- Updated dependencies:
  - @weapp-tailwindcss/engine@0.1.4
  - @weapp-tailwindcss/escape@0.0.2
  - @weapp-tailwindcss/postcss-calc@1.0.10
  - @weapp-tailwindcss/shared@2.0.4
  - @weapp-tailwindcss/source-scan@0.1.2
  - tailwindcss-config@2.0.6

## 3.3.10

### Patch Changes

- 为跨会话 design system、模块解析、CSS 入口以及 PostCSS 配置和管线复用增加容量上限与最近使用淘汰，避免长期 watch 持续保留旧配置和旧入口；失败任务仅清除自身缓存，不影响更新后的请求。

  同次创建 PostCSS 处理器和管线时复用已计算的配置签名，减少重复遍历嵌套配置。

- 修复 CSS 短哈希碰撞、动态变量保护占位和同名插件闭包导致的结果缓存串用。缓存命中核对完整原始输入，按函数身份区分配置；用户插件每次执行，并按调用级插件配置决定内容探测。

  用户插件完整执行后，以其输出 AST 及来源位置缓存确定性平台阶段，返回本次依赖消息与输入归属，减少 watch 的重复转换。包内无外部状态的 CSS macro 保持稳定准备函数并显式登记纯转换；同名或扩展的第三方插件不会被当成纯转换缓存。

  保留用户阶段删除首节点时的顶层空白归属，避免 layer 提升重新引入文件头缩进。后处理仅为实际占位符拆分选择器，并为单个规范 class/id 跳过无语义贡献的兜底解析，减少大样式表分配与尾部耗时。

  通用作者阶段不套用框架重放的生成插件过滤规则；用户插件生成的 AST 仅执行一次输入准备，保留原有布局及格式，框架适配层继续过滤重复生成插件。

  Root 缓存仅在未命中时捕获结构与来源快照，命中时逐节点核对，避免重复生成整棵 AST 的 JSON 和输入映射；保持本轮 Input 绑定与输出隔离，并按累计节点数限制快照容量，减少 watch 的分配和内存压力。

  小程序 CSS 最终清理只在可能匹配时拆分选择器，复用列表读取结果；移除不支持的 at-rule 与后续平台转换共用 AST，减少真实构建和 watch 中的重复解析、打印及临时分配，保留异常输入扫描修复与字符串兜底。

- 修复微信 Tailwind CSS 4 固定 rpx 主题在默认配置下的 calc 尺寸偏差：新增自动模式，按完整产物作用域预计算并保留覆盖与缓存边界；动态主题可通过 cssOptions.cssCalc: false 退出。

  修复 uni-app 小程序 watch 删除或清空整个 SFC 样式块后旧样式产物残留的问题：通过 CSS 输出插件已提交的资产归属补齐空资产写入，保留构建失败、多输出与其他生产者的边界。

  保留调用阶段嵌套 CSS 配置的安全默认值，避免意外展开第三方组件变量；减少样式阶段配置复制，并在上下文和单位选项不变时复用最终资产结果。

  修复已有等价目标值时原单位声明未被替换的问题，保留覆盖顺序和显式保留模式；将修正后的单位换算实现随 PostCSS 的 ESM/CJS 产物一起交付。

  升级到包含上游修复的 postcss-plugin-shared 1.1.7 依赖链（rem 插件 7.0.7、pxtrans 1.0.6、unit-converter 0.2.5），移除临时 pnpm 补丁及锁文件登记，保留单位替换回归。

  延后样式管线创建至首次处理，避免重复初始化；复用同次 preflight 的选择器拆分结果，并在解析变量作用域选择器前先检查声明，减少大样式表的无效工作。

- 修复嵌套 CSS 规则去重后遗留空 at-rule 祖先，避免 Vite watch 重复注入 Tailwind 外壳导致恢复相同源码时产物不一致。

- Updated dependencies:
  - @weapp-tailwindcss/engine@0.1.3

## 3.3.9

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

- 修复多个 CSS 入口合并后文件型 @source 的来源丢失与候选归属错误，保留空范围及主题冲突语义，并监听扫描文件变化。Refs #1241

- Updated dependencies:
  - @weapp-tailwindcss/engine@0.1.2
  - @weapp-tailwindcss/postcss-calc@1.0.9

## 3.3.8

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

- 修复 `cssCalc` 将局部主题和条件覆盖误当作全局常量的问题，保留变量来源、完整声明和输出上下文；冲突、未知变量及其依赖链继续使用运行时表达式。

  统一多来源 eager/deferred 的静态化判断，修复 Map、正则配置和增量候选改变变量上下文后复用旧 CSS 的问题。`cssCalc` 不再隐式开启全局 CSS 变量展开，也不会删除未成功静态化的运行时声明。

  保留 `cssCalc: true` 在顶层和嵌套配置中的相同语义，嵌套配置完整继承安全默认值。增量颜色降级与 UVUE 所需的推导主题值独立传递，不作为 calc 的显式常量；作者插件完成后恢复后续 PostCSS 节点遍历。

  Vite 构建根据最终 CSS 产物图的入口、静态导入和 CSS 导入合并共同样式作用域，完成静态计算后再转换单位；开发服务和原生 App 嵌入样式保留即时处理。风险提示明确区分当前生成阶段与最终 WXSS，避免延后静态化时将中间表达式误称为最终运行时计算。

  保留 CSS 原始别名依赖，显式常量不能抹除动态、循环或无法解析的依赖。统一 CSS 转义变量名的身份和白名单匹配，合法转义引用可以求值，等价名称的局部覆盖仍阻止静态化。compiler 来源缓存改为内容签名与自有快照，原地修改 source/sourceOptions、扫描来源和裸任意值配置后重新生成，历史缓存快照不再引用调用方的可变来源对象。

  增量追加以原生编译器完整产物为准，新增主题、keyframes、属性注册、颜色降级结构或规则顺序变化时重新转换完整结果；空候选重新添加也恢复完整依赖，避免旧规则与不完整的新 CSS 直接拼接。

  补充真实 uni-app 微信构建与同进程 watch 回归。静态计算仍需显式启用，不改变微信自身的 `rpx` 换算算法。Refs #1214。

- 修复 Tailwind CSS v4 小程序延后构建中配置的 CSS 变量未参与 `cssCalc` 静态计算的问题。固定且可解析的 `rpx` 主题尺寸会根据完整变量上下文折叠为最终 `rpx` 值；Vite 构建在最终 CSS 产物阶段确定共同作用域，完成静态计算后再转换单位。

- 修复 Tailwind CSS v4 主样式预处理对每条规则重复扫描整份 CSS AST 的性能问题。处理大规模样式时复用单次 Root 级内容变量判断，保持 `--tw-content` 初始化和 CSS 输出语义不变。

  Related to #1238。

- Updated dependencies:
  - @weapp-tailwindcss/postcss-calc@1.0.8

## 3.3.7

### Patch Changes

- 将颜色解析器及其 AST 依赖一起打包，避免独立安装出现多份 parser 实例时丢失主题颜色和透明度工具类。

## 3.3.6

### Patch Changes

- 迁入仅支持 Tailwind CSS 4 的 @weapp-tailwindcss/engine，保留候选提取、扫描和生成会话能力，替换主包、PostCSS 与 CLI 的旧 engine 依赖，并明确生成与平台兼容转换的边界。

- 统一来源扫描基础设施与共享语义契约，修复 Windows glob、qxml、绝对来源排除及配置更新缓存；拆分 PostCSS 子路径和核心扫描职责，解除值依赖循环与核心对构建器的反向引用，CLI 与 PostCSS 复用生成会话扫描并释放资源。

  进一步将通用生成编排与候选状态迁入核心，兼容扫描入口统一使用 AST 来源描述与显式扫描策略。Webpack、Rspack、Gulp 共用真实生成与增量扫描契约，修复 Gulp 禁用自动扫描后的候选泄漏、watch 候选失效，以及 Webpack/Rspack 新增来源文件未触发 CSS 重建的问题。

  生成引擎按内容指纹复用本地配置及插件模块，避免重复遍历和执行未变更依赖；配置或间接依赖更新及显式会话失效仍触发刷新。配置加载器保留 Jiti 转换缓存，每次读取前清理配置的本地模块依赖图，兼顾间接依赖更新正确性与 CommonJS 原生加载性能。

  生成模块缓存的异步上下文在最后一个并发调用结束后停用，避免后续构建继续承担异步跟踪开销；成功与异常路径均释放，并保留并发生成之间的上下文隔离。

  Webpack/Rspack 的来源监听根据 glob 静态前缀注册目录，避免配置基准目录导致整棵项目树进入递归快照；尚未创建的目录登记为缺失依赖，保留新增来源触发生成的行为。

  候选报告采用有限并发读取，避免串行文件等待与构建任务相互阻塞；结果顺序、候选位置及单文件失败报告保持稳定。CSS 来源缓存的配置元数据检查与同步 CSS 读取在同一轮完成，配置修改、删除及重建仍会刷新来源。

  候选删除时仅重建累积输出的编译器，复用同一生成会话的 design system，减少 HMR 重复解析主题和插件的内存分配；源码、配置或依赖失效仍同时刷新编译器与 design system。

- 将共享生成流程、Vite 产物清理、Webpack 兼容和 Harmony apply 的样式变换归入 PostCSS 包，保留主包编排接口，减少重复解析、声明签名计算和未命中规则克隆。

  继续统一源码追踪、主题与引用组装、import 改写、候选扫描和入口指纹；删除重复的 inline/config/source 解析，复用单次调用的 CSS 分析结果，同时保持文件解析、平台和构建会话归主包管理。

  将 Vite 预处理前独占行的 `@config` 清理一并迁入 PostCSS，保留 Sass 源码兼容及原有换行语义。

  将 React Native CSS 编译迁入独立 PostCSS native 子入口，保留原编译器 API、精确类名过滤、告警与稳定 ID；运行时不加载 CSS 编译依赖。

  将 injector 的纯指令插入和 LightningCSS 的实验性样式转换归入 PostCSS。模板依赖追踪仍由 injector 管理；LightningCSS 引擎仍只由实验入口加载，稳定入口不导入实验实现。

  修复完整验收中发现的既有 uni-app x Web 类名身份不一致：Web 模板与脚本保留生成器使用的原始变体类名，局部样式仍按精确候选生成别名，小程序转换行为保持不变。

- 将公开 core 编译入口的 Tailwind banner 注释清理迁入 PostCSS 包，直接复用已有 AST，保留目标平台、finalize 开关、其它版权注释和声明字面量的既有行为。

- 将 CSS 资源位置依赖分析迁入 PostCSS，通过 tokenizer 识别转义的 url 和 import，避免相对资源转换跨目录共享缓存，并排除字符串及注释中的伪资源语法。

- 将 CSS 运行时签名归属 PostCSS，保留字符串空格、注释样文本及选择器关系，避免主题变量等有效修改被误判为排版变化而漏掉 HMR 缓存失效。

- 统一 uni-app x 的样式属性名、数值单位与行高类型转换到 PostCSS，删除主包重复实现，减少重复属性名处理并保持 CSS 与 UTS 输出一致。

- 复用现有 Oxc 解析器分析 JS 候选文本签名，保留原生模块不可用时的 Babel 回退；对构建图已排除出候选扫描的 JS 使用源码哈希保守失效，减少独立分包运行时的重复 AST 解析，同时保留类名精确转译与关联模块失效。

  为 JS 快路径增加有容量上限的字面量位置缓存，类集合变化时复用解析事实并重新精确匹配，避免 watch 反复构建完整 AST。保留 ESM 模块图和特殊语法的 Babel 回退，并让无模块图依赖的 CommonJS 产物使用原生解析器。合并小程序 preflight 与 theme 时预筛单一选择器，减少大型工具类样式表的 selector AST 分配。

- 为微信小程序的 Tailwind v4 rpx 主题变量增加每构建会话一次的建议性警告，区分运行时 calc 与静态输出；将相关生成样式转换及变量收集统一到 PostCSS 包，保持 CSS 和类名集合语义不变。

- Updated dependencies:
  - @weapp-tailwindcss/engine@0.1.1
  - @weapp-tailwindcss/source-scan@0.1.1
  - tailwindcss-config@2.0.5

## 3.3.5

### Patch Changes

- 将 CSS 语法解析与 tokenize 收口到 @weapp-tailwindcss/postcss，主包不再直接依赖样式处理库

- 将 legacy selector/unit、空块清理和 Harmony CSS style value 变换迁到 @weapp-tailwindcss/postcss

- 将 uni-app x 边框 preflight 与 v4 theme CSS 变换迁到 @weapp-tailwindcss/postcss

- 修复 uni-app x H5 渐变与阴影：Web 生成样式保持独立转换链，局部 @apply 与 scoped 清理保留所需运行时变量初始化及注册，保留动态 fallback 和工具类组合。Refs #1210。

- 修复 Tailwind CSS v4 在 web/H5 生成路径中 `cssCalc` 无法预计算配置的 CSS 自定义属性的问题。

  - 抽出仅计算 `calc()` / `var()` 的 `applyConfiguredCssCalc`，web 目标不再走会改写选择器的完整小程序 style handler。
  - 完整生成、增量生成和 web 用户 CSS（含 `@apply`）都会消费生成器收集的变量映射；未匹配变量与循环引用仍保留运行时表达式。
  - 补齐 Vite Web/H5 最终 CSS 资产中的普通样式计算，避免独立导入的 CSS 绕过 `cssCalc`；跨资产仅使用唯一生成上下文，多个主题入口不按遍历顺序猜测变量值。Refs #1194。

- 修复 graph 生成结果在样式最终化后丢失编译 snapshot、组件样式去重后残留无消费者的 content 初始化（保留根样式与增量生成的默认初始化契约）、Vite 对象钩子及其上下文和构建参数未完整转发的问题。修复 Webpack 样式入口读取错误的运行时配置字段，以及 Tailwind v4 候选校验未使用裸任意值配置的问题。

  统一内部处理器、只读生成结果和跨构建器类型契约，校验框架分包配置及单 Root AST 返回边界，保留同步与异步 HMR 源码读取能力；Uni App X 通过 Rollup 接受的 JSON source map 保留完整来源信息。

  修复作者样式回填时 Tailwind 编译期函数未展开的问题：复用当前生成源的编译上下文处理函数值，保留重复声明、作用域与原有顺序，并拒绝配置上下文歧义，避免正确样式后面残留未编译声明。

  修复 UI 样式测试加载构建配置时清空发布产物的问题：配置求值不再触发嵌套构建，样式由 weapp-tailwindcss 生成，JS 与声明文件由 tsdown 管理，测试使用内存产物并校验磁盘输出未变化；监听模式保留 CSS、JS 与声明的增量构建。

  修复 Uni App X 小程序增量构建中源码样式与框架产物的映射遗漏，保留框架基础样式贡献，并将同目标入口重放与框架输出合并，避免热更新清空全局样式或覆盖页面布局规则。

  小程序组件局部样式同时生成基础工具类与变体，保留原变体类身份；作者样式过滤按选择器结构保留包含 Vue 作用域的主题、媒体与伪类展开规则，避免局部背景覆盖主题状态。原生 App 保持现有变体路径。

  区分小程序产物导入与 Tailwind 源码依赖，保留框架基础样式 import，避免样式隔离 2.0 编译解析失败；将已有类约束上的 class 属性存在选择器等价转成重复类，保留框架提权效果与小程序兼容性。

  修复增量样式回滚时旧规则复活：框架贡献与入口重放不再复用混合产物缓存，最终注入前先更新本轮来源记录，并在原始框架样式转为生成产物时清理旧贡献。源码签名未变时复用干净生成缓存做合并，避免每次热更新都整份重新生成。产物已包含对应 CSS 时跳过 scoped runtime 计算，避免生产全量构建为不会重放的文件做候选签名。
  修复 Web 聚合样式替换越过 Tailwind 模块边界而丢失独立导入和组件普通样式的问题，缓存包含真实聚合内容；保留 Web layer 顺序并重放框架 PostCSS 的单位、选择器与前缀转换。插件解析支持相对源码上下文的 CJS/ESM 模块路径和 tuple 选项，保留旧式 transformer 与 Processor 组合，非法或缺失插件明确报错，避免静默省略框架处理。

## 3.3.4

### Patch Changes

- 修复 Tailwind CSS v4 跨 CSS 资产构建时 `cssCalc` 无法预计算配置的 CSS 自定义属性的问题，并支持变量 fallback、链式引用与循环引用保护。

  - 统一数组、正则、对象和布尔形式的 `cssCalc` 外部变量映射透传，支持顶层和 `cssOptions` 配置入口。
  - 未启用 calc 变量解析时，完整 Tailwind v4 生成路径不再额外解析整份 CSS 收集变量，减少构建内存开销。

- Updated dependencies:
  - @weapp-tailwindcss/postcss-calc@1.0.7

## 3.3.3

### Patch Changes

- 修复 uni-app x important utility 预处理误用 CSS parser 的问题：使用真正的 SCSS 解析和序列化 API，避免样式中的行内注释使转换静默失效，导致 Web 连续热更新出现 Sass 语法错误。补充真实属性透传、连续保存、样式块增删与刷新回归。Refs #1144。

- 在 Webpack 将 Tailwind CSS v4 交给下游 PostCSS 前归一化无限圆角，避免旧版 postcss-calc 词法警告，并保留正常单位转换与 Web 输出。Refs #1166。

- 修复 Windows 下 CSS import 转义路径导致默认源码扫描失效、标准 utility 与 spacing 变量缺失的问题。统一入口路径解析、CSS 请求序列化和主题文件定位。

  Vite 清理已注入的样式产物时，在单次操作内复用主样式的比较索引，避免对每个候选产物重复解析同一份 CSS。索引绑定不可变内容，不跨 HMR 构建保留。

  Vite 将原始用户样式与框架已处理的 bundle CSS 分开传递，生成 CSS 完成框架转换后再合并后者，避免 px/rpx 阶段差异导致依赖样式重复输出。保留用户覆盖顺序，并避免重放已执行的框架插件或恢复旧主题变量。

  修正 Vite watch 删除模板时的源码与产物归属、符号链接路径身份和候选缓存失效；覆盖 quickapp qxml，并保证 Vite 开发服务中的新增任意值使用当前生成器验证集合，使 CSS 与 JS 类名一致。

  修复没有 PostCSS loader 的 Webpack 预处理链路：在 Sass/Less/Stylus 输出 CSS 后再执行生成和 import 解析，兼容 Docusaurus 服务端丢弃样式的规则。

  修复 Webpack 将 Windows 输出目录直接当作 Watchpack glob 导致忽略规则失效的问题。输出目录使用字面路径包含关系，兼容盘符、UNC、空格与 glob 特殊字符，避免生成产物反复触发 watch 构建。

  Webpack 监听依赖通过构建器输入文件系统分类，避免把 Taro 虚拟入口误登记为缺失文件并循环重建；loader 等待异步依赖注册完成后再返回产物。

  扩展所有 demo 的 Windows、macOS、Linux CLI 验收，覆盖生产、开发首编译、连续源码修改及 Web 刷新。修复百度小程序 CSS 产物身份与重放、入口 chunk 的独立样式引用、Webpack 生成前后的 CSS/JS 边界和 Rspack 已注册 loader 的增量生成；修复 uni 样式注入入口缓存跨构建失效。原生目标保持已有接入边界，仅验收 CLI 构建，不声明设备或 utility 样式覆盖。Refs #1159。

  仓库构建依赖为 Rollup 4.63.0 增加 CJS/ESM watcher 补丁，修复 Linux 原子替换源码后重复依赖监听失效；补丁随冻结锁文件应用，不随本库 npm 包安装。浏览器验收区分客户端路由与新文档，避免 hash/history 跳转清空有效的开发连接。

- Updated dependencies:
  - @weapp-tailwindcss/postcss-calc@1.0.6

## 3.3.2

### Patch Changes

- 清理小程序最终样式中的空选择器规则，避免无效的 `:is(...)` 语法进入 WXSS 产物。Refs #1152

## 3.3.1

### Patch Changes

- 统一跨构建器编译状态与生命周期协议，新增可复用的 compiler host、事件总线和 runtime state，同时收敛 PostCSS、编译器和运行时衍生包的依赖版本 catalog，保持现有导入路径兼容。

- 统一处理 Tailwind source media 尾部残片，避免非法 CSS 进入小程序最终产物。

## 3.3.0

### Minor Changes

- 完善 Core Compiler 与 PostCSS 集成能力：小程序目标默认完成 CSS 最终化，支持 source glob 增量失效、内存 CSS source、root 淘汰回调、模板 filename 上下文，并公开最终化相关 API。

## 3.2.12

### Patch Changes

- 将公开 npm 包的主页和相关文档入口迁移到新的 `https://tw.weapp.dev` 域名，并补齐缺失的包主页元数据。

- 修复 uni-app x 中 important utility 与局部 Sass `@apply` 在 Web、Android Vapor 等目标间编译不一致的问题。

- 升级 PostCSS 处理链使用的 CSS 颜色解析与预设环境依赖。

- Updated dependencies:
  - @weapp-tailwindcss/postcss-calc@1.0.5
  - @weapp-tailwindcss/shared@2.0.3
  - tailwindcss-config@2.0.4

## 3.2.11

### Patch Changes

- 🐛 **统一更新各发布包的 npm 描述与中英文 README，明确 `weapp-tailwindcss` 面向 Web、小程序、React Native、Lynx 与跨端框架的全端 Tailwind CSS 定位。公开包现在默认展示英文 README，并提供统一命名的简体中文入口，同时保留各子包的具体职责边界。** [#1079](https://github.com/sonofmagic/weapp-tailwindcss/pull/1079) by @sonofmagic
- 📦 **Dependencies** [`c2ba271`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c2ba271ac62ba851c23549a8de1038a71bb868d6)
  → `@weapp-tailwindcss/postcss-calc@1.0.4`, `@weapp-tailwindcss/shared@2.0.2`, `tailwindcss-config@2.0.3`

## 3.2.10

### Patch Changes

- 🐛 **新增 ReactLynx 与 Rspeedy 的 Tailwind CSS v4 构建集成，保留原生 className，并在构建期静态化 Tailwind theme 变量，输出 Lynx 原生运行时可消费的 CSS。** [#1055](https://github.com/sonofmagic/weapp-tailwindcss/pull/1055) by @sonofmagic

## 3.2.9

### Patch Changes

- 🐛 **小程序样式现在默认移除无效的 `:active` 选择器，同时保留 Tailwind candidate 与模板类名转换，并允许通过 `cssOptions.cssRemoveActivePseudoClass: false` 显式恢复。Tailwind CSS v4 的任意 `@custom-variant` 都支持条件注释放在变体内部或包住整个变体的跨平台写法。H5 与 App 的 Web 构建行为保持不变。** [#1052](https://github.com/sonofmagic/weapp-tailwindcss/pull/1052) by @sonofmagic

- 🐛 **统一升级构建链路依赖，并将多个跨包复用的工具依赖提炼到 pnpm catalog，降低版本漂移和后续升级成本。** [`11f26f7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/11f26f7c93f99db9f3f0b7e57c633e8654c2a6a6) by @sonofmagic

## 3.2.8

### Patch Changes

- 🐛 **修复逻辑方向属性展开后残留 `calc()` 声明导致小程序间距计算异常的问题，并避免清理过程改变作者声明的级联与 `!important` 语义。** [#1045](https://github.com/sonofmagic/weapp-tailwindcss/pull/1045) by @ZCY-G

## 3.2.7

### Patch Changes

- 🐛 **修复 uni-app x 组件局部样式绑定被误识别为 Tailwind 类名、Native 端局部 `@apply` 未展开，以及 Web 端样式预处理与连续 HMR 候选更新不完整的问题。** [#1042](https://github.com/sonofmagic/weapp-tailwindcss/pull/1042) by @sonofmagic

## 3.2.6

### Patch Changes

- 🐛 **修复 uni-app x Native scoped 作者样式被通用 CSS 生成管线提前改写的问题，并统一 Windows 下 Vite 模块身份与 HMR 候选刷新顺序，确保新增、删除和回滚类名时会重新编译对应 `.uvue` 本地样式；同时细分 Harmony 构建失败、保留 HBuilderX 日志中的首个关键错误，并让 Harmony 回归基于与 HBuilderX Alpha 对齐的编译器及最终 JavaScript 产物验收样式。** [#1036](https://github.com/sonofmagic/weapp-tailwindcss/pull/1036) by @sonofmagic

- 🐛 **修复 H5 与 App WebView 兼容模式错误静态化 Tailwind 运行时 CSS 变量的问题，避免 shadow、ring、gradient、mask 等颜色组合工具类互相串色。** [#1039](https://github.com/sonofmagic/weapp-tailwindcss/pull/1039) by @sonofmagic

## 3.2.5

### Patch Changes

- 🐛 **完善经典 uni-app app-plus 的默认 WebView 兼容转换，并在 `legacy-web` 现有处理链中为文本渐变补充 WebKit 前缀；Tailwind CSS v4 运行时间距变量和间距反转语义保持不变，使 Android 与 iOS App 无需业务侧兼容插件即可使用对应工具类。** [#1028](https://github.com/sonofmagic/weapp-tailwindcss/pull/1028) by @sonofmagic

- 🐛 **修复 uni-app 的 PostCSS 兼容链展开 Tailwind CSS v4 空变量回退值后生成 `filter: ;` 与 `backdrop-filter: ;` 的问题；最终小程序样式会移除无效的普通空属性，同时保留 Tailwind 运行时所需的空自定义属性初始化。** [#1030](https://github.com/sonofmagic/weapp-tailwindcss/pull/1030) by @sonofmagic

- 🐛 **修复 uni-app x scoped 作者样式被原生 Tailwind 兼容过滤误删的问题，并让 H5/Web 作者样式继续交由 SFC 预处理链处理；同时在原生 App 的 `.uvue` 类集合扩大时失效 Tailwind CSS 模块并触发自动重载，使新增字体、颜色、间距和任意值类无需手动重新运行到设备即可生效。** [#1029](https://github.com/sonofmagic/weapp-tailwindcss/pull/1029) by @sonofmagic

## 3.2.4

### Patch Changes

- 🐛 **兼容组件库 CSS 中常见的 `//` 行注释，避免样式解析失败；同时保留字符串、块注释和 URL 内容不变。修正 `uni-app x` 全局 `uvue` 样式入口被错误当作组件作者样式的问题，继续过滤原生编译器不支持的全局选择器。** [#1026](https://github.com/sonofmagic/weapp-tailwindcss/pull/1026) by @sonofmagic

- 🐛 **修复 `uni-app x` 在 `uniAppXCssTarget: 'uvue'` 下误删 `uvue` 组件 `<style scoped>` 作者样式的问题。现在会保留 scoped 组件样式，同时继续清理 `uvue` 不兼容声明和 scoped 请求里的 Tailwind 注入噪音。** [#1024](https://github.com/sonofmagic/weapp-tailwindcss/pull/1024) by @sonofmagic

## 3.2.3

### Patch Changes

- 🐛 **修复 uni-app x 使用 `unitsToPx` 时 CommonJS 构建无法加载单位转换插件，避免 HBuilderX 编译直接中断；升级相关 PostCSS 单位转换插件并使用其兼容的 CommonJS 导出。** [#1023](https://github.com/sonofmagic/weapp-tailwindcss/pull/1023) by @sonofmagic

## 3.2.2

### Patch Changes

- 🐛 **修复 uni-app x uvue 产物中作者 CSS 变量 fallback 不兼容 HBuilderX 的问题，同时保留静态 fallback 与运行时变量覆盖能力。** [#1018](https://github.com/sonofmagic/weapp-tailwindcss/pull/1018) by @sonofmagic

- 🐛 **修复 uni-app x 使用 Tailwind CSS v4 时作者 CSS 主题变量的 fallback 被错误静态化的问题，让仅使用 `@apply` 的样式入口在唯一 Tailwind 配置可确定时继承该配置，并移除 uvue 产物中无法静态求值的 `calc()` 声明。** [#1016](https://github.com/sonofmagic/weapp-tailwindcss/pull/1016) by @sonofmagic

## 3.2.1

### Patch Changes

- 🐛 **修复 uni-app x 的 UVUE 样式目标无法识别 `translate()` 逗号分隔参数的问题，将顶层参数转换为空格分隔形式，并保留 `var()` 回退值等嵌套函数中的逗号。** [#1011](https://github.com/sonofmagic/weapp-tailwindcss/pull/1011) by @sonofmagic

## 3.2.0

### Minor Changes

- ✨ **新增基于 CSS AST 的编译管线基础设施，提供可克隆的 Root 处理 API、统一的 Tailwind 生成会话、显式 source graph 与 artifact 归属，并支持通过环境变量在 legacy、shadow 和 graph 模式间渐进切换。** [`8a15138`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8a15138399875e714b3476f72f6e25671a0ef3ca) by @sonofmagic

### Patch Changes

- 🐛 **升级核心 Babel 工具链到 Babel 8，并将 Node.js 最低版本提升到 `^22.18.0 || >=24.11.0`。相关包默认采用 ESM 语义，继续同时发布 ESM 与 CommonJS 入口；ESM 产物使用 `.js`，CommonJS 产物使用 `.cjs`，原有公开包名与子路径保持不变。同时收紧 tsdown 的依赖外置策略，避免 ESM 无条件内联可直接消费的依赖，并保证 CommonJS 不会同步加载 ESM-only 依赖。Webpack loader 与 CommonJS runtime 复用同一构建图，避免重复加载 Babel 8 等内联依赖；watch/serve 热更新复用解析缓存并采用轻量 AST 签名遍历，在完整语义约束允许时默认使用 OXC AST 快路径，并在普通 build、不支持的输入或运行时自动回退 Babel，避免冷构建同时加载双解析器。Webpack chunk 直接使用 compilation 产物图独立转译，原生 JS/WXS 才保留输出模块图关联，避免把 runtime bootstrap `require()` 误当作源码链接，降低 MPX、Taro Webpack 等链路的内存和插件处理耗时。Webpack 产物中的 harmony import 注释与 JSDoc import type 不再误触发模块图解析。** [#1004](https://github.com/sonofmagic/weapp-tailwindcss/pull/1004) by @sonofmagic

- 🐛 **修复小程序最终样式产物在条件编译、缓存复用与嵌套规则清理后残留空 `@media`、`@supports` 等块级 at-rule，避免 WXSS 编译报错，同时保留开发态增量构建所需的条件规则占位容器。** [#1007](https://github.com/sonofmagic/weapp-tailwindcss/pull/1007) by @sonofmagic

- 🐛 **升级 `@tailwindcss-mangle/engine` 到 0.2.0 与 Tailwind CSS 4.3.3，并将 Tailwind v4 生成链路迁移到原生 generation session 与结构化 CSS artifact。graph 编译模式现通过按 scope 隔离的 `CompilationSession` 统一管理候选类、验证后的 classSet、依赖关系、编译 revision 与删除保留策略，并丢弃并发构建产生的过期 classSet 和 CSS 结果。Vite 与 Webpack 生成链路统一使用 `raw`、`framework-processed`、`adapted` CSS 阶段，framework PostCSS replay 通过 AST `PlatformAdapter` 执行，同时修复组合 CSS 时移动节点导致 fragment artifact 被意外清空的问题，并兼容新版条件变体生成的嵌套 `&` 包装。** [`19f16d4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/19f16d4ff9e78e6748f883994456cf81f17b7691) by @sonofmagic
  - 进一步将 runtime snapshot、增量 hash、依赖影响和 process plan 下沉到 bundler-neutral compiler 契约。Vite 仅保留 Rollup asset 与模块元数据，Webpack 和 Gulp 不再导入 Vite `bundle-state` 或伪造 Rollup asset；三个 port 现在通过同一快照结构向 runtime classSet 会话提交源码与变更集合。
  - 将 source candidate collector、扫描入口解析、扫描签名、CSS source entry 发现与静态配置读取迁入 bundler shared 扫描层。Webpack、Gulp、共享 CSS 生成器和 Tailwind runtime 不再依赖 Vite source scan 实现；原有 Vite 内部入口保留为兼容 facade，以维持现有插件生命周期与测试 mock 契约。
  - 将增量 runtime classSet manager、runtime entry 过滤、safe class 还原和 candidate signature 迁入 bundler shared。Webpack 与 Gulp 不再依赖 Vite runtime 实现，Vite 旧入口继续提供原有 `createBundleRuntimeClassSetManager` 与 signature API facade，保持 classSet 精确命中和既有测试注入方式兼容。
  - 扩展 `AssetEmissionPlan` 以记录 bundler-neutral 的 asset write/delete 操作，并将 Vite production CSS 的覆盖、创建、迁移、import shell、源 asset 删除、最终小程序 CSS 清理、WebView 兼容转换、独立 CSS finalizer 与 uni-app x asset 后处理写回统一改为先生成 emission plan，再通过 Rollup bundle/`emitFile` port 执行。Harmony 主样式注入改为依据构建器提供的 main chunk matcher 选择真实产物，不再硬编码 `main.css`；uni-app x 在 bundle key 无法定位样式与 placeholder 产物时回退使用真实 `fileName`；compiler 只描述产物意图，不持有或修改 Rollup asset。
  - Gulp 增量 runtime 刷新改为复用 compiler 的 runtime compilation build state，不再在 adapter 内维护第二份源码 hash；源码缓存淘汰会同步清理 runtime hash、候选和依赖状态，使 Vite、Webpack、Gulp 使用同一套 raw/semantic 变化判定。
  - Webpack watch 移除独立的首次扫描标记和 HTML/JS 原文 hash 汇总，改由 compiler build state 的 iteration、reset 与 semantic signature 统一驱动全量扫描和 CSS 缓存失效，避免无关格式变化触发重复生成。
  - `AssetEmissionPlan` 支持 bundler-neutral 的泛型 source payload，Webpack 的 asset 覆盖、创建、删除和 linked JS 模块写回统一通过 emission plan executor 调用 compilation API；缓存命中的 Webpack Source 对象保持原样，不会为写回计划被强制序列化。
  - 为旧 generator pipeline 建立显式 execution/output context 契约，移除生成执行与三个 CSS finalizer 的 `context: any`，使后续 source metadata 迁移能够由 TypeScript 校验输入、生成结果和兼容处理状态。
  - generator source metadata 改由模块私有 Symbol 保存，并统一通过结构化访问器读取；metadata 在 source clone 时继续保留，但不再暴露 `__weappTailwindcssMeta` 字符串字段或进入序列化结果。
  - generator pipeline 在进入生成与 compilation session 前将来源转换为显式 `{ source, metadata }` record，并从传给 Tailwind engine 的 source 中剥离内部 metadata，使 source identity、scope、preflight 与 candidate 隔离不再依赖生成器输入对象上的隐藏状态。
  - source resolver 的公开内部契约统一返回 source record，candidate validation 与 CSS generation 共用同一结构化来源边界，调用方不再自行读取或转换 attached metadata。
  - CompilationSession scope source 支持显式依赖记录，SourceGraph 为 Tailwind CSS/config 依赖建立 `depends-on` 边并在依赖集合变化时失效对应 scope；编译结果同时暴露 clone 后的 graph edges，便于 bundler contract 与 shadow 差异校验。
  - 默认编译模式由 legacy 切换为 graph，使 Tailwind v4 生成默认使用 CompilationSession、结构化 artifact 与 AST adapter；仍可通过 `WEAPP_TAILWINDCSS_COMPILER=legacy` 紧急回退，或使用 `shadow` 继续比较新旧管线的 CSS 语义。
  - Tailwind generation artifact 在生成后发现的 CSS、插件与配置依赖现在会按 source 提交到同一个 CompilationSession revision，并原子更新 SourceGraph；过期并发生成结果不能覆盖当前 revision 的 dependency edges。
  - Webpack watch 现在把 `modifiedFiles` 与 `removedFiles` 转换为 compiler dependency ChangeSet，并依据 SourceGraph 精确判断受影响的 CSS scope；命中的 scope 通过稳定递增的 dependency revision 穿透 CSS cache，并使 Tailwind generation session 失效后重新生成，generation artifact 依赖也会注册到 Webpack `fileDependencies`。
  - 新增 bundler-neutral 的 `CompilationChangeCoordinator`，统一持有待消费的 dependency ChangeSet、scope dependency revision 与 generation session 失效状态。Webpack 改为复用该协调器；Vite 的 `watchChange` 与 `handleHotUpdate` 也会把依赖变化提交到同一契约，同一轮重复事件只递增一次 scope revision。graph 与 shadow 生成入口按 scope 原子消费 ChangeSet，依赖变化时会放弃旧 `previousCss` 与 `previousClassSet` 增量追加状态，避免 generation session 重建后把完整 CSS 重复追加到旧产物。
  - Gulp 的 Tailwind v4 CSS 生成改为进入统一 v4 generation core，使 Vinyl CSS scope 也由 `CompilationSession` 持有候选、classSet、依赖和 revision。`createPlugins()` 新增 `watchChange(file, event)` 供 Gulp watcher 提交 update/delete 事件；命中的 generation dependency 会失效 session，并通过 scope dependency revision 穿透 CSS cache。删除事件还会清理 runtime source、自动发现的 CSS source 和对应 process cache，避免 watch 中继续使用已删除文件的状态。
  - shadow 编译模式新增结构化 CSS 语义差异报告，按 JSONPath 定位 fragment、selector、声明顺序、scope、候选集合、依赖和 source entry 差异，并限制单次报告数量。内部生成入口可通过 `onCompilerShadowReport` 接收每次比较结果，诊断数据只包含可序列化快照，不再暴露 PostCSS AST。
  - 新增 bundler-neutral 的 shadow report session，按构建轮次和显式 output scope 聚合并隔离克隆最新比较结果，同一 source 的主包、分包或 scoped 输出不会互相覆盖；session 同时限制保留数量并汇总匹配、失败、截断和丢弃计数。Vite `generateBundle`、Webpack `processAssets` 与 Gulp `watchChange` 会在各自真实生命周期开始新轮次；异步生成只允许向启动时对应的 revision 提交报告，避免旧构建污染新结果。Gulp 插件额外提供显式轮次开始与快照读取方法，便于自定义流任务建立切流门禁。
  - shadow report session 新增显式完成与封存语义，Vite CSS finalizer 和 Webpack `processAssets` 会在本轮所有 CSS 生成结束后自动完成，Gulp 插件提供 `completeCompilerShadowRun()` 供流任务声明结束。临时环境变量 `WEAPP_TAILWINDCSS_COMPILER_SHADOW_GATE=report|error` 可通过 `[weapp-tailwindcss:compiler-shadow]` 单行 JSON 输出门禁汇总，或在出现语义差异、截断报告、报告丢弃时中止构建；默认 `off` 不改变现有行为。
  - 新增统一 compiler owner 生命周期释放：Vite `closeBundle`、Webpack `watchClose`/`shutdown` 和 Gulp `dispose()` 会清理 CompilationSession、Tailwind generation engine、待消费 ChangeSet 与 shadow report。scope pool 会等待仍在执行的生成任务结束后再释放 session，避免 watch 关闭时出现旧生成结果写回已释放状态；同一 owner 的并发关闭会复用同一个释放任务，防止后触发的 hook 越过仍在运行的编译。
  - compiler owner 进入释放窗口后会统一拒绝创建新的 CompilationSession、generation pool、ChangeSet coordinator 与 shadow report session，待释放完成后才允许同一 owner 开启下一轮构建，避免关闭期间出现新旧状态交叉持有。
  - 新增 canonical compilation scope snapshot builder，CompilationSessionPool 与 bundler contract 共用 source graph、candidate source 和输出 asset 的构造规则；Vite、Webpack、Gulp 的相同初始与增量输入现在会统一校验 runtime snapshot 和 CompilationResult 等价性。
  - Gulp 的 Vinyl 内容写回改为通过 AssetEmissionPlan executor 执行，并新增三端写回契约，确保 Vite bundle、Webpack compilation 和 Gulp stream 对更新、新建、删除操作得到等价产物。
  - RuntimeCompilationSnapshot 新增显式 removedFiles：核心层不再把快照中缺席的文件猜测为删除；Webpack port 可依据完整 compilation asset 集合判断消失的输出，Vite partial snapshot 与 Gulp watcher 则消费 bundler 明确上报的删除。显式删除会清理 runtime candidate、source hash、linked dependency 和 CompilationSession candidate source，即使同一轮设置了 hasOmittedKnownFiles 也不会继续保留已删除文件状态。
  - Vite production port 新增基于 Rollup facade、asset originalFileNames 与已缓存 CSS source/output 元数据的产物归属表。`watchChange` 删除事件会按真实归属向每个 generateBundle session 提交一次性 removedFiles；增量 bundle 中仅仅缺席的无关产物仍会保留，当前轮仍实际输出或由多个 source 共同拥有的产物不会被误删，并覆盖 `.acss`、`.ttss` 等非微信样式后缀。
  - 缺少 Rollup originalFileNames 的模板 asset 会复用 source-candidate transform store 的精确 source 命中登记产物归属；仅依赖文件后缀的兼容匹配不会获得删除 ownership，避免模糊路径关联导致错误清理模板候选。
  - Vite source/output ownership 现在按 source update revision 原子替换：同一源码重新产出新 hash 文件时，旧 output 会作为显式删除提交且历史关系不会持续增长；稳定文件名仍由当前 bundle 过滤，不会产生误删。连续 100 次更新后 relation 与 pending queue 保持恒定。
  - 新增真实 Vite watch 回归，覆盖没有 originalFileNames 的支付宝模板 asset：源码删除后下一轮构建不再保留该模板候选生成的安全类名，验证 watchChange、source-candidate 精确归属和 removedFiles 已贯通实际构建生命周期。
  - Vite remembered CSS refresh 不再在 generateBundle/replay 阶段通过 readFile 补取源码。普通样式更新消费 source-candidate transform cache，扫描规则排除的样式由 watchChange 生命周期显式写入 CSS memory；缓存缺失时跳过 replay 刷新并保留已有状态。remembered replay 直接消费生命周期缓存的 source snapshot，产物写回统一通过 `AssetEmissionPlan` 执行。
  - Vite generateBundle port 不再向内部 runtime 透传 remembered source refresh 能力；普通 CSS asset 与缺失 asset replay 统一只消费 load、transform、watchChange 和 handleHotUpdate 已提交的 source snapshot，后置阶段不能重新解析源码状态。
  - 移除 `GenerateBundleContext`、CSS memory 和内部 runtime 中仅供后置阶段使用的 `refreshRememberedCssSource` 兼容契约；remembered source 更新现在只保留按 source file 提交的生命周期 API。
  - 将 Vite 普通 CSS asset 的 remembered source 匹配、scope 过滤、SFC snapshot 优先级和显式 root source 选择提取为独立 source plan，压缩 runtime 只负责提交构建图上下文并消费结构化结果。
  - Vite source plan 进一步接管 temporary CSS asset 的首次 fallback，并显式返回最终 output、非主 chunk 标记、temporary 命中状态和 configured source owner；runtime 不再重复修改 source 选择状态。
  - Vite CSS source plan 继续统一 scoped configured source、构建图与生命周期缓存推断、多入口 temporary source 以及匿名 CSS asset fallback，并显式区分 remembered source basedir 与 bundler source root。generateBundle runtime 只消费最终 source/output plan，不再维护嵌套来源选择分支。
  - Vite temporary CSS source 队列改由独立 planner 合并 runtime-linked、remembered、显式配置和分包 scope 来源，并保持原有 ownership 优先级与去重规则；generateBundle 不再自行拼接四组临时来源。
  - Vite root import shell 的识别、唯一生成目标推断和跨轮次复用改由纯 planner 返回结构化结果；generateBundle 只负责把明确的 target 写入 owner Map，不再在 CSS entry handler 内遍历配置来源和已处理产物猜测根样式归属。
  - Vite CSS asset 的初始 output、root shell 复用、`originalFileNames` configured entry 匹配和 matched source resolver 统一由 `CssAssetOutputPlan` 计算；后续 source composition 共享同一个输出归属结果，避免 handler 内重复改写 output identity。
  - Vite CSS source composition 改由独立 planner 合并 remembered fragments、选择 generator source、计算用户 layer、configured entry、root injection 与 handler options，并以结构化副作用意图返回 root shell target 和 configured source owner；generateBundle 不再直接维护这组嵌套状态。
  - Vite CSS asset identity 改为优先依据 Rollup `originalFileNames`、真实 generator placeholder source 和生命周期 processed source 生成结构化 kind；generateBundle 不再直接搜索 placeholder 文本，旧 marker 识别仅保留在 port 兼容 resolver。
  - Vite CSS transform 的 processed asset 复用、generator runtime 跟踪、last result replay 与缓存签名改由纯 decision/cache planner 统一计算；generateBundle 不再内联维护候选变化、stale CSS、runtime-linked source 和 cache key 的交叉判断。
  - Vite 的 Tailwind generation、Web passthrough、mini-program import shell 与普通 style handler 改由结构化 CSS transform task 执行并返回 kind、classSet、dependencies 和 CSS；generateBundle 只消费结果登记候选、依赖与产物，不再内联四条转换分支。
  - Vite CSS transform result 的依赖监听、classSet 合并、source diff、普通 CSS 记录与 pipeline injection 统一由 application 边界执行；transform task 不再直接修改 runtime 或 bundler port 状态。
  - Vite CSS process cache、shared transform cache、last result 与 remembered source 写回统一由 cache task/application 负责；generateBundle 不再直接调用 `processCachedTask` 或维护缓存命中分支。
  - 删除历史上机械压缩的 `bundlers/vite/generate-bundle-runtime.ts`，将同一生成协调逻辑迁入可维护的 `generate-bundle/runtime.ts` 并更新 compiler port mock；后续拆分不再基于单行压缩源码。
  - 进一步将 configured CSS source/root resolver、runtime candidate validation、CSS entry processing 与 transform/cache scheduling 拆为独立边界，使 Vite generateBundle 协调器不再混合来源选择、候选校验、转换执行和缓存写回职责。
  - 删除历史上机械压缩的 `shared/create-framework-plugins-runtime.ts` 实现形式，并将 HMR candidate 状态、source scan session、source-candidates Vite port 与 framework post plugin 拆为独立 owner；watch/HMR 不再通过主插件工厂直接共享 pending candidate、scan cache 和 dependency invalidation 变量。
  - Vite CSS asset 身份不再通过 `generator-placeholder`、`vite-placeholder` 或 generated marker 文本猜测，改由 Rollup `originalFileNames`、生命周期登记的 source identity 与显式 placeholder metadata 决定。新增 processed CSS registry 统一持有 source/output 关系、处理结果和 prune 生命周期，增量 watch 中的 output 记录不再反向污染当前 asset 身份。
  - Vite lifecycle CSS snapshot 写入时会同步登记 source/output ownership，缺席 CSS asset 的恢复只按 `originalFileNames`、精确 output identity 与 relation owner 查询来源；删除 generated marker 解析、文件名相似度评分和任意 remembered source fallback，避免同名分包或历史路径被错误重放。
  - 性能验收统一收紧为 5%：PR benchmark 现在按冷构建中位数、HMR P95、插件处理耗时以及 build/watch 子进程树的 peak/steady RSS 与基线逐项比较，不再使用 15%/20% 加绝对耗时豁免。source candidate 微基准同时验证连续 100 次 class 添加与删除后的稳态 heap，持续增长会直接阻断性能门禁；watch 与通用 CI 内存报告也会输出 steady RSS，并支持按同一 5% 阈值比较基线报告。

- 🐛 **修复 uni-app x 的 UVUE Tailwind CSS v4 兼容处理：内联字号、颜色与间距主题变量，移除不受支持的 `tw-root` 和 `@property` 根载体，将 `rounded-full` 的无限圆角降级为有效数值，并化简 UVUE 无法解析的静态 `calc()` 表达式，使 `text-xs`、`text-sm`、`text-base`、`text-xl`、`text-white`、`rounded-full` 及 scoped `@apply` 在 Android、iOS 和小程序产物中正常生效。同时让 Vite watch 编译会话在增量构建之间保持有效，并在 watcher 真正关闭时释放，避免快速重建时报编译器资源已释放或修改类名后样式不更新。** [#1003](https://github.com/sonofmagic/weapp-tailwindcss/pull/1003) by @sonofmagic
- 📦 **Dependencies** [`8d9cc88`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8d9cc8878cc430a4953579e2c76213402f0932e1)
  → `@weapp-tailwindcss/shared@2.0.1`, `tailwindcss-config@2.0.2`, `@weapp-tailwindcss/postcss-calc@1.0.3`

## 3.1.12

### Patch Changes

- 🐛 **修复绝对路径 source entry 在存在系统路径别名时无法匹配源文件的问题。** [`da88a42`](https://github.com/sonofmagic/weapp-tailwindcss/commit/da88a42f41ffa1ce0de365d7708526a963ab3165) by @sonofmagic

## 3.1.11

### Patch Changes

- 🐛 **由 weapp-tailwindcss 统一消费小程序与 Web Compact 产物中的 `@layer`，按照声明顺序重排样式块后移除 layer 语法，并阻止 postcss-preset-env 生成 `:not(#)` 权重占位选择器。现代 Web 产物继续保留原生 cascade layers。** [#990](https://github.com/sonofmagic/weapp-tailwindcss/pull/990) by @sonofmagic

- 🐛 **统一 Vite、Webpack 与 Gulp 构建态的 Tailwind CSS 生成时机，在生成阶段展开必要的嵌套规则、编译平台条件并清理 `@layer`、Web preflight 与 specificity 占位选择器，同时保留工具类和本地 `@import` 交给框架原有的 PostCSS 流程；最终适配继续注入小程序 preflight，并清理等价的 calc fallback 声明，避免产物重复输出同一份样式，同时保留 Vite dev HMR 的增量样式。修复 scoped `@reference` + `@apply` 泄漏独立工具类，以及 Webpack 在拼接裸选择器用户样式时重复输出根变量、preflight 和同一产物内已被后规则覆盖的等价规则问题。为 MPX 2.x 声明可选 peer 依赖，使 pnpm 严格依赖模式下从生成样式上下文加载的 MPX loader 始终可解析，同时不影响非 MPX 项目的安装。** [#988](https://github.com/sonofmagic/weapp-tailwindcss/pull/988) by @sonofmagic

## 3.1.10

### Patch Changes

- 🐛 **修复 Tailwind CSS v4 现代颜色配合动态透明度变量时的 RGB 通道转换，避免 OKLCH 等颜色被错误地直接当作 RGB 通道输出。** [#987](https://github.com/sonofmagic/weapp-tailwindcss/pull/987) by @sonofmagic

## 3.1.9

### Patch Changes

- 🐛 **升级 `@tailwindcss-mangle/engine` 到 0.1.3，并适配 Tailwind v4 生成结果中 source metadata 的返回行为变化。** [`c0565ad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c0565ad2dad6adf2420348e5a490a763e853721c) by @sonofmagic
  - `weapp-tailwindcss` 现在会在自身的 v4 扫描层回填已解析的 `@source` 扫描规则，避免依赖底层 engine 继续透传 compiled sources；同时修正 Vite 已处理 CSS replay 到小程序根样式资产时的显式目标 fallback 边界。

- 🐛 **新增 Tailwind v4 demo 的官方 PostCSS parity 验证链路，并支持 `generator: false` 关闭内置生成器但保留小程序 CSS、模板和 JS 转译。** [`a300a00`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a300a000b094ca138d2348568c9dd378b4779f4e) by @sonofmagic
  - 同时让小程序端 Tailwind v4 主题颜色跟随当前安装的 Tailwind 包解析，避免内置静态颜色表与官方输出漂移。

## 3.1.8

### Patch Changes

- 🐛 **将小程序样式中不支持的非本地 `@import` 清理逻辑下沉到 PostCSS Root 级工具，并在 Vite HMR 注入路径复用同一次 CSS AST 解析来完成 import 清理和依赖收集，减少重复 parse。** [`b2cbe21`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b2cbe214e3958cb5febf3a46ba0c4b14af76c27b) by @sonofmagic

## 3.1.7

### Patch Changes

- 🐛 **内部按框架与打包器拆分插件分支，保持 `WeappTailwindcss` 与 PostCSS 公开入口不变。** [#969](https://github.com/sonofmagic/weapp-tailwindcss/pull/969) by @sonofmagic
  - `weapp-tailwindcss` 现在会在 Vite、Webpack、Gulp 入口提前解析 app type / bundler 分支，并进入对应 `frameworks/*` 插件工厂。uni-app Vite、uni-app x Vite、Taro、MPX、weapp-vite 与原生 Gulp 链路拥有直观的目录边界，uni-app x Vite 的额外插件组合也只保留在自己的框架分支中，降低单个框架改动影响其它打包器的风险。
  - `@weapp-tailwindcss/postcss` 增加 CSS 处理分支解析，将普通小程序、Web、`uni-app-x-css-webview` 与 `uni-app-x-css-uvue` 兼容处理拆到独立目录，避免平台兼容逻辑继续散落在通用 handler 中。
  - PostCSS 内部进一步拆出 `frameworks/*` 策略层与无框架语义的 style target profile：Taro、MPX、uni-app、uni-app x、weapp-vite 等框架先进入各自 strategy，再显式选择 `mini-program`、`web` 或 uni-app x 专属 CSS target，方便后续按框架扩展不同处理顺序，同时用互斥测试锁住“不执行其它框架后处理”的边界。
  - 新增 `@weapp-tailwindcss/hbuilderx-runner`，沉淀 HBuilderX CLI 本地运行能力。它负责解析正在运行的 HBuilderX 或 `HBUILDERX_CLI_PATH`、封装项目 open/close/launch、统一超时和进程树清理，并把项目识别错误、配置加载失败、Android/iOS/Harmony 工具链缺失等常见失败归类成可诊断错误，供 HBuilderX e2e 与后续 demo/CLI 脚本复用。

## 3.1.6

### Patch Changes

- 🐛 **修复 Tailwind CSS v4 小程序与 generator 产物中 `--tw-gradient-position` 仍保留 `in oklab` 等现代插值语法的问题，统一降级为小程序/WebView 兼容的渐变方向值。** [`ed75e33`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ed75e33c4342c98b198d60107c1bca13cbb8b607) by @sonofmagic

- 🐛 **将 `legacy-web` Web 兼容预设明确收敛到 Chrome 91 / AppleWebKit 537.36 基线，并补充现代 `rgb()` / `hsl()` 空格斜杠颜色语法降级，确保 `webCompat` 与 uni-app App WebView safe selector 产物保持可用。** [`abbcdf7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/abbcdf72edc5615965e46be0b3d8af3ac78887d1) by @sonofmagic

## 3.1.5

### Patch Changes

- 🐛 **在 `weapp-tailwindcss` 主配置中新增 `styleInjector`，默认关闭。启用后会内置复用 `weapp-style-injector` 的样式入口注入能力，并在 Vite/Webpack 中按 `appType` 自动选择 uni-app、Taro、Mpx 或通用预设；当主插件通过 `disabled: true` 或 `disabled: { plugin: true }` 关闭时，样式注入也会同步关闭。** [`747dcf3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/747dcf34a1cf77a14b859ee86f537ce2cd89bddd) by @sonofmagic
  - 同时修复 `@weapp-tailwindcss/postcss` 中 `Px2rpxOptions` 在 NodeNext 类型解析下无法正确导出的声明问题。
  - `weapp-tailwindcss` 直接复用 `weapp-style-injector` 的现有实现，避免在主包内重复维护样式注入逻辑，同时保持 `weapp-style-injector` 原有独立入口不变。

## 3.1.4

### Patch Changes

- 🐛 **修复 `@weapp-tailwindcss/postcss` 产物在 Vite/Vitest SSR 中可能被错误重写并触发 `Unexpected token ':'` 的问题，同时修正 `tailwindcss-config` 的源码导入扩展名，提升发布产物与测试链路稳定性。** [`0e08dac`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0e08dacbe3de03a83a5c7b675adffaf6d0e81e3f)

- 🐛 **抽出 Tailwind v4 `@apply` only CSS 的选择器收集与生成 CSS 过滤工具，并在 PostCSS generator 插件中复用当前 Root，避免为原始 CSS 再次解析。** [`4ea174c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4ea174c4e6c8518e4cd10476b8a0f5b8978cd9bc)
  - 同时复用已序列化的入口 CSS 字符串进行自动扫描判断，减少同一轮处理中的重复 `root.toString()`。

- 🐛 **修复 uni-app-vite 小程序端在 Tailwind CSS v4 场景下对 `@layer base` 的误判警告，提前清理 mini-program CSS 中的 cascade layer 语法，并补充对应回归测试。** [`8b98c43`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8b98c4361680bcc51d192dbbdd126842c45d5db1)

- 🐛 **新增 Tailwind CSS 指令 AST 分析工具，并让生成 CSS 入口复用该分析能力，减少重复解析 CSS 字符串的开销。** [`90dc9ca`](https://github.com/sonofmagic/weapp-tailwindcss/commit/90dc9ca048fb28aa913033dc0bb80d06ce85d70c)

- 🐛 **将本地 CSS `@import` 的分析、拆分、清理和输出路径重写逻辑下沉到 `@weapp-tailwindcss/postcss`，并新增可复用的 PostCSS Root 级 API。** [`d789492`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d7894923e84d8649065da5ec8ff29eaee26aa340)
  - `weapp-tailwindcss` 的 Tailwind v4 生成 CSS 管线现在会复用同一次 CSS AST 解析结果处理本地 import wrapper、纯 import shell 和 import 拆分，减少重复 `postcss.parse(css)` 开销。

- 🐛 **修复 Web 兼容模式下 Tailwind CSS v4 的渐变变量与 @property 处理，避免 H5 渐变失效，并补充 uni-app、taro、mpx、uni-app x 等场景的回归测试。** [`5540608`](https://github.com/sonofmagic/weapp-tailwindcss/commit/554060826b4e5f073a075f18f559f77b72d4fd0e)

- 🐛 **优化 PostCSS 生成器样式处理性能，复用 CSS source 扫描结果，减少重复 `root.toString()` 与重复解析 source entries 的开销；同时导出 source scan 工具并补齐覆盖率门禁与回归测试。** [`634ff3b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/634ff3b2a8c7e8f98cc58ddc92e27f7f081f3cbd)

- 🐛 **修复 Web 兼容模式下 Tailwind CSS v4 的 `@property` 初始值与现代颜色降级处理，确保开启 `webCompat` 后仍保留现代浏览器的最终展示效果，同时为旧 WebView 提供可用 fallback。** [`36b1822`](https://github.com/sonofmagic/weapp-tailwindcss/commit/36b182251090a980b1a60ff5752a301a3d0e0fc5)
- 📦 **Dependencies** [`0e08dac`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0e08dacbe3de03a83a5c7b675adffaf6d0e81e3f)
  → `tailwindcss-config@2.0.1`

## 3.1.3

### Patch Changes

- 🐛 **本次发布整理了从 `5.1.2` 之后的主要变更：修复 Tailwind v4 多 `cssEntries` 场景下的主样式误匹配与分包样式映射问题，补齐 Taro webpack5/Vite、Rspack、H5/web 兼容与平台环境支持，并同步修复主题过渡的首帧闪烁问题。** [`64faef4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/64faef437046ca1b3f438a2e55d101895500f7a5) by @sonofmagic

## 3.1.2

### Patch Changes

- 🐛 **新增 Web 端 Tailwind CSS v4 产物兼容降级配置，可通过 `generator.webCompat` 移除或降级 `@theme`、`@layer`、`@property`、现代颜色函数与相关 `@supports`，以适配更多 Android/iOS WebView 场景。** [`9ce2cd5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9ce2cd590ea2a373f4372d499a10ed8a2d333d0c) by @sonofmagic

## 3.1.1

### Patch Changes

- 🐛 **将 Tailwind 候选提取与源码扫描依赖从 `tailwindcss-patch` 收敛到 `@tailwindcss-mangle/engine`，减少 PostCSS 包的额外 patch/CLI 依赖。** [`ddcb7c8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ddcb7c82d00a06be462c13b7d11d4367c1b1091e) by @sonofmagic

## 3.1.0

### Minor Changes

- ✨ **移除 `@weapp-tailwindcss/postcss` 中 Tailwind CSS v3 相关的版本探测、显式 `version` 配置、v3 fixture 与 benchmark 基线。** [`1dc7b97`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1dc7b9766df9ab218e1eedb0eec392e4d0a7f515) by @sonofmagic
  - PostCSS 生成插件现在固定按 Tailwind CSS v4 CSS-first 流程处理。仅包含 `@apply` 的局部 CSS 会在内部注入 Tailwind v4 `@reference` 上下文并跳过自动源码扫描，不再依赖旧的 v3/v4 分支判断。

- ✨ **移除 Tailwind CSS v3 兼容链路，后续生成、运行时与小程序 CSS 处理统一面向 Tailwind CSS v4。** [`d9be474`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d9be474f9f6f205a78f5057421e990a5004a6474) by @sonofmagic

## 3.0.8

### Patch Changes

- 🐛 **调整 Tailwind CSS v4 渐变工具类的小程序兼容策略，默认保留 `--tw-gradient-*` CSS 变量链路，覆盖 `background-image` 文档中的 linear、radial、conic、任意值、自定义属性、stop 颜色与位置等组合。** [`d3487a1`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d3487a1b669bb194cdbfa0cd7a412e970b01632d) by @sonofmagic
  - 新增 `cssOptions` 作为统一的 CSS 生成与兼容后处理微调配置入口，`cssPreflight`、`cssPreflightRange`、`cssChildCombinatorReplaceValue`、`cssPresetEnv`、`autoprefixer`、`atRules`、`injectAdditionalCssVarScope`、`cssSelectorReplacement`、`rem2rpx`、`px2rpx`、`unitsToPx`、`unitConversion`、`platform`、`cssRemoveHoverPseudoClass`、`cssRemoveProperty`、`cssCalc` 与 `tailwindcssV4GradientFallback` 等配置都可以放入该分组。顶层旧字段仍保留兼容并标记为 deprecated；其中 `cssOptions.tailwindcssV4GradientFallback` 显式设置为 `true` 时才追加旧版字面量组合兜底，避免默认产物膨胀并让 v4 渐变行为更接近 Tailwind 官方输出。

- 🐛 **修复 Tailwind CSS v4 渐变位置变量在小程序中的空 fallback 兼容问题。`--tw-gradient-from-position`、`--tw-gradient-via-position` 与 `--tw-gradient-to-position` 会统一输出为带逗号和空格的空 fallback，避免 `var(--tw-gradient-*-position,)` 或缺少 fallback 时导致渐变在微信小程序运行时渲染异常；显式 fallback 仍保持原样。** [`8501c4b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8501c4b2243da8cb0f6fe2d33b22acd84a17d108) by @sonofmagic

## 3.0.7

### Patch Changes

- 🐛 **修复 `:where(...)` 内嵌 `:is(...)` 或多分支 `:where(...)` 时小程序产物仍可能保留复杂伪类的问题，补充 Tailwind v4 preflight、space/divide、group/peer、child 与主题 class 选择器的单测和微信开发者工具 IDE 视觉回归。** [#918](https://github.com/sonofmagic/weapp-tailwindcss/pull/918) by @sonofmagic

- 🐛 **修复 `:where(.dark, .dark *)` 等多分支选择器展开后丢失通配符后代分支的问题，确保小程序端会生成对应的 `view` / `text` 后代选择器。** [#920](https://github.com/sonofmagic/weapp-tailwindcss/pull/920) by @sonofmagic
  - 修复 Taro demo 的 `dev:harmony` 脚本未显式开启 HMR timing 输出的问题，确保 Harmony 别名脚本与实际 watch 脚本行为一致。

- 🐛 **修复生成 CSS 裁剪时误删用户手写的小程序原生元素样式的问题，避免 Taro Webpack Tailwind CSS v4 等场景下 `view`、`text`、`button`、`input` 等标签规则被移除。** [`03fd4ec`](https://github.com/sonofmagic/weapp-tailwindcss/commit/03fd4ec44be77ff9cc755bfb6e7baa9025577e1f) by @sonofmagic

## 3.0.6

### Patch Changes

- 🐛 **将 `weapp-tailwindcss` 中生成型 PostCSS 插件、PostCSS 辅助扫描逻辑和 `css-macro/postcss` 转换入口迁入 `@weapp-tailwindcss/postcss`，主包保留兼容转发入口，方便后续统一维护 PostCSS 能力边界。** [#914](https://github.com/sonofmagic/weapp-tailwindcss/pull/914) by @sonofmagic

## 3.0.5

### Patch Changes

- 🐛 **修复小程序 CSS 产物中仅含注释或已被清空的 `@media` 块未被移除的问题，避免微信开发者工具在 WXSS 编译时报 `unexpected token }`。同时同步 watch-HMR 的 Taro React v4 H5 脚本断言和 issue33 性能预算覆盖逻辑。** [#912](https://github.com/sonofmagic/weapp-tailwindcss/pull/912) by @sonofmagic

## 3.0.4

### Patch Changes

- 🐛 **修复 Tailwind CSS v4.3 生成的 `var(--tw-*,)` 空 fallback 在微信开发者工具中解析异常的问题，确保 `rotate-y-90` 等 transform 工具类输出为小程序可识别的 `var(--tw-*, )`。** [`92c822e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/92c822eb29be8ad3571bb0a7fc27327e6defb19c) by @sonofmagic

## 3.0.3

### Patch Changes

- 🐛 **修复 uni-app x Tailwind CSS v4 场景下 `uvue.wxss` 默认 `border-width: medium` 覆盖 Tailwind preflight 后导致的异常黑边问题。** [`65f084b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/65f084ba30ad8a0b4c36ce46e567d2e1b1490b64) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 小程序样式输出：普通小程序端保留 `box-sizing`、`margin`、`padding`、`border` preflight reset，避免 Taro Vite 的 `app-origin` 样式重复注入主样式，并去重合并后的 hoisted preflight 声明。** [`4b2ed64`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4b2ed643d8b62f1c9e7a81c77a0e583444e6f9db) by @sonofmagic

## 3.0.2

### Patch Changes

- 🐛 **将 `@weapp-tailwindcss/postcss-calc` 从 submodule 迁入 `packages` 作为独立 monorepo 子包，并让 `@weapp-tailwindcss/postcss` 通过 workspace 直接消费，统一安装、测试和发布链路。** [`2f41ff5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2f41ff5c5861828b3cafe0a1248c7eecd690cfb7) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 的 `rounded-full` 在小程序端生成 `calc(infinity * 1px)` 后无法稳定生效的问题，统一归一化为小程序可解析的 `9999px`。** [`84c1c02`](https://github.com/sonofmagic/weapp-tailwindcss/commit/84c1c02b66eb4d329a889fd555dae4188e35a227) by @sonofmagic
- 📦 **Dependencies** [`2f41ff5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2f41ff5c5861828b3cafe0a1248c7eecd690cfb7)
  → `@weapp-tailwindcss/postcss-calc@1.0.1`

## 3.0.1

### Patch Changes

- 🐛 **修复小程序端生成样式中的 `:before` / `:after` 输出会被规范化为单冒号，以及 Tailwind preflight 中 `--tw-content: ''` 被错误合并到 `view,text,::after,::before` 基础选择器的问题，确保伪元素内容初始化只作用于 `::before` / `::after`，并补充分包入口样式快照覆盖。** [`206093e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/206093e9878e6f4456bbd72f1a61856abc86fc88) by @sonofmagic

## 3.0.0

### Major Changes

- 🚀 **新增 HBuilderX 直连演示矩阵，覆盖 uni-app Vite Vue 3 与 uni-app x 的 Tailwind CSS v3/v4 场景，并提供 `hbuilderx` preset。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 同时将已由 tsdown 打包进产物、且不需要消费者安装的实现依赖下移到 `devDependencies`。公开导出或运行期加载边界仍保留为正式依赖，例如 `tailwindcss-config` 的 `jiti`，以及 `@weapp-tailwindcss/shared` 对外导出的 `defu`、`get-value`、`set-value`。

- 🚀 **整理 mini-program 的 PostCSS 处理链路，把重复的规则判定集中到 `packages/postcss` 内部，统一导出生成 CSS 清理能力，后续维护会更清晰。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

### Minor Changes

- ✨ **新增内置 `unitConversion` 配置，支持基于 `postcss-rule-unit-converter` 的任意样式单位转换，并可按 `weapp`、`h5`、`web`、`app` 等平台分别配置转换规则。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

### Patch Changes

- 🐛 **将小程序 CSS 清理、收尾与兼容处理集中到 `@weapp-tailwindcss/postcss`，主包仅保留兼容导出与构建器编排；同时把实验性的 Lightning CSS 样式处理迁移到 `@weapp-tailwindcss/experimental/lightningcss`。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **内置 `css-macro` 的 PostCSS 转换感应逻辑：当 Tailwind CSS v3 配置中注册 `weapp-tailwindcss/css-macro`，或 Tailwind CSS v4 入口 CSS 中声明 `@plugin "weapp-tailwindcss/css-macro"` 时，会自动启用条件编译注释转换，不再要求常规集成手动注册 `weapp-tailwindcss/css-macro/postcss`。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 同时在生成 CSS 裁剪阶段保留由 `css-macro` 产生的 `#ifdef` / `#ifndef` / `#endif` 注释，并同步更新文档与 demo 配置。

- 🐛 **升级 ESM 化依赖后，将公开包的 Node.js 安装版本约束统一到 `^20.19.0 || >=22.12.0`，避免不支持稳定 ESM/CJS 混合加载的 Node.js 版本安装使用。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 元素变量作用域选择器与小程序重置选择器不一致的问题，避免仅有边框等基础样式时小程序端和 Web 端表现偏离。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复小程序最终样式中可能残留 `color-mix`、`oklab`、`oklch`、`lab`、`lch` 与 `display-p3` 颜色函数的问题，能确定的颜色会降级为 `rgb`/`rgba`，避免输出小程序不支持的颜色语法。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v3/v4 在部分生成链路中把 `text-[55rpx]` 等任意值误判为颜色时，非主 CSS chunk 没有恢复为长度声明的问题。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复核心源码在严格 TypeScript 配置下的类型问题，并清理对应 ESLint 诊断。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复小程序 CSS 前缀清理后 `transition-property` 声明重复的问题，避免 Tailwind CSS v3 的 `.transition` 输出保留多条等价声明。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 小程序产物移除 `@property` 后可能丢失 `--tw-border-style` 默认值的问题，避免只有 `border` 工具类时小程序端无法得到和 Web 端一致的默认实线边框；同时按需补齐实际使用到的 v4 运行时默认变量，并合并等价的小程序元素作用域规则，避免输出重复 selector。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 小程序产物中透明度颜色可能保留 `color-mix(in oklab, ...)` 的问题，将 `text-white/10`、`bg-sky-500/75`、`bg-sky-500/(--alpha)` 等颜色透明度写法转换为小程序可用的 `rgba(...)` 输出；同时修复 v4 增量热更新追加样式时重复注入 preflight reset 的问题。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **调整内置 `autoprefixer` 默认选项，显式关闭小程序不需要的 `grid` 与 `@supports` 前缀分支，保留 `remove: true` 清理过时前缀，并继续允许用户传入 `autoprefixer` 选项覆盖默认值。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **收敛小程序 CSS 的 `-webkit-` 前缀输出，默认仅保留 `background-clip: text`、`mask-*`、`box-orient` 等小程序场景需要的兼容写法，并移除 `text-decoration`、`filter/backdrop-filter`、`transform/animation/transition` 等浏览器冗余前缀。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **现在 Tailwind CSS v3 和 v4 场景都会默认开启内置 `autoprefixer` 后处理，用于补齐小程序 WebView 所需的兼容前缀；如需关闭可继续传入 `autoprefixer: false`。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 生成模式下 colors 透明度变量在小程序样式兼容阶段被静态降级为不透明色的问题，并补充颜色工具类、`@theme` 自定义颜色与禁用默认颜色的回归覆盖。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复小程序样式转换中错误保留 `[data-theme=dark]` / `[data-mode="dark"]` 这类属性选择器的问题。web 目标继续保留 Tailwind CSS v4 data attribute dark variant，小程序目标会移除依赖属性选择器的无效规则，避免生成小程序不支持的选择器或让 dark 样式无条件生效。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 生成模式下 data attribute 版 `@custom-variant dark` 在小程序选择器兜底清理阶段丢失属性选择器的问题，并补充默认媒体查询、`.dark` 自定义选择器和 `[data-theme=dark]` 自定义选择器的回归覆盖。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
- 📦 **Dependencies** [`73a7794`](https://github.com/sonofmagic/weapp-tailwindcss/commit/73a7794d50916d2189f22bfaa9e9ab9402b30df7)
  → `@weapp-tailwindcss/shared@2.0.0`

## 3.0.0-next.10

### Patch Changes

- 🐛 **修复 Tailwind CSS v4 元素变量作用域选择器与小程序重置选择器不一致的问题，避免仅有边框等基础样式时小程序端和 Web 端表现偏离。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 小程序产物移除 `@property` 后可能丢失 `--tw-border-style` 默认值的问题，避免只有 `border` 工具类时小程序端无法得到和 Web 端一致的默认实线边框；同时按需补齐实际使用到的 v4 运行时默认变量，并合并等价的小程序元素作用域规则，避免输出重复 selector。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

## 3.0.0-next.9

### Patch Changes

- 📦 **Dependencies** [`aaba811`](https://github.com/sonofmagic/weapp-tailwindcss/commit/aaba811cfc2ad003d3daf2cf290c9d8b770c6dfb)
  → `@weapp-tailwindcss/shared@2.0.0-next.1`

## 3.0.0-next.8

### Major Changes

- 🚀 **新增 HBuilderX 直连演示矩阵，覆盖 uni-app Vite Vue 3 与 uni-app x 的 Tailwind CSS v3/v4 场景，并提供 `hbuilderx` preset。** [#882](https://github.com/sonofmagic/weapp-tailwindcss/pull/882) by @sonofmagic
  - 同时将已由 tsdown 打包进产物、且不需要消费者安装的实现依赖下移到 `devDependencies`。公开导出或运行期加载边界仍保留为正式依赖，例如 `tailwindcss-config` 的 `jiti`，以及 `@weapp-tailwindcss/shared` 对外导出的 `defu`、`get-value`、`set-value`。

### Patch Changes

- 📦 **Dependencies** [`2d2acf2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2d2acf29cfee02ffb32783c8bd3c5de8d9aab9df)
  → `@weapp-tailwindcss/shared@2.0.0-next.0`

## 3.0.0-next.7

### Minor Changes

- ✨ **新增内置 `unitConversion` 配置，支持基于 `postcss-rule-unit-converter` 的任意样式单位转换，并可按 `weapp`、`h5`、`web`、`app` 等平台分别配置转换规则。** [#879](https://github.com/sonofmagic/weapp-tailwindcss/pull/879) by @github-actions

### Patch Changes

- 🐛 **内置 `css-macro` 的 PostCSS 转换感应逻辑：当 Tailwind CSS v3 配置中注册 `weapp-tailwindcss/css-macro`，或 Tailwind CSS v4 入口 CSS 中声明 `@plugin "weapp-tailwindcss/css-macro"` 时，会自动启用条件编译注释转换，不再要求常规集成手动注册 `weapp-tailwindcss/css-macro/postcss`。** [#879](https://github.com/sonofmagic/weapp-tailwindcss/pull/879) by @github-actions
  - 同时在生成 CSS 裁剪阶段保留由 `css-macro` 产生的 `#ifdef` / `#ifndef` / `#endif` 注释，并同步更新文档与 demo 配置。

- 🐛 **升级 ESM 化依赖后，将公开包的 Node.js 安装版本约束统一到 `^20.19.0 || >=22.12.0`，避免不支持稳定 ESM/CJS 混合加载的 Node.js 版本安装使用。** [#879](https://github.com/sonofmagic/weapp-tailwindcss/pull/879) by @github-actions

## 3.0.0-next.6

### Major Changes

- 🚀 **整理 mini-program 的 PostCSS 处理链路，把重复的规则判定集中到 `packages/postcss` 内部，统一导出生成 CSS 清理能力，后续维护会更清晰。** [`fea6731`](https://github.com/sonofmagic/weapp-tailwindcss/commit/fea6731fdb12a570842343432a4d471fa75de257) by @sonofmagic

### Patch Changes

- 🐛 **将小程序 CSS 清理、收尾与兼容处理集中到 `@weapp-tailwindcss/postcss`，主包仅保留兼容导出与构建器编排；同时把实验性的 Lightning CSS 样式处理迁移到 `@weapp-tailwindcss/experimental/lightningcss`。** [`649d229`](https://github.com/sonofmagic/weapp-tailwindcss/commit/649d2296a164a301ec7d40de093d2e1ccb8e60f1) by @sonofmagic

- 🐛 **修复小程序 CSS 前缀清理后 `transition-property` 声明重复的问题，避免 Tailwind CSS v3 的 `.transition` 输出保留多条等价声明。** [`b9e28da`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b9e28da65561c495dcc430346a5565211329cfbe) by @sonofmagic

## 2.2.1-next.5

### Patch Changes

- 🐛 **调整内置 `autoprefixer` 默认选项，显式关闭小程序不需要的 `grid` 与 `@supports` 前缀分支，保留 `remove: true` 清理过时前缀，并继续允许用户传入 `autoprefixer` 选项覆盖默认值。** [#873](https://github.com/sonofmagic/weapp-tailwindcss/pull/873) by @sonofmagic

- 🐛 **收敛小程序 CSS 的 `-webkit-` 前缀输出，默认仅保留 `background-clip: text`、`mask-*`、`box-orient` 等小程序场景需要的兼容写法，并移除 `text-decoration`、`filter/backdrop-filter`、`transform/animation/transition` 等浏览器冗余前缀。** [#874](https://github.com/sonofmagic/weapp-tailwindcss/pull/874) by @github-actions

## 2.2.1-next.4

### Patch Changes

- 🐛 **现在 Tailwind CSS v3 和 v4 场景都会默认开启内置 `autoprefixer` 后处理，用于补齐小程序 WebView 所需的兼容前缀；如需关闭可继续传入 `autoprefixer: false`。** [#872](https://github.com/sonofmagic/weapp-tailwindcss/pull/872) by @github-actions

## 2.2.1-next.3

### Patch Changes

- 🐛 **修复小程序最终样式中可能残留 `color-mix`、`oklab`、`oklch`、`lab`、`lch` 与 `display-p3` 颜色函数的问题，能确定的颜色会降级为 `rgb`/`rgba`，避免输出小程序不支持的颜色语法。** [`f36f230`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f36f23092a2986b9960ebc34ee54bdb93072e882) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 小程序产物中透明度颜色可能保留 `color-mix(in oklab, ...)` 的问题，将 `text-white/10`、`bg-sky-500/75`、`bg-sky-500/(--alpha)` 等颜色透明度写法转换为小程序可用的 `rgba(...)` 输出；同时修复 v4 增量热更新追加样式时重复注入 preflight reset 的问题。** [`67896ab`](https://github.com/sonofmagic/weapp-tailwindcss/commit/67896ab30b06aaf16335257c5b5b3156a86c302b) by @sonofmagic

## 2.2.1-next.2

### Patch Changes

- 🐛 **修复核心源码在严格 TypeScript 配置下的类型问题，并清理对应 ESLint 诊断。** [#859](https://github.com/sonofmagic/weapp-tailwindcss/pull/859) by @sonofmagic

## 2.2.1-next.1

### Patch Changes

- 🐛 **修复 Tailwind CSS v3/v4 在部分生成链路中把 `text-[55rpx]` 等任意值误判为颜色时，非主 CSS chunk 没有恢复为长度声明的问题。** [#856](https://github.com/sonofmagic/weapp-tailwindcss/pull/856) by @github-actions

## 2.2.1-next.0

### Patch Changes

- 🐛 **修复 Tailwind CSS v4 生成模式下 colors 透明度变量在小程序样式兼容阶段被静态降级为不透明色的问题，并补充颜色工具类、`@theme` 自定义颜色与禁用默认颜色的回归覆盖。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

- 🐛 **修复小程序样式转换中错误保留 `[data-theme=dark]` / `[data-mode="dark"]` 这类属性选择器的问题。web 目标继续保留 Tailwind CSS v4 data attribute dark variant，小程序目标会移除依赖属性选择器的无效规则，避免生成小程序不支持的选择器或让 dark 样式无条件生效。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

- 🐛 **修复 Tailwind CSS v4 生成模式下 data attribute 版 `@custom-variant dark` 在小程序选择器兜底清理阶段丢失属性选择器的问题，并补充默认媒体查询、`.dark` 自定义选择器和 `[data-theme=dark]` 自定义选择器的回归覆盖。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

## 2.2.0

### Minor Changes

- ✨ **新增 CSS 处理结果 LRU 缓存，对相同内容和配置的 CSS 直接返回缓存结果，跳过 PostCSS 处理流程。** [`e6d7e8c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e6d7e8c123545d279b434b0c237ea59a3f62a6fe) by @sonofmagic
  - 在 `createStyleHandler` 内部新增基于 LRU 的结果缓存（最大 256 条目），缓存键由选项指纹 + 内容探测信号 + 内容哈希组成。
  - 使用 FNV-1a 哈希算法计算内容哈希，开销极低（不依赖 crypto 模块）。
  - HMR 场景下相同 CSS 文件的重复处理直接命中缓存，端到端处理速度提升 18~55 倍。

- ✨ **新增 PostCSS 流水线按需裁剪能力，通过轻量级 CSS 内容探测自动跳过不必要的插件。** [`9a4a836`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9a4a836aa97c87b67cbb88bcd40b83f0bf1d52d6) by @sonofmagic
  - 新增 `content-probe` 模块，使用正则/字符串匹配快速探测 CSS 内容特征（现代颜色函数、preset-env 特征等）。
  - `createStylePipeline` 支持可选的 `FeatureSignal` 参数，根据信号按需跳过 `postcss-preset-env` 和 `color-functional-fallback` 插件。
  - `StyleProcessorCache` 将特征信号纳入缓存键计算，确保不同内容特征组合使用正确的处理器。
  - `createStyleHandler` 自动执行内容探测并传递信号，对外 API 签名不变，零配置即可获得优化。
  - 探测策略采用宽松匹配：宁可误报（多加载插件），不可漏报（遗漏需要的插件），确保处理结果等价。

### Patch Changes

- 🐛 **修复 `uni-app x` 的 `uvue/nvue` 样式目标会输出宿主不支持 CSS 的问题。** [`a835a94`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a835a94ae0780610dcb4da8439cdb8f5a44bb36c) by @sonofmagic
  - 在 `uvue` 目标下过滤非 class selector，避免继续输出 `space-x-*`、`space-y-*` 这类组合器选择器。
  - 在 `uvue` 目标下过滤不兼容声明，例如 `display: block`、`display: inline-flex`、`display: grid`、`grid-template-columns`、`gap`、`min-height: 100vh`。
  - 新增 `uniAppX.uvueUnsupported` 配置，支持 `error | warn | silent`，默认 `warn`。
  - 当策略为 `warn` 时，跳过不兼容 utility 并输出包含 class 名与来源文件的警告，避免 HBuilderX 因非法 CSS 直接报错。

- 🐛 **移除 Tailwind CSS v4 `bg-linear-to-*` 生成的 lab 渐变 `@supports` 检测块，避免小程序端保留无效的 `linear-gradient(in lab, red, red)` 兼容分支。** [`dc9791c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/dc9791cdebf812dba00877e5430606e275f7221f) by @sonofmagic
  - 保留基础 `--tw-gradient-position` 与 `background-image: linear-gradient(var(--tw-gradient-stops))` 产物，并补充 `bg-linear-to-r` 单测与 Taro Vite v4 端到端回归。

- 🐛 **将 `unitsToPx` 转换链路切换为基于 `postcss-rule-unit-converter` 的规则转换实现，移除对 `postcss-units-to-px` 的直接运行时依赖。** [`8d4131f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8d4131fc0832f9db9c631a1c7f2964094a77b8a6) by @sonofmagic
  - 保留 `unitMap`、`transform`、`transform: false`、`propList`、`selectorBlackList` 等兼容配置行为，并补充对应回归测试，确保多单位转 `px` 的默认输出不变。

- 🐛 **在 Tailwind CSS v4 场景下默认启用内置 autoprefixer 后处理，为小程序 CSS 补齐 `-webkit-background-clip: text` 等 WebView 兼容前缀，并新增 `autoprefixer: false` 配置用于显式关闭。** [`501a5c2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/501a5c250f5d96edb5dae72f082e745ec0dbe486) by @sonofmagic

## 2.2.0-alpha.1

### Patch Changes

- 🐛 **将 `unitsToPx` 转换链路切换为基于 `postcss-rule-unit-converter` 的规则转换实现，移除对 `postcss-units-to-px` 的直接运行时依赖。** [`8d4131f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8d4131fc0832f9db9c631a1c7f2964094a77b8a6) by @sonofmagic
  - 保留 `unitMap`、`transform`、`transform: false`、`propList`、`selectorBlackList` 等兼容配置行为，并补充对应回归测试，确保多单位转 `px` 的默认输出不变。

## 2.2.0-next.0

### Minor Changes

- ✨ **新增 CSS 处理结果 LRU 缓存，对相同内容和配置的 CSS 直接返回缓存结果，跳过 PostCSS 处理流程。** [`e6d7e8c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e6d7e8c123545d279b434b0c237ea59a3f62a6fe) by @sonofmagic
  - 在 `createStyleHandler` 内部新增基于 LRU 的结果缓存（最大 256 条目），缓存键由选项指纹 + 内容探测信号 + 内容哈希组成。
  - 使用 FNV-1a 哈希算法计算内容哈希，开销极低（不依赖 crypto 模块）。
  - HMR 场景下相同 CSS 文件的重复处理直接命中缓存，端到端处理速度提升 18~55 倍。

- ✨ **新增 PostCSS 流水线按需裁剪能力，通过轻量级 CSS 内容探测自动跳过不必要的插件。** [`9a4a836`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9a4a836aa97c87b67cbb88bcd40b83f0bf1d52d6) by @sonofmagic
  - 新增 `content-probe` 模块，使用正则/字符串匹配快速探测 CSS 内容特征（现代颜色函数、preset-env 特征等）。
  - `createStylePipeline` 支持可选的 `FeatureSignal` 参数，根据信号按需跳过 `postcss-preset-env` 和 `color-functional-fallback` 插件。
  - `StyleProcessorCache` 将特征信号纳入缓存键计算，确保不同内容特征组合使用正确的处理器。
  - `createStyleHandler` 自动执行内容探测并传递信号，对外 API 签名不变，零配置即可获得优化。
  - 探测策略采用宽松匹配：宁可误报（多加载插件），不可漏报（遗漏需要的插件），确保处理结果等价。

### Patch Changes

- 🐛 **修复 `uni-app x` 的 `uvue/nvue` 样式目标会输出宿主不支持 CSS 的问题。** [`a835a94`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a835a94ae0780610dcb4da8439cdb8f5a44bb36c) by @sonofmagic
  - 在 `uvue` 目标下过滤非 class selector，避免继续输出 `space-x-*`、`space-y-*` 这类组合器选择器。
  - 在 `uvue` 目标下过滤不兼容声明，例如 `display: block`、`display: inline-flex`、`display: grid`、`grid-template-columns`、`gap`、`min-height: 100vh`。
  - 新增 `uniAppX.uvueUnsupported` 配置，支持 `error | warn | silent`，默认 `warn`。
  - 当策略为 `warn` 时，跳过不兼容 utility 并输出包含 class 名与来源文件的警告，避免 HBuilderX 因非法 CSS 直接报错。

- 🐛 **在 Tailwind CSS v4 场景下默认启用内置 autoprefixer 后处理，为小程序 CSS 补齐 `-webkit-background-clip: text` 等 WebView 兼容前缀，并新增 `autoprefixer: false` 配置用于显式关闭。** [`501a5c2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/501a5c250f5d96edb5dae72f082e745ec0dbe486) by @sonofmagic

## 2.1.7

### Patch Changes

- 🐛 **修复 taro weapp 场景下 `app-origin.wxss` 仍可能残留 `:not(#n)` 占位选择器的问题，并补充 `#834` 的回归测试，确保最终输出不再包含 `@layer`、`:not(#\\#)` 与 `:not(#n)`。** [`7942ef4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7942ef486a1990e113c0e54a665ceb278cfb7bce) by @sonofmagic

- 🐛 **修复 Taro Vite Tailwind CSS v4 构建时最终样式产物仍残留 `:not(#\#)` / `:not(#n)` 的问题。** [`f972c34`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f972c34fd64954ef15992d0a3d203300f1ccb2ed) by @sonofmagic
  - 同时为 Taro demo 的构建守卫增加对 `@tarojs/plugin-doctor` 原生检查的安全绕过，避免当前环境下其 Rust 模块 panic 导致 demo 无法完成真实构建验证。

## 2.1.6

### Patch Changes

- 🐛 **修复 Vite 集成在 dts 构建阶段替换 postcss 插件时触发的类型递归比较问题，避免 TS2321 与 TS2345 导致构建失败。** [`c8860fa`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c8860fa202e202833f2c503fd7ea53af824a76fe) by @sonofmagic
  - 同时升级部分依赖与工作区 catalog 版本（包括 postcss、fs-extra、storybook 等），并同步更新锁文件以保持依赖解析一致性。

- 🐛 **修复 `uni-app x / uvue` 下 `@tailwind base` 的伪元素选择器兼容问题：** [`577f2b7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/577f2b7a4ab20f9d819e5a8826a535a4895cf712) by @sonofmagic
  - 在 `uni-app x` 模式下移除 `::before`、`::after`、`:before`、`:after`、`::backdrop` 等 `uvue` 不支持的选择器，避免 `App.uvue` 保留 `@tailwind base` 时编译报错
  - 保留 `*` 上的 Tailwind CSS 变量初始化与有效基础规则，确保基础 reset 与 utility 依赖的 CSS 变量不回退
  - 补充 `uni-app x + @tailwind base + styleIsolationVersion=2` 的 regression test，并验证 issue #822 相关组件局部样式能力不回退

- 🐛 **修复 `uni-app x / uvue` 下 `@tailwind base` 的默认兼容行为，并同步稳定相关测试：** [`699dfe2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/699dfe21ddbb41dcb8f5e401800767a2098c3707) by @sonofmagic
  - 将 `uni-app x` 的 base 兼容后处理收敛到 `@weapp-tailwindcss/postcss`，不再由 `weapp-tailwindcss` 额外持有私有样式后处理
  - 在 `uni-app x` 模式下移除对 `view`、`text`、`*`、`::before`、`::after`、`:before`、`:after`、`::backdrop` 等全局 carrier selector 的依赖
  - 将 utility 运行所需的 `--tw-*` 默认变量按需下沉到具体 class selector，保证保留 `@tailwind base` 时仍可正常编译和运行
  - 更新 `uni-app x`、bundler、tailwindcss 全量大用例的回归断言与超时设置，避免在完整测试中因旧预期或默认超时导致误报失败

- 🐛 **性能优化：针对 CSS 选择器转换、JS 处理器、WXML 模板处理等热路径进行多项缓存与计算优化。** [`49e50d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/49e50d8bde7327d47e9ba649537092ea57bcdf16) by @sonofmagic
  - JS 处理器：复用 `resolveClassNameTransformWithResult` 返回的 `escapedValue` 避免重复 escape 计算；引入 `getReplacement` 缓存消除重复 `replaceWxml` 调用；移除 `escapeStringRegexp` + `new RegExp` 正则编译开销
  - `createJsHandler`：预构建默认 `defaults` 对象，无覆盖选项时跳过 `defuOverrideArray` 合并
  - WXML 模板：`templateReplacer` 支持复用模块级 tokenizer 实例；`createTemplateHandler` 预构建 attribute matcher 并传递给 `customTemplateHandler`
  - PostCSS fallback 选择器解析：为 `transform` 函数添加 selector 级别缓存，避免重复解析相同选择器
  - `splitCode`：为默认和 allowDoubleQuotes 两种模式分别添加结果缓存，预编译分割正则

- 🐛 **升级 `tailwindcss-patch` 到 `9` 系列最新版本，并同步更新相关依赖。** [`38c11e7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/38c11e78a0c1f31d7635a98c95fbfe624723c4c3) by @sonofmagic
- 📦 **Dependencies** [`49e50d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/49e50d8bde7327d47e9ba649537092ea57bcdf16)
  → `@weapp-tailwindcss/shared@1.1.3`

## 2.1.6-alpha.3

### Patch Changes

- 🐛 **修复 `uni-app x / uvue` 下 `@tailwind base` 的默认兼容行为，并同步稳定相关测试：** [`699dfe2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/699dfe21ddbb41dcb8f5e401800767a2098c3707) by @sonofmagic
  - 将 `uni-app x` 的 base 兼容后处理收敛到 `@weapp-tailwindcss/postcss`，不再由 `weapp-tailwindcss` 额外持有私有样式后处理
  - 在 `uni-app x` 模式下移除对 `view`、`text`、`*`、`::before`、`::after`、`:before`、`:after`、`::backdrop` 等全局 carrier selector 的依赖
  - 将 utility 运行所需的 `--tw-*` 默认变量按需下沉到具体 class selector，保证保留 `@tailwind base` 时仍可正常编译和运行
  - 更新 `uni-app x`、bundler、tailwindcss 全量大用例的回归断言与超时设置，避免在完整测试中因旧预期或默认超时导致误报失败

## 2.1.6-alpha.2

### Patch Changes

- 🐛 **修复 `uni-app x / uvue` 下 `@tailwind base` 的伪元素选择器兼容问题：** [`577f2b7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/577f2b7a4ab20f9d819e5a8826a535a4895cf712) by @sonofmagic
  - 在 `uni-app x` 模式下移除 `::before`、`::after`、`:before`、`:after`、`::backdrop` 等 `uvue` 不支持的选择器，避免 `App.uvue` 保留 `@tailwind base` 时编译报错
  - 保留 `*` 上的 Tailwind CSS 变量初始化与有效基础规则，确保基础 reset 与 utility 依赖的 CSS 变量不回退
  - 补充 `uni-app x + @tailwind base + styleIsolationVersion=2` 的 regression test，并验证 issue #822 相关组件局部样式能力不回退

## 2.1.6-alpha.1

### Patch Changes

- 🐛 **升级 `tailwindcss-patch` 到 `8.7.4-alpha.0`，同步消费最新的 alpha 版本依赖。** [#819](https://github.com/sonofmagic/weapp-tailwindcss/pull/819) by @sonofmagic
- 📦 **Dependencies** [`cbead4c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/cbead4ced4b7cba116488d745d47bf826bc83859)
  → `@weapp-tailwindcss/shared@1.1.3-alpha.1`

## 2.1.6-alpha.0

### Patch Changes

- 🐛 **修复 Vite 集成在 dts 构建阶段替换 postcss 插件时触发的类型递归比较问题，避免 TS2321 与 TS2345 导致构建失败。** [`c8860fa`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c8860fa202e202833f2c503fd7ea53af824a76fe) by @sonofmagic
  - 同时升级部分依赖与工作区 catalog 版本（包括 postcss、fs-extra、storybook 等），并同步更新锁文件以保持依赖解析一致性。

- 🐛 **性能优化：针对 CSS 选择器转换、JS 处理器、WXML 模板处理等热路径进行多项缓存与计算优化。** [`49e50d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/49e50d8bde7327d47e9ba649537092ea57bcdf16) by @sonofmagic
  - JS 处理器：复用 `resolveClassNameTransformWithResult` 返回的 `escapedValue` 避免重复 escape 计算；引入 `getReplacement` 缓存消除重复 `replaceWxml` 调用；移除 `escapeStringRegexp` + `new RegExp` 正则编译开销
  - `createJsHandler`：预构建默认 `defaults` 对象，无覆盖选项时跳过 `defuOverrideArray` 合并
  - WXML 模板：`templateReplacer` 支持复用模块级 tokenizer 实例；`createTemplateHandler` 预构建 attribute matcher 并传递给 `customTemplateHandler`
  - PostCSS fallback 选择器解析：为 `transform` 函数添加 selector 级别缓存，避免重复解析相同选择器
  - `splitCode`：为默认和 allowDoubleQuotes 两种模式分别添加结果缓存，预编译分割正则
- 📦 **Dependencies** [`49e50d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/49e50d8bde7327d47e9ba649537092ea57bcdf16)
  → `@weapp-tailwindcss/shared@1.1.3-alpha.0`

## 2.1.5

### Patch Changes

- 🐛 **提升热更新链路的稳定性与性能，并补齐真实 watch 回归保障：** [`7824e01`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7824e010f8f7e4a7a9ae6eedd707ff4a329d991b) by @sonofmagic
  - 优化运行时类名转译策略，修复 stale runtimeSet 场景下新增任意值类与小数类（如 `text-[23.43px]`、`space-y-2.5`）在 JS/WXML/Vue 中的漏转译问题。
  - 提炼并复用类名候选判定逻辑，减少重复实现，降低后续维护成本。
  - 增强 demo 级 watch 回归脚本（taro + uni-app），覆盖新增类热更新、输出变更检测与恢复校验。
  - 为 watch 回归增加本地构建预热与日志降噪能力（可选 `--quiet-sass`），减少无效噪音并提升排查效率。
  - 优化相关缓存与增量处理路径，缩短常见热更新阶段插件处理耗时。

- 🐛 **修复 Tailwind v4 `space-x-*` 在小程序端生成不兼容方向伪类导致的构建产物报错问题：** [`515aa47`](https://github.com/sonofmagic/weapp-tailwindcss/commit/515aa473159218d67ba8bc461ae7c95d573d3f80) by @sonofmagic
  - 在选择器转换阶段清理 `:-webkit-any(...)`、`:-moz-any(...)`、`:lang(...)` 相关分支，避免输出微信开发者工具不支持的选择器。
  - 对 `:not(...)` 包裹的方向条件保留主体选择器并移除条件；对纯方向分支选择器直接移除，避免产生无效 CSS。
  - 补充 `selectorParser` 回归测试，覆盖上述 RTL/language 伪类清理逻辑。

## 2.1.5-beta.0

### Patch Changes

- 🐛 **提升热更新链路的稳定性与性能，并补齐真实 watch 回归保障：** [`7824e01`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7824e010f8f7e4a7a9ae6eedd707ff4a329d991b) by @sonofmagic
  - 优化运行时类名转译策略，修复 stale runtimeSet 场景下新增任意值类与小数类（如 `text-[23.43px]`、`space-y-2.5`）在 JS/WXML/Vue 中的漏转译问题。
  - 提炼并复用类名候选判定逻辑，减少重复实现，降低后续维护成本。
  - 增强 demo 级 watch 回归脚本（taro + uni-app），覆盖新增类热更新、输出变更检测与恢复校验。
  - 为 watch 回归增加本地构建预热与日志降噪能力（可选 `--quiet-sass`），减少无效噪音并提升排查效率。
  - 优化相关缓存与增量处理路径，缩短常见热更新阶段插件处理耗时。

- 🐛 **修复 Tailwind v4 `space-x-*` 在小程序端生成不兼容方向伪类导致的构建产物报错问题：** [`515aa47`](https://github.com/sonofmagic/weapp-tailwindcss/commit/515aa473159218d67ba8bc461ae7c95d573d3f80) by @sonofmagic
  - 在选择器转换阶段清理 `:-webkit-any(...)`、`:-moz-any(...)`、`:lang(...)` 相关分支，避免输出微信开发者工具不支持的选择器。
  - 对 `:not(...)` 包裹的方向条件保留主体选择器并移除条件；对纯方向分支选择器直接移除，避免产生无效 CSS。
  - 补充 `selectorParser` 回归测试，覆盖上述 RTL/language 伪类清理逻辑。

## 2.1.4

### Patch Changes

- 🐛 **新增 unitsToPx 配置，支持将多种长度单位转换为 px，并在 uni-app-x 预设中透出该选项。** [`d20c0b7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d20c0b7db503c0b8e022101908ff520dc00ed2df) by @sonofmagic

## 2.1.4-alpha.0

### Patch Changes

- 🐛 **新增 unitsToPx 配置，支持将多种长度单位转换为 px，并在 uni-app-x 预设中透出该选项。** [`d20c0b7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d20c0b7db503c0b8e022101908ff520dc00ed2df) by @sonofmagic

## 2.1.3

### Patch Changes

- 🐛 **chore: 升级到 "@weapp-core/escape": "~7.0.0"** [`4bbda03`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4bbda03bc7f924bc7ef75291d27316309c827c58) by @sonofmagic

## 2.1.2

### Patch Changes

- 🐛 **chore: 降级 postcss-preset-env** [`becab46`](https://github.com/sonofmagic/weapp-tailwindcss/commit/becab46e7df4864feba2e708f67a3e3a08e341e0) by @sonofmagic

## 2.1.1

### Patch Changes

- 🐛 **修复 `cssCalc` 预计算时可能输出重复声明的问题，新增仅在启用 `cssCalc` 时生效的去重清理。** [`366027a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/366027a3a9831cbdcb609297c75596ade0f42ad5) by @sonofmagic
- 📦 **Dependencies** [`ccc0a33`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ccc0a330b5cd455665a0f2f2c3e8895b27a04b52)
  → `@weapp-tailwindcss/shared@1.1.2`

## 2.1.0

### Minor Changes

- [`19e9417`](https://github.com/sonofmagic/weapp-tailwindcss/commit/19e94172cd2b79b28b863a15e477136f269bbc3b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - - postcss 包的 px2rpx 链路全面切换为 postcss-pxtrans，移除对 postcss-pxtransform 的依赖
  - 升级 postcss-rem-to-responsive-pixel 到 7.0.0 版本

## 2.0.8

### Patch Changes

- [`07a0d5b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/07a0d5b8b27ebd52b4f9363f004f80d17c3d1f2e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 为 postcss 模块补充中文覆盖率用例，覆盖 html 转换、mp 预处理、兼容性工具与选择器解析的边界路径，确保源码分支全部被校验。

- [`8bd4842`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8bd4842871a96dadb2b85139ffded7f61c99ca01) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 优化样式处理器缓存：以 WeakMap 和引用缓存替换字符串指纹查找，减少 options 合并和管线复用的热路径开销，并复用选择器解析配置以降低分配。基准显示 v3/v4 主块和 rpx 处理吞吐均有明显提升。

- [`74ed4a3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/74ed4a324e528d67d5f4fc22d4cf704b0c246cb8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 tailwindcss v2/v3/v4 中任意 rpx 值被误判为颜色的问题，确保 text/border/bg/outline/ring 输出正确的尺寸样式；补充 Vitest bench 覆盖典型转换场景以跟踪性能。

## 2.0.7

### Patch Changes

- [`3ed3aa8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3ed3aa817a68dae544baf434316399cc78c15b99) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: upgrade "@weapp-core/escape": "~6.0.1"

## 2.0.6

### Patch Changes

- [`ce046d2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ce046d24bb1c843eb4682667f5b2584c3b49bdb5) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: upgrade postcss-preset-env to 10.5.0

## 2.0.5

### Patch Changes

- [`c39cbfb`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c39cbfb1980befdaf3df250b2966794ddec01d1e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 抽取 tailwindcss v4 与 uni-app x 的特定兼容逻辑到独立 compat 模块，精简插件主体代码并方便后续维护。

## 2.0.4

### Patch Changes

- Updated dependencies [[`1788e26`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1788e26153bafc865776d5a761c2e28dafff6918)]:
  - @weapp-tailwindcss/shared@1.1.1

## 2.0.3

### Patch Changes

- [`abcb4b5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/abcb4b5db5bf42b0363b6b318570cffe2991eb72) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix(postcss): 针对 rounded-full 等圆角类在部分构建链路下被计算成超大值（如 `3.40282e38px`）的问题，统一在后处理阶段将 `border-*-radius` 的不合理巨大像素值（含 `calc(infinity * 1px|rpx)` 与科学计数法）钳制为 `9999px`，以符合小程序规范。该修复覆盖 Tailwind v4 与 taro pxtransform 组合下的异常场景。

  https://github.com/sonofmagic/weapp-tailwindcss/issues/698

## 2.0.2

### Patch Changes

- [`aaff7b8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/aaff7b819b6aed74c473d677aeefcedd0fbd81be) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 默认启用 `color-functional-notation`，自动将 `rgb(... / ...)` 语法转换成兼容性更好的 `rgba(...)`。

- [`ad1ee06`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ad1ee0642dd3bd22fffb2bc448b8850341729443) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 tailwindcss v3 `border-blue-600/10` 这类 rgb 斜杠透明度语法仍输出为 `rgb()`，导致安卓无法解析的问题，强制降级为传统 `rgba()`。

## 2.0.1

### Patch Changes

- [`a35766d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a35766dec66b8d078c5795cfcc262e5a9b21e4f2) Thanks [@sonofmagic](https://github.com/sonofmagic)! - - 彻底移除 `jsAstTool` 相关配置、类型与测试，正式结束对 `ast-grep` 解析器的兼容。
  - 移除 `customRuleCallback` 配置与对应类型、默认值和测试，内置 PostCSS 处理逻辑不再暴露该扩展点。

## 2.0.0

### Major Changes

- [`dea2ecb`](https://github.com/sonofmagic/weapp-tailwindcss/commit/dea2ecba1a7232d10b60701664424dbde8a58141) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 优化处理流程, 重构 @weapp-tailwindcss/postcss

## 1.3.4

### Patch Changes

- [`cb7d4ed`](https://github.com/sonofmagic/weapp-tailwindcss/commit/cb7d4ed16826159bfaabbad1ae7571d94e9d5257) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 1.3.3

### Patch Changes

- Updated dependencies [[`9291bad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9291bad1821c72f05e64b010ea3da94293a34d42)]:
  - @weapp-tailwindcss/shared@1.1.0

## 1.3.3-alpha.0

### Patch Changes

- Updated dependencies [[`9291bad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9291bad1821c72f05e64b010ea3da94293a34d42)]:
  - @weapp-tailwindcss/shared@1.1.0-alpha.0

## 1.3.2

### Patch Changes

- [`b766f00`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b766f007d65d3383530452c1860907fa3dcfb00e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 通过缓存选择器解析器实例并复用兜底清理流程，优化 PostCSS 管线的运行性能。

## 1.3.2-alpha.0

### Patch Changes

- [`b766f00`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b766f007d65d3383530452c1860907fa3dcfb00e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 通过缓存选择器解析器实例并复用兜底清理流程，优化 PostCSS 管线的运行性能。

## 1.3.1

### Patch Changes

- [`d028fb3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d028fb33297cfac6f2f9c233510f84c7850a8ae9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: 优化 CSS 变量计算模式下的正则精确匹配

## 1.3.0

### Minor Changes

- [`4ffb90b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4ffb90bc754459d93929d2de3a843d46edc48f53) Thanks [@sonofmagic](https://github.com/sonofmagic)! - <br/>

  ## Features

  feat(postcss): 添加 `postcss-value-parser` 作为依赖，添加新的 `postcss` 插件 `postcss-remove-include-custom-properties`

  feat(weapp-tailwindcss): 计算模式增强，允许只限定某些特殊的 `custom-properties` 被计算，这样只在遇到不兼容的情况下，才需要开启这个配置

  比如 cssCalc: 设置为 `['--spacing']`, 那么就会把 `tailwindcss` 中的 `--spacing` 值进行计算，其他值则不进行计算

  ## Chore

  chore(deps): upgrade

## 1.2.2

### Patch Changes

- [`d9db976`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d9db9766f428147b01ba4e381549c54083f4fd5a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: 在 cssCalc 计算模式下，默认不打开 custom-properties 功能

  > 此功能需要添加筛选 -- 项来精确赋予

## 1.2.1

### Patch Changes

- [`0d76388`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0d763881fad85d20a926db89bc29ec9113cfc0b3) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat(postcss): deps remove @csstools/postcss-is-pseudo-class

## 1.2.1-alpha.0

### Patch Changes

- [`0d76388`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0d763881fad85d20a926db89bc29ec9113cfc0b3) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat(postcss): deps remove @csstools/postcss-is-pseudo-class

## 1.2.0

### Minor Changes

- [`ce1150c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ce1150cd87f22736e59f17e5d8a7b61a1354d4cd) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 添加 postcss calc 和 pxtransform 支持

### Patch Changes

- [`59bdd20`](https://github.com/sonofmagic/weapp-tailwindcss/commit/59bdd205dcfc2d30a097c63d9451d08a3cfb1e73) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 默认开启 cssRemoveProperty, 因为 `@property` 会导致支付宝小程序直接挂掉

## 1.1.1

### Patch Changes

- [`7a33c9a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7a33c9afc8dfe1c32c76d0598e30753970a57146) Thanks [@sonofmagic](https://github.com/sonofmagic)! - ## Fix

  fix: 使用 rounded-full 单位时出现 infinity 问题，只在 taro 默认转化 rpx 情况下出现

  https://github.com/sonofmagic/weapp-tailwindcss/issues/695

  参考链接:

  https://github.com/tailwindlabs/tailwindcss/blob/77b3cb5318840925d8a75a11cc90552a93507ddc/packages/tailwindcss/src/utilities.ts#L2128

## 1.1.0

### Minor Changes

- [`a5d198f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a5d198ff0e8af52f218df98f3ce76a5dbfd8c691) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 支持 uni-app x 暗黑模式

### Patch Changes

- [`7419618`](https://github.com/sonofmagic/weapp-tailwindcss/commit/741961839510edafc39f2cebf91b8e8dc1cd8bd3) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 对 postcss-html-transform 进行二次封装

## 1.1.0-alpha.1

### Minor Changes

- [`a5d198f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a5d198ff0e8af52f218df98f3ce76a5dbfd8c691) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 支持 uni-app x 暗黑模式

## 1.0.22-alpha.0

### Patch Changes

- [`7419618`](https://github.com/sonofmagic/weapp-tailwindcss/commit/741961839510edafc39f2cebf91b8e8dc1cd8bd3) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 对 postcss-html-transform 进行二次封装

## 1.0.21

### Patch Changes

- [`c7892d6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c7892d699d798abe27c63d1345423a5ac147cc76) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 优化 css 生成

## 1.0.20

### Patch Changes

- [`6cae2c1`](https://github.com/sonofmagic/weapp-tailwindcss/commit/6cae2c1471bfb7fdc182815ba95b566ad6f51dfa) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 优化 uni-app x 场景下的样式生成

## 1.0.19

### Patch Changes

- [`8e4f8ad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8e4f8ad3a5e7e5ba4fa4b0ef7d365e412d1d881e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: css sourcemap

## 1.0.19-alpha.0

### Patch Changes

- [`8e4f8ad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8e4f8ad3a5e7e5ba4fa4b0ef7d365e412d1d881e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: css sourcemap

## 1.0.18

### Patch Changes

- [`7927bf2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7927bf25cfac2f8df90e91eaa2379ba45079499b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: css always generate map for uni-app x

## 1.0.18-alpha.0

### Patch Changes

- [`7927bf2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7927bf25cfac2f8df90e91eaa2379ba45079499b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: css always generate map for uni-app x

## 1.0.17

### Patch Changes

- [`47f4813`](https://github.com/sonofmagic/weapp-tailwindcss/commit/47f4813c7f901e35d844f1935e14de89eeeb32a1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

- Updated dependencies [[`47f4813`](https://github.com/sonofmagic/weapp-tailwindcss/commit/47f4813c7f901e35d844f1935e14de89eeeb32a1)]:
  - @weapp-tailwindcss/shared@1.0.3

## 1.0.17-alpha.0

### Patch Changes

- [`47f4813`](https://github.com/sonofmagic/weapp-tailwindcss/commit/47f4813c7f901e35d844f1935e14de89eeeb32a1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

- Updated dependencies [[`47f4813`](https://github.com/sonofmagic/weapp-tailwindcss/commit/47f4813c7f901e35d844f1935e14de89eeeb32a1)]:
  - @weapp-tailwindcss/shared@1.0.3-alpha.0

## 1.0.16

### Patch Changes

- [`f2c69d5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f2c69d5bd8e1dc3d39eced8ff62b75e0c4ef3591) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: 修复 `tailwindcss@4` 中，在和 `taro` 一起使用时，`space-x-<number>` 类名生成 `css` 不正确的问题

## 1.0.15

### Patch Changes

- [`2b0a754`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2b0a75493506d219d1b49474f3ce684d107fcbd1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: [#655](https://github.com/sonofmagic/weapp-tailwindcss/issues/655) 默认自动去除 `@layer` 在 `postcss-env-preset` 处理之前

## 1.0.14

### Patch Changes

- [`bf7e53c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bf7e53cfcd69c49c5cd99f7bf21ad0999a31b1d6) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: 优化 tailwindcss@4.1.10 的生成样式规则

## 1.0.13

### Patch Changes

- [`32f3b12`](https://github.com/sonofmagic/weapp-tailwindcss/commit/32f3b12eac220094e8cdcc5eba2a7dc0469a3e22) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: add postcss-html-transform plugin

- [`ddae06d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ddae06d0c3004234526c2b98f092d76f76c829df) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: injectAdditionalCssVarScope for tailwindcss@4

## 1.0.13-beta.1

### Patch Changes

- [`32f3b12`](https://github.com/sonofmagic/weapp-tailwindcss/commit/32f3b12eac220094e8cdcc5eba2a7dc0469a3e22) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: add postcss-html-transform plugin

## 1.0.13-beta.0

### Patch Changes

- [`ddae06d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ddae06d0c3004234526c2b98f092d76f76c829df) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: injectAdditionalCssVarScope for tailwindcss@4

## 1.0.12

### Patch Changes

- [`5d27de5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5d27de5a509da6984e77036da8a176e0570ba5c1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: 检测生成空的 atRule 节点时，移除空节点

## 1.0.11

### Patch Changes

- [`3cecfdc`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3cecfdccfcdfacd262fee571b0209e095b33838e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 移除带有 `@supports` `color-mix` 的 css 节点, 修复
  - [#632](https://github.com/sonofmagic/weapp-tailwindcss/issues/632)
  - [#631](https://github.com/sonofmagic/weapp-tailwindcss/issues/631)

  > 但是这种行为会导致使用透明度 + css 变量的时候，被回滚到固定的颜色值，因为微信小程序不支持 `color-mix`，同时 `tailwindcss` 依赖 `color-mix` + `css var` 来进行颜色变量的计算。

## 1.0.10

### Patch Changes

- [`8b45542`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8b4554295e9671fd740fa18a9f9a25a17613597b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: tailwindcss v4.1.2 vite plugin

- [`1140b23`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1140b23dd3475b5654576ff262b6f9b7de23b60d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: support `tailwindcss@4.1.2`

- [`0d6564a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0d6564aaaea588289dac5b1b784b1902105b297a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: 优化 isTailwindcssV4ModernCheck 判断

- [`23c08c7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/23c08c7d7ad276035ffa3ef78d0fb00e1c717ddf) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: isTailwindcssV4ModernCheck

## 1.0.10-alpha.3

### Patch Changes

- [`8b45542`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8b4554295e9671fd740fa18a9f9a25a17613597b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: tailwindcss v4.1.2 vite plugin

## 1.0.10-alpha.2

### Patch Changes

- [`1140b23`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1140b23dd3475b5654576ff262b6f9b7de23b60d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: support `tailwindcss@4.1.2`

## 1.0.10-alpha.1

### Patch Changes

- [`23c08c7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/23c08c7d7ad276035ffa3ef78d0fb00e1c717ddf) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: isTailwindcssV4ModernCheck

## 1.0.10-alpha.0

### Patch Changes

- [`0d6564a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0d6564aaaea588289dac5b1b784b1902105b297a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: 优化 isTailwindcssV4ModernCheck 判断

## 1.0.9

### Patch Changes

- [`3113053`](https://github.com/sonofmagic/weapp-tailwindcss/commit/31130538a13098e2a1d29bbd331dc67a195689cf) Thanks [@sonofmagic](https://github.com/sonofmagic)! - Fix: Support `Tailwindcss@4.1.1` and fix [#619](https://github.com/sonofmagic/weapp-tailwindcss/issues/619)

## 1.0.8

### Patch Changes

- [`e8c4534`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e8c4534ab588eae1115dac15b529b7a122141316) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 添加 `cssRemoveProperty` 选项，默认值为 `true`，这是为了在 `tailwindcss` 中移除这种 css 节点:

  ```css
  @property --tw-content {
    syntax: '*';
    initial-value: '';
    inherits: false;
  }
  ```

  这种样式在小程序中，没有任何的意义。

## 1.0.7

### Patch Changes

- [`e0c37f5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e0c37f5f546b143341a75701a1907f876df38fa9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

- Updated dependencies [[`e0c37f5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e0c37f5f546b143341a75701a1907f876df38fa9)]:
  - @weapp-tailwindcss/shared@1.0.2

## 1.0.7-alpha.0

### Patch Changes

- [`e0c37f5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e0c37f5f546b143341a75701a1907f876df38fa9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

- Updated dependencies [[`e0c37f5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e0c37f5f546b143341a75701a1907f876df38fa9)]:
  - @weapp-tailwindcss/shared@1.0.2-alpha.0

## 1.0.6

### Patch Changes

- [`ff9933a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ff9933ad06de7bf3333c1c63016920639a56b87a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: tailwindcss@4 space-x-_ and space-y-_

## 1.0.5

### Patch Changes

- [`a4532ab`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a4532ab34de62556e57ed350e15ca14e602b7f93) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: 使用space-y-2后编译报错 #595

## 1.0.4

### Patch Changes

- [`9e65534`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9e65534f035ee4e17a2dc0b891278cacb92d5a0b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: @layer as :not(#n) and @weapp-tailwindcss/merge switcher

## 1.0.3

### Patch Changes

- Updated dependencies [[`bdbca26`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bdbca268738ef033a5789e8a6713608c4d599b61)]:
  - @weapp-tailwindcss/shared@1.0.1

## 1.0.3-alpha.0

### Patch Changes

- Updated dependencies [[`bdbca26`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bdbca268738ef033a5789e8a6713608c4d599b61)]:
  - @weapp-tailwindcss/shared@1.0.1-alpha.0

## 1.0.2

### Patch Changes

- [`64c0189`](https://github.com/sonofmagic/weapp-tailwindcss/commit/64c018935732481ebe2f366e4136b4d3574dde57) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: improve `isAllowedClassName` preflight

## 1.0.1

### Patch Changes

- [`ee34fb3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ee34fb34688a2bd11018ce5e4ea6d07a062b0b55) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: bg-gradient --tw-gradient-position in oklab

## 1.0.0

### Major Changes

- [`bafd149`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bafd149f0510b30cbf95711223583055023e7875) Thanks [@sonofmagic](https://github.com/sonofmagic)! - ## Feature

  增加 `@weapp-tailwindcss/merge` 支持，这是 `weapp-tailwindcss` 版本的 `tailwindcss-merge` 和 `cva` 方法

  ## Breaking Changes
  1. 去除 `weapp-tailwindcss/postcss` (可直接安装使用 `@weapp-tailwindcss/postcss`)
  2. 增加 `weapp-tailwindcss/escape` 来取代 `weapp-tailwindcss/replace`
  3. 项目 monorepo 区分包

### Patch Changes

- [`d4bfcc7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d4bfcc7a25776eb9869bd934c05e3b49a3f4cc8b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: remove attribute in :where pseudo

- [`2c51531`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2c515310f1fdfd15d11e2e35213c7e6bfcb55c3d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

- [`d7fa028`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d7fa02877ce74792687765766ff94ae3e30edf3b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: rename export function

- [`1d689ef`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1d689efca6cf0de7e476b03b2be8d09284beae68) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: change postcssPresetEnv default value

- [`1df699b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1df699bf82d66847cbc64cc8f294ef237e0470c5) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: fix types import intel

- [`6d20f1f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/6d20f1f9a799cf350dcbbd861907f0ff70a68dfd) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: perfer postcss-preset-env instead of @csstools

- [`e745ba5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e745ba5cd9e232c0b5b7053538beb0772240eab8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

- Updated dependencies [[`bafd149`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bafd149f0510b30cbf95711223583055023e7875), [`2c51531`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2c515310f1fdfd15d11e2e35213c7e6bfcb55c3d), [`d7fa028`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d7fa02877ce74792687765766ff94ae3e30edf3b), [`d50d95d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d50d95d04e1c6b7c3ff32acc0d9894d3c0f06d22), [`e745ba5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e745ba5cd9e232c0b5b7053538beb0772240eab8)]:
  - @weapp-tailwindcss/shared@1.0.0

## 1.0.0-alpha.8

### Patch Changes

- [`1d689ef`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1d689efca6cf0de7e476b03b2be8d09284beae68) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: change postcssPresetEnv default value

## 1.0.0-alpha.7

### Patch Changes

- [`d4bfcc7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d4bfcc7a25776eb9869bd934c05e3b49a3f4cc8b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: remove attribute in :where pseudo

## 1.0.0-alpha.6

### Patch Changes

- [`e745ba5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e745ba5cd9e232c0b5b7053538beb0772240eab8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

- Updated dependencies [[`e745ba5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e745ba5cd9e232c0b5b7053538beb0772240eab8)]:
  - @weapp-tailwindcss/shared@1.0.0-alpha.4

## 1.0.0-alpha.5

### Patch Changes

- [`6d20f1f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/6d20f1f9a799cf350dcbbd861907f0ff70a68dfd) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: perfer postcss-preset-env instead of @csstools

## 1.0.0-alpha.4

### Patch Changes

- [`d7fa028`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d7fa02877ce74792687765766ff94ae3e30edf3b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: rename export function

- Updated dependencies [[`d7fa028`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d7fa02877ce74792687765766ff94ae3e30edf3b)]:
  - @weapp-tailwindcss/shared@1.0.0-alpha.3

## 1.0.0-alpha.3

### Patch Changes

- [`2c51531`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2c515310f1fdfd15d11e2e35213c7e6bfcb55c3d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

- Updated dependencies [[`2c51531`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2c515310f1fdfd15d11e2e35213c7e6bfcb55c3d)]:
  - @weapp-tailwindcss/shared@1.0.0-alpha.2

## 1.0.0-alpha.2

### Patch Changes

- [`1df699b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1df699bf82d66847cbc64cc8f294ef237e0470c5) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: fix types import intel

## 1.0.0-alpha.1

### Major Changes

- [`bafd149`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bafd149f0510b30cbf95711223583055023e7875) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: monorepo changes

### Patch Changes

- Updated dependencies [[`bafd149`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bafd149f0510b30cbf95711223583055023e7875)]:
  - @weapp-tailwindcss/shared@1.0.0-alpha.1

## 0.0.1-alpha.0

### Patch Changes

- Updated dependencies [[`d50d95d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d50d95d04e1c6b7c3ff32acc0d9894d3c0f06d22)]:
  - @weapp-tailwindcss/shared@0.0.1-alpha.0
