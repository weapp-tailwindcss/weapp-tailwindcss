# weapp-tailwindcss

## 5.6.0

### Minor Changes

- 提供 WXML tokenize、JavaScript 完整字面量转换的 Rust Node-API 实验内核，保留 JavaScript/Oxc/Babel 兼容路径与公开 TypeScript API。原生与回退路径共享 UTF-16 位置、精确类名命中和条件测试保护语义。JS/WXML 与 CSS 内核均默认关闭，须在进程启动前设置 `WEAPP_TW_NATIVE=auto` 或 `required` 显式启用；默认路径跳过高频原生加载检查。运行时签名仍沿用 Oxc，原生签名接口仅供 ABI 对照。

  WXML 静态属性值在原生实例内完成扫描、转义和组装；精确模式仅查询实际候选，避免复制完整类集合。动态表达式与自定义回调保留原执行顺序。

  修复快速路径的模板正文边界与显式 class 上下文语义，避免模板正文中的括号被错误覆盖。JavaScript 原生转换仅同步查询源码实际候选，消除完整集合扫描；集合原地修改立即生效，映射按实际内容重建实例，原生不支持的语义直接交给 Babel。

  修复回退结果缓存对可变类集合、映射、复用覆盖配置与有状态回调的生命周期判断，避免返回过期转换结果；自定义 Set、getter 与 Proxy 保留原有 Babel 执行语义。

  PostCSS 接入 Rust 选择器与声明值计算，合并 Tailwind v4 变量及渐变 fallback 解析，并批量处理 uvue translate 参数。保留 PostCSS AST 与用户插件契约，修复原生包加载顺序和自定义映射原地更新的缓存边界。

  复杂选择器通过 Rust AST 完成伪类展开、平台伪类移除与 spacing 选择器转换，只向 PostCSS 返回规则动作；未接管语法明确回退。专门的原生测试入口强制验证真实二进制，普通单测保持无 Rust 工具链可运行。

  圆角 clamp、渐变方向与 infinity/calc 的独立值计算迁入 Rust，并与变量回退合并为单次声明调用；保留声明顺序、父规则语义和原有数值行为。

### Patch Changes

- 修复 uni-app X H5 生产 CSS 在 reset 重排后沿用旧内容 hash 的问题：在 Vite 资源发射前完成重排，保持文件名和引用一致，并去除压缩后失去注释的重复 reset。Refs #1271

- 优化 Oxc JavaScript 快速路径的 class 上下文判断，在单次 AST 遍历中增量维护对象属性、JSX class 属性和类名 helper 参数的上下文，保持与 Babel 的父表达式语义一致并减少重复祖先链扫描。

  class 上下文统一依据解析后的 AST 判断，修复转义斜杠、转义或规范化属性名，以及带注释的 helper 调用被源码文本预筛遗漏的问题；Oxc 与可选 Rust 内核均保留精确类名集合匹配和普通业务路径保护。

- 修复 Oxc 快速路径对条件测试字符串的误转换，对齐 Babel 的父表达式与括号节点语义，并保留指令字符串；含 JSX 实体的属性回退 Babel 解码。

  Oxc 分析按源码大小与反序列化器初始化状态选择 raw transfer，避免中等 chunk 的首次加载开销；运行时签名使用普通 AST。不支持或失败时回退普通解析，保持模块图、source map 与 ignore 场景的 Babel 回退行为及公开 API 不变。

  关闭快速路径或启用模块图时省去不会被消费的类名预扫描，保留依赖分析与原有跳过规则。

- 限制源码候选扫描与 Engine 原始候选补扫、无方括号任意值补扫、位置报告的并发文件读取，避免多个构建入口同时扫描时耗尽文件描述符；保留全部候选、来源隔离和报告顺序。

  Webpack watch 扫描失败时等待在途操作结束，保留原始错误，并在整轮成功后一起发布候选快照和文件元数据，避免失败后的重试漏掉变更。

- 让 Webpack 同一编译轮次的 loader 共享运行时类集合准备结果，并在源码变化、刷新失败和新编译开始时正确失效。

- 避免 Webpack 无匹配产物的子编译重复收集类名，并保留父编译的刷新状态与缓存。

  Mpx 的 WXS 子编译在 CSS、模板和 JS matcher 均未命中时直接结束本轮转换准备；用户显式匹配 WXS、JS、模板或样式的子编译继续走现有转换链路。

- Updated dependencies:
  - @weapp-tailwindcss/engine@0.1.5
  - @weapp-tailwindcss/native-darwin-arm64@5.6.0
  - @weapp-tailwindcss/native-darwin-x64@5.6.0
  - @weapp-tailwindcss/native-linux-arm64-gnu@5.6.0
  - @weapp-tailwindcss/native-linux-arm64-musl@5.6.0
  - @weapp-tailwindcss/native-linux-x64-gnu@5.6.0
  - @weapp-tailwindcss/native-linux-x64-musl@5.6.0
  - @weapp-tailwindcss/native-win32-arm64-msvc@5.6.0
  - @weapp-tailwindcss/native-win32-x64-msvc@5.6.0
  - @weapp-tailwindcss/postcss@3.4.0

## 5.5.12

### Patch Changes

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

- 更新依赖。

  ### weapp-tailwindcss

  - 更新 dependencies 中的 `oxc-parser`：`catalog:compilerUtilities`，`范围 ^0.152.0`，`锁定 0.152.0` → `catalog:compilerUtilities`，`范围 ^0.153.0`，`锁定 0.153.0`。
  - 更新 dependencies 中的 `oxc-walker`：`catalog:compilerUtilities`，`范围 ^1.1.1`，`锁定 1.1.1(@oxc-project/types@0.149.0)(oxc-parser@0.152.0)(rolldown@1.2.12)` → `catalog:compilerUtilities`，`范围 ^1.1.1`，`锁定 1.1.1(@oxc-project/types@0.149.0)(oxc-parser@0.153.0)(rolldown@1.2.12)`。
  - 更新 devDependencies 中的 `webpack`：`5.105.4`，`锁定 5.105.4(@swc/core@1.16.13(@swc/helpers@0.5.23))(clean-css@5.3.3)(cssnano@8.0.10(postcss@8.5.28))(csso@5.0.5)(esbuild@0.28.2)(html-minifier-terser@7.2.0)(lightningcss@1.33.0)(postcss@8.5.28)(uglify-js@3.19.3)(webpack-cli@7.2.3)` → `5.105.4`，`锁定 5.105.4(@swc/core@1.16.13(@swc/helpers@0.5.23))(clean-css@5.3.3)(cssnano@8.0.10(postcss@8.5.29))(csso@5.0.5)(esbuild@0.28.2)(html-minifier-terser@7.2.0)(lightningcss@1.33.0)(postcss@8.5.29)(uglify-js@3.19.3)(webpack-cli@7.2.3)`。

- 让 Tailwind CSS 4 增量缓存和原生生成共享当前请求的宏展开与平台兼容来源，避免初建、重建及完整产物校验重复解析 CSS。保留扫描来源、样式选项、完整缓存身份和失效边界，裸任意值关闭或显式扫描来源仍沿用原有分支。

- 将微信 rpx 主题警告延后到构建器最终样式阶段：已静态化或未使用的主题不再提示，仅在仍有相关运行时 calc 时警告。安全构建不消耗提示额度，后续 watch 引入风险仍能提示一次；保持平台与日志级别边界。Refs #1214

- 修复 Lynx 编码时因 Tailwind 默认变量规则包含 `::backdrop` 而整组丢失的问题，保留边框、阴影等 utility 依赖的默认值和动态覆写；补齐默认过渡和等宽字体主题值的静态化，并保守保留局部、条件覆写及无法完整解析的主题别名。

- 修复 Tailwind v4 的百分比透明度在 Lynx 原生端不生效的问题：将明确的 `opacity: 50%` 等声明转换为原生数字 `opacity: 0.5`，覆盖关键帧和条件规则，保留动态变量、其它属性的百分比及无效输入。普通 Web 输出保持原语义。

- 将类名转义基础包源码纳入本仓库，以 @weapp-tailwindcss/escape 从新版本序列独立发布，并统一替换编译端、PostCSS 和运行时的依赖及类型引用。保留原转义 API、ESM/CJS 入口和映射行为，增加旧发布版对照与新包名打包验证。

  公开 workspace 消费方统一使用 repoctl 要求的 `workspace:*`，发布 tarball 固定到同批 escape 版本，避免保留旧依赖范围策略导致 Release 协议校验失败。

- 将发布包的仓库与问题反馈地址更新为 weapp-tailwindcss 组织下的主仓库，使 npm 包元数据与迁移后的 OIDC 发布来源一致。保留现有包名、导出接口、npm 所有权和文档域名。

- 升级 Oxc parser 至 0.152.0，保留精确类名转换、模块图及 source map 场景的 Babel 回退行为。

- 修复用户 PostCSS 插件先生成厂商前缀或动态变量声明后，透明十六进制颜色因误判已有回退而遗漏 rgba 兼容转换的问题。保留浏览器目标、显式开关与 preserve 配置，并避免声明去重跨过作者覆写或 shorthand 边界，保证最终渐变和颜色层叠一致。

- 由本包维护公开的包解析配置类型，保留 paths 与 posix、win32、auto 平台选项，避免消费者为了使用 generator 或 preset 被迫加载第三方包管理工具的全部声明。修复 local-pkg 1.2.1 发布声明引用未定义 Args 导致严格 TypeScript 消费失败的问题，不改变运行时包解析行为。

- 修复 uni-app x H5 生产样式中 framework `border-width: medium` 覆盖 Tailwind 边框 reset 的问题。Refs #1271。

- 对同一份待比较的 CSS 延迟解析一次，并在规则文本索引与声明索引之间共享只读语法树，减少生成样式恢复时的重复解析；索引完成后释放语法树，保留条件规则、声明优先级及解析失败时的保守处理。

- 在同一轮 Vite 产物清理中复用未变化的根样式覆盖索引，减少多个页面和组件重复解析根 CSS 的开销；根样式变更时重新计算，并保留独立分包隔离。

- 按实际生成依赖局部失效会话，保留无关入口的编译状态；依赖归属未知、生成失败、仍在执行和仅做过候选校验时继续保守失效。修复共享 `.cjs` 配置在刷新或删除后的旧模块读取，并避免生成失败的清理链产生未处理的 Promise 拒绝。

- 修复 uni-app x 局部样式将 `space-x`、`space-y` 替换为局部类名后，对应子元素间距规则被错误过滤的问题。统一作者样式与纯 `@apply` 生成结果的选择器归属判断，保留结构后代、条件规则及完整 `:is`、`:where` 分支，同时继续排除独立 utility 后代和仅在否定条件中出现的作者类名。

- 修复 uni-app x 自动局部 utility 别名按模板出现顺序生成，导致同优先级样式覆盖顺序与 Tailwind 不一致的问题。根据当前实际生成来源、主题和目标兼容候选的 Tailwind 排名，稳定排序同一父级内连续的自动局部规则，保留作者规则、未知排名和层叠边界；作者样式重放同时清理内部排序标记，避免标记进入最终产物。

- 修复 uni-app x 小程序和 WebView 局部样式将 Tailwind 运行时变量误当作固定主题值的问题。保留 `--tw-leading` 等变量及其间接依赖的动态引用，使同节点、空值和条件覆盖继续生效；仅限制 preset 的变量静态化步骤，保持单位转换、其他兼容处理和原生 UVUE 静态降级契约。

- 将 uni-app x 局部 utility 排序接入生成会话，复用该扫描模式实际 CSS 的 design system，避免排序与候选校验重复加载。新增可选的非语义来源准备回调，保留完整来源身份、平台候选规范化、依赖失效与失败重试；候选删除时仅重建编译器，复用已准备的 CSS。会话在平台或规范化配置变化后重建，失效或释放后的异步结果不再进入当前缓存。

- Vite 在同一次构建内复用相同来源范围的模板候选查询，减少重复的路径身份解析和来源匹配。查询依赖独立封存的候选集合，返回值与交给下一轮的状态均保留修改隔离；下一次构建重新匹配，继续正确处理删除、替换、排除范围和符号链接改向。

- Vite 复用已处理的 CSS 产物时，延后仅供重新转换消费的候选、来源追踪与缓存签名准备，避免重复解析。保留当前产物归属、内容更新、主包注入记录和复用判定；撤销已处理身份后仍执行正常转换。

- 修复 Vite 增量构建将页面和组件的完整样式误注入全局产物的问题，保留局部导入路径及样式归属，避免小程序样式缺失与循环导入。

- Updated dependencies:
  - @weapp-tailwindcss/engine@0.1.4
  - @weapp-tailwindcss/escape@0.0.2
  - @weapp-tailwindcss/logger@2.0.4
  - @weapp-tailwindcss/postcss@3.3.11
  - @weapp-tailwindcss/reset@0.1.5
  - @weapp-tailwindcss/shared@2.0.4
  - @weapp-tailwindcss/source-scan@0.1.2
  - tailwindcss-config@2.0.6
  - weapp-style-injector@1.0.7

## 5.5.11

### Patch Changes

- 为跨会话 design system、模块解析、CSS 入口以及 PostCSS 配置和管线复用增加容量上限与最近使用淘汰，避免长期 watch 持续保留旧配置和旧入口；失败任务仅清除自身缓存，不影响更新后的请求。

  同次创建 PostCSS 处理器和管线时复用已计算的配置签名，减少重复遍历嵌套配置。

- 修复 core 显式编译快照的 JavaScript 转换：使用快照中的精确候选集合处理自定义 utility 和转义拼写，避免前缀预检漏转；保留协议相对 URL 及字符串中的换行语义，不再套用模板换行清理规则。

- 修复微信 Tailwind CSS 4 固定 rpx 主题在默认配置下的 calc 尺寸偏差：新增自动模式，按完整产物作用域预计算并保留覆盖与缓存边界；动态主题可通过 cssOptions.cssCalc: false 退出。

  修复 uni-app 小程序 watch 删除或清空整个 SFC 样式块后旧样式产物残留的问题：通过 CSS 输出插件已提交的资产归属补齐空资产写入，保留构建失败、多输出与其他生产者的边界。

  保留调用阶段嵌套 CSS 配置的安全默认值，避免意外展开第三方组件变量；减少样式阶段配置复制，并在上下文和单位选项不变时复用最终资产结果。

  修复已有等价目标值时原单位声明未被替换的问题，保留覆盖顺序和显式保留模式；将修正后的单位换算实现随 PostCSS 的 ESM/CJS 产物一起交付。

  升级到包含上游修复的 postcss-plugin-shared 1.1.7 依赖链（rem 插件 7.0.7、pxtrans 1.0.6、unit-converter 0.2.5），移除临时 pnpm 补丁及锁文件登记，保留单位替换回归。

  延后样式管线创建至首次处理，避免重复初始化；复用同次 preflight 的选择器拆分结果，并在解析变量作用域选择器前先检查声明，减少大样式表的无效工作。

- 修复 uni-app x 微信热更新中 WXSS 导入循环：保留已登记的框架根样式与配置入口归属，避免增量 bundle 省略根资产后由其他根样式抢占生成目标；导入壳的写入、缓存与更新通知始终使用自身输出身份。兼容目标资产缺席时的入口再生成、当前导入目标切换和多个合法导入，不增加公开配置。源码更新并重新登记同名输出后，删除通知按当前归属图判定，避免内部增量构建误删仍有效的样式目标。

  Refs #1245

- 修复嵌套 CSS 规则去重后遗留空 at-rule 祖先，避免 Vite watch 重复注入 Tailwind 外壳导致恢复相同源码时产物不一致。

- 按来源发现、候选刷新、CSS 资产状态和插件组装拆分 Vite 内部职责，保留公开 API 与生成顺序。构建结束和 watcher 关闭时等待生成任务并释放实例状态，watch 中间轮次继续复用增量数据，生成失败不阻断后续队列请求。

  修复 build watch 中候选或配置来源改变后 CSS 入口继续复用旧 transform 的问题，按来源 revision 重转实际消费入口，并补齐 dispatcher 对缓存模块、模块解析和 watcher 关闭钩子的转发。

  按 Vite resolved config 隔离可释放的插件实例，支持 Nuxt 客户端与 SSR 连续复用同一插件配置，避免客户端结束后关闭后续 SSR 使用的生成队列。

  只在消费 transform 样式产物的 Web 分支按 revision 重转入口；小程序继续在 bundle 阶段生成，避免重复转换入口。

- 修复 Webpack watch 中固定文件名的 CSS 资产在配置值变化后复用旧转换结果的问题。已处理资产的缓存签名同时包含本轮 CSS 内容，不能仅凭 JS chunk hash 和类名集合判断样式未变。

  将生成器实际报告的配置与插件依赖并入运行时失效判断，避免只触发 Webpack 重编译却继续使用旧生成会话；为资产跳过决策缓存增加容量上限。

  资产生成缓存同时核对 loader 本轮生成结果，保证入口文本和类名集合不变时，配置中的颜色等值更新仍能提交到最终产物。

  将编译依赖变更提前到 loader 执行前通知生成会话，资产阶段复用同一份变更记录，避免失效过晚或重复失效。

- Updated dependencies:
  - @weapp-tailwindcss/engine@0.1.3
  - @weapp-tailwindcss/postcss@3.3.10

## 5.5.10

### Patch Changes

- 修复多 CSS 入口 watch 中当前生成结果被旧样式缓存重复回放的问题；显式 `source(none)` 多入口按空范围隔离；并在每轮构建重新注册文件型 @source 监听，避免切换来源或连续增删候选后旧类重新出现，使增量产物与干净构建保持一致。Refs #1241

  保留由本轮延迟生成标记关联的 CSS 资产身份，避免提前搬运并清空临时资产，导致 Taro Vite 分包的新增样式在后续输出映射中丢失；普通来源元数据仍按最终资产原有契约解析。

  候选文件监听仅注册到实际消费 Tailwind CSS 的构建图，避免普通 uni-app App 的空 nvue 辅助构建被页面变化触发，提前通知 HBuilderX 同步旧产物。文件型 @source 在每轮模块解析或缓存复用阶段重新注册，兼容 Rollup 3。

- 修复多个 CSS 入口合并后文件型 @source 的来源丢失与候选归属错误，保留空范围及主题冲突语义，并监听扫描文件变化。Refs #1241

- 修复 uni-app x 每个 SFC 转换都强制重建运行时、反复扫描项目的问题：同一失效版本共享类名集合和刷新任务，watch 与 HMR 在生命周期入口登记失效，模块转换继续补充生成器确认的当前候选。加入过期任务隔离、失败重试和会话释放，保留局部样式、自定义属性和动态类名更新。Refs #1245

  修复 Tailwind CSS 4 的 design system 未随配置间接依赖变化而失效的问题，并让候选有效性缓存绑定实际 design system，避免缓存复用后旧类残留或新类缺失。

- Updated dependencies:
  - @weapp-tailwindcss/engine@0.1.2
  - @weapp-tailwindcss/postcss@3.3.9

## 5.5.9

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

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.8

## 5.5.8

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.7

## 5.5.7

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

- 作者样式函数统一由 PostCSS 语法分析识别，移除主包按 CSS 长度和工具名称文本跳过编译的判断，避免大样式文件或包含生成标记的混合样式遗留未编译的 `--spacing()`、`--alpha()`。保留无函数样式快路径和编译上下文内的值缓存。

- 将公开 core 编译入口的 Tailwind banner 注释清理迁入 PostCSS 包，直接复用已有 AST，保留目标平台、finalize 开关、其它版权注释和声明字面量的既有行为。

- 将 CSS 资源位置依赖分析迁入 PostCSS，通过 tokenizer 识别转义的 url 和 import，避免相对资源转换跨目录共享缓存，并排除字符串及注释中的伪资源语法。

- 将 CSS 运行时签名归属 PostCSS，保留字符串空格、注释样文本及选择器关系，避免主题变量等有效修改被误判为排版变化而漏掉 HMR 缓存失效。

- 统一 uni-app x 的样式属性名、数值单位与行高类型转换到 PostCSS，删除主包重复实现，减少重复属性名处理并保持 CSS 与 UTS 输出一致。

- 复用现有 Oxc 解析器分析 JS 候选文本签名，保留原生模块不可用时的 Babel 回退；对构建图已排除出候选扫描的 JS 使用源码哈希保守失效，减少独立分包运行时的重复 AST 解析，同时保留类名精确转译与关联模块失效。

  为 JS 快路径增加有容量上限的字面量位置缓存，类集合变化时复用解析事实并重新精确匹配，避免 watch 反复构建完整 AST。保留 ESM 模块图和特殊语法的 Babel 回退，并让无模块图依赖的 CommonJS 产物使用原生解析器。合并小程序 preflight 与 theme 时预筛单一选择器，减少大型工具类样式表的 selector AST 分配。

- 为微信小程序的 Tailwind v4 rpx 主题变量增加每构建会话一次的建议性警告，区分运行时 calc 与静态输出；将相关生成样式转换及变量收集统一到 PostCSS 包，保持 CSS 和类名集合语义不变。

- Updated dependencies:
  - @weapp-tailwindcss/engine@0.1.1
  - @weapp-tailwindcss/postcss@3.3.6
  - @weapp-tailwindcss/source-scan@0.1.1
  - tailwindcss-config@2.0.5
  - weapp-style-injector@1.0.6

## 5.5.6

### Patch Changes

- 将 CSS 语法解析与 tokenize 收口到 @weapp-tailwindcss/postcss，主包不再直接依赖样式处理库

- 修复 Vite Web CSS-only 入口重复生成项目级运行时类集合导致构建与覆盖测试耗时过长的问题，复用 CSS 入口登记的模块集合，使源码候选替换、删除时正确失效并重新生成样式。

  修复多 CSS 入口扫描时默认排除范围随入口加载顺序变化的问题，为每个实际扫描根应用默认排除，避免兄弟目录中的 Tailwind 配置被误当作页面源码，同时保留页面真实使用的类名。

- 将 legacy selector/unit、空块清理和 Harmony CSS style value 变换迁到 @weapp-tailwindcss/postcss

- 将 uni-app x 边框 preflight 与 v4 theme CSS 变换迁到 @weapp-tailwindcss/postcss

- 修复 uni-app x H5 渐变与阴影：Web 生成样式保持独立转换链，局部 @apply 与 scoped 清理保留所需运行时变量初始化及注册，保留动态 fallback 和工具类组合。Refs #1210。

- 修复 Tailwind CSS v4 CSS 恢复与清理时误删用户自定义变量的问题：使用生成阶段的具体声明识别重复主题变量，保留用户变量的值、优先级和覆盖顺序，避免原始 rem 值覆盖已经转换的 rpx 值。

  恢复框架 vendor CSS 时通过规则索引精确匹配条件上下文、选择器和完整声明，保留生成侧已有的层位置以及框架侧的后续覆盖，合并重复编码声明。大产物同样执行完整恢复，批量清理节点并共享生成主题声明索引，避免重复解析和逐条删除造成的性能开销。同时改进 Taro issue-998 配置的跨平台路径检测。

  公开 core 编译入口在最终生成小程序 CSS 时也移除 Tailwind banner，避免 weapp-vite 等内置集成绕过 bundler 适配后留下 WXSS 产物检测误报。

  默认产物 matcher 识别钉钉 `.ddml` 和 `.ddss`，使 Mpx 钉钉构建中的模板类名转译及 rem2rpx 样式适配正常执行。没有生成 CSS 时仍合并框架样式的编码声明并保留覆盖顺序。

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

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.5

## 5.5.5

### Patch Changes

- 修复 Tailwind CSS v4 跨 CSS 资产构建时 `cssCalc` 无法预计算配置的 CSS 自定义属性的问题，并支持变量 fallback、链式引用与循环引用保护。

  - 统一数组、正则、对象和布尔形式的 `cssCalc` 外部变量映射透传，支持顶层和 `cssOptions` 配置入口。
  - 未启用 calc 变量解析时，完整 Tailwind v4 生成路径不再额外解析整份 CSS 收集变量，减少构建内存开销。

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.4

## 5.5.4

### Patch Changes

- 修复 Tailwind CSS v4 嵌套 CSS 入口被重复编译的问题，并保留完整的 source 扫描依赖关系。

- 完善 P1 编译器能力契约与缓存遥测的公共类型和验证能力。

- 增加编译器能力契约、分层缓存遥测及跨平台工程校验基础设施。

- 增加 P2 工程增强脚本、运行时体积预算与兼容性矩阵检查。

## 5.5.3

### Patch Changes

- 统一 Web 与 Harmony 的相对样式引用路径解析，保留 Windows UNC 共享目录与盘符根边界，避免跨平台解析网络模块时丢失共享根目录。

- 修复 uni-app x Web 热更新时 SFC 描述符与生成样式块不同步的问题，隔离脚本子请求的样式缓存，并正确处理已移除的生成样式请求。Refs #1144。

## 5.5.2

### Patch Changes

- 修复 uni-app x Web 端重要 utility 在连续 HMR 更新中的局部样式缓存、CSS 模块失效和 Sass 预处理边界。

- 修复 uni-app x important utility 预处理误用 CSS parser 的问题：使用真正的 SCSS 解析和序列化 API，避免样式中的行内注释使转换静默失效，导致 Web 连续热更新出现 Sass 语法错误。补充真实属性透传、连续保存、样式块增删与刷新回归。Refs #1144。

- 修复 uni-app x 原生端与小程序隔离组件中单边边框显示为四边框的问题：在 SFC 作者样式前使用独立基础类承载现有 cssPreflight 边框配置。保留单边、多方向组合、显式覆盖与组件局部 @apply 的样式顺序，支持禁用 preflight。Refs #1160。

- 修复 uni-app x Harmony VDOM 中 scoped SCSS 行注释导致背景、尺寸和圆角失效的问题。统一原始样式的 SCSS 解析，正确收集与展开局部 utility，并保留注释后的引用路径及作者样式。Web 端为空白或纯注释的 scoped 块生成独立局部样式载体，并通过 SFC 生命周期缓存向样式子请求提供生成源码，避免空块移除或 HMR 后丢失样式。Refs #1164。

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
  - @weapp-tailwindcss/postcss@3.3.3
  - weapp-style-injector@1.0.5

## 5.5.1

### Patch Changes

- 清理小程序最终样式中的空选择器规则，避免无效的 `:is(...)` 语法进入 WXSS 产物。Refs #1152

- 修复 uni-app x Web 热更新将完整 `.uvue` 源码误交给 PostCSS 解析，导致模板插值触发 `Unknown word` 警告的问题。Refs #1144

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.2

## 5.5.0

### Minor Changes

- 改善开发体验：新增固定 Generic Web target 的 `weapp-tailwindcss/vite/web` 入口，修正 `doctor` 对官方 Tailwind 生成器和 CSS 入口的诊断，并将初始化器默认切换为 Tailwind CSS 4 CSS-first 流程；旧版初始化配置改为通过 `mode: 'legacy'` 显式启用。

- 统一跨构建器编译状态与生命周期协议，新增可复用的 compiler host、事件总线和 runtime state，同时收敛 PostCSS、编译器和运行时衍生包的依赖版本 catalog，保持现有导入路径兼容。

- 将 `weapp-tailwindcss/vite/web` 拆分为真正的 Generic Web CSS-only 管线：默认只处理 CSS 生成与 HMR，不注册 JS/template、框架扩展、分包和小程序收尾；主入口识别为 Generic Web 后复用相同 profile，`styleInjector` 改为显式 opt-in。

### Patch Changes

- 升级兼容范围内的工作区依赖，迁移 Tailwind CSS 4 测试辅助工具的可选配置处理，并修正 PostCSS 本地 `postcss-calc` 链接路径。

- 修复 uni-app x Web 热更新将完整 `.uvue` 源码误交给 PostCSS 解析，导致模板插值触发 `Unknown word` 警告的问题。

- 修复多端 CI 构建依赖闭包、Playwright headless 浏览器安装和小程序样式产物收尾，避免兼容性测试因缺少构建入口或残留 CSS 哨兵失败。

- 统一处理 Tailwind source media 尾部残片，避免非法 CSS 进入小程序最终产物。

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.1

## 5.4.2

### Patch Changes

- 优化 Generic Web 非 watch 生产构建：跳过不需要的小程序 source-candidates 状态维护，减少重复扫描与构建生命周期开销。

- 修复 Generic Vite Web 项目在 monorepo 中误继承上层框架配置的问题，并默认收敛成功构建时的 Tailwind CSS 运行时信息日志；显式日志级别和多端框架配置保持不变。

## 5.4.1

### Patch Changes

- 完善 Core Compiler 与 PostCSS 集成能力：小程序目标默认完成 CSS 最终化，支持 source glob 增量失效、内存 CSS source、root 淘汰回调、模板 filename 上下文，并公开最终化相关 API。

- Updated dependencies:
  - @weapp-tailwindcss/postcss@3.3.0

## 5.4.0

### Minor Changes

- 统一 `weapp-tailwindcss/vite` 主入口的多端适配：无框架标记的 Generic Vite 项目默认使用 Web target，并在配置解析后按真实环境选择 uni-app、Taro、weapp-vite 与小程序能力；显式目标和平台配置保持优先。

- 新增稳定的 `weapp-tailwindcss/core` 框架 compiler API，支持按样式 root 复用 Tailwind 生成会话、显式不可变 snapshot、增量 CSS、精确依赖失效、多 root 合并以及一致的 CSS、模板和 JavaScript 转换事务。

### Patch Changes

- 官方 Vite、Webpack、Rspack 与 Gulp 适配器在 graph 模式下共享长期复用的 compiler session，使用同一份 snapshot 完成增量 CSS、模板和 JavaScript 转换，减少重复生成与运行时集合扫描，并在 owner 释放时完整回收 root 状态。

- 将公开 npm 包的主页和相关文档入口迁移到新的 `https://tw.weapp.dev` 域名，并补齐缺失的包主页元数据。

- 修复 uni-app x Web 中 Tailwind CSS 主题变量、scoped 页面样式与并发 HMR 更新丢失的问题，并在配置入口未进入 Web 样式构建链路时给出明确告警。

- 修复 uni-app x 中 important utility 与局部 Sass `@apply` 在 Web、Android Vapor 等目标间编译不一致的问题。

- 升级 OXC 解析器依赖，保持核心转译链与最新类型定义一致。

- 优化 Vite 小程序构建中的 source-candidates 扫描、批量 HMR 同步和增量 bundle 入口规划，减少重复候选提取与 clean entry 全图处理。

  Related to #1127

- 修复 uni-app x Harmony VDOM 中 `leading-*` 行高值被错误转换为数字，导致样式不生效的问题。

- Updated dependencies:
  - @weapp-tailwindcss/logger@2.0.3
  - @weapp-tailwindcss/postcss@3.2.12
  - @weapp-tailwindcss/reset@0.1.4
  - @weapp-tailwindcss/shared@2.0.3
  - tailwindcss-config@2.0.4
  - weapp-style-injector@1.0.4

## 5.3.6

### Patch Changes

- 修复 uni-app x Web 局部样式中的重要修饰符导致 CSS 编译失败的问题，确保 `!mt-6` 与 `mt-6!` 能生成 Tailwind CSS v4 支持的形式。

## 5.3.5

### Patch Changes

- 修复 uni-app x SFC 中空内容的外链 WXS `<script>` 导致构建失败的问题。

- 优化 Generic Vite Web 非 watch 生产构建，跳过未被消费的 source candidate 扫描与模块级跟踪，同时保留开发、watch、跨框架及 CSS 来源追踪链路；升级 weapp-vite 6.22 后迁移独立分包样式构建并保留单次生成回归。

## 5.3.4

### Patch Changes

- 修复 uni-app x 小程序构建中组件局部 Tailwind 样式绕过 Sass 预处理、导致 SCSS 变量原样进入样式产物的问题。

## 5.3.3

### Patch Changes

- 修复 uni-app x H5 局部 Tailwind 工具类的级联优先级，确保 `dark` 等条件变体能够覆盖同一元素上的基础工具类。

- 支持通过 `uniAppX.componentLocalStyles.componentMatcher` 和 `pageMatcher` 为 `layouts` 等自定义目录启用局部 Tailwind 样式，并保持 Web、原生 App 与鸿蒙构建的路径匹配行为一致。

- 修复 uni-app x H5 中已进入构建图但未命中显式 Tailwind 正向源码范围的页面，暗色等 variant 任意值类无法生成和同步转译的问题。

## 5.3.2

### Patch Changes

- 修复 uni-app x Harmony 构建中本地样式与 Tailwind 样式合并不完整导致的 VDOM 跨端显示差异，并提升样式注入的 ArkTS 兼容性。

## 5.3.1

### Patch Changes

- 修复 ReactLynx/Rspeedy 多阶段 CSS loader 覆盖 Tailwind CSS 4 入口的问题，兼容 uni-app x 组件局部样式中的前置重要修饰符，并过滤小程序扫描中会生成非法 `:has()` 选择器的 `has-in`/`has-not-in` 变体；新增基于真实 CSS、encoder 与 iOS/Android runtime 报告的完整兼容性实验室。

## 5.3.0

### Minor Changes

- ✨ **新增独立的 `@weapp-tailwindcss/cli` 包：默认提供与 Tailwind CSS CLI 对齐的 Web 构建、监听、优化、source map 与 `canonicalize` 能力，并支持通过 `--target weapp` 显式生成小程序兼容 CSS。CLI 命令不再由 `weapp-tailwindcss` 核心包发布。** [#1076](https://github.com/sonofmagic/weapp-tailwindcss/pull/1076) by @sonofmagic
  - 该包此前已经存在 `3.x` 和 `4.0.0-alpha.x` 的旧版原生小程序 Gulp CLI。本次使用 `5.x` 版本线发布新的 Tailwind CSS CLI 兼容实现，避免覆盖旧版本语义或让 npm `latest` 回退到 `0.x`。

### Patch Changes

- 🐛 **统一更新各发布包的 npm 描述与中英文 README，明确 `weapp-tailwindcss` 面向 Web、小程序、React Native、Lynx 与跨端框架的全端 Tailwind CSS 定位。公开包现在默认展示英文 README，并提供统一命名的简体中文入口，同时保留各子包的具体职责边界。** [#1079](https://github.com/sonofmagic/weapp-tailwindcss/pull/1079) by @sonofmagic

- 🐛 **修复 uni-app x Web 端页面与组件局部 Tailwind 样式隔离，确保插槽内容、图片以及显式配置的组件 class 属性能够保留宽高、颜色、间距和 `!important` 优先级。** [#1067](https://github.com/sonofmagic/weapp-tailwindcss/pull/1067) by @sonofmagic

- 🐛 **修复 uni-app x 组件局部样式中的 Tailwind v4 后缀重要修饰符导致 Android、iOS App 的 SCSS 编译失败，并确保局部样式内的相对 `@reference` 按原始 `.uvue` 模块位置解析。** [#1072](https://github.com/sonofmagic/weapp-tailwindcss/pull/1072) by @sonofmagic

- 🐛 **统一修复 Vite 小程序构建中框架根样式与运行时样式入口分离时的引用关系，并优先根据 Rollup 入口元数据识别实际运行时根样式。** [`f2cc9ec`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f2cc9ecc11afcfec967d720929fa24a47fbf8f46) by @sonofmagic

- 🐛 **修复 uni-app x HBuilderX 小程序构建中根样式未引入框架样式入口的问题，确保 Tailwind CSS 生成结果能够从应用样式入口加载。** [`0e1f0dc`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0e1f0dc14d2f19abd26e4a639255852fadb7cacd) by @sonofmagic
- 📦 Updated 6 dependencies [`c2ba271`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c2ba271ac62ba851c23549a8de1038a71bb868d6)
  <details><summary>Details</summary>

  `@weapp-tailwindcss/logger@2.0.2`, `@weapp-tailwindcss/postcss@3.2.11`, `@weapp-tailwindcss/reset@0.1.3`, `@weapp-tailwindcss/shared@2.0.2`, `tailwindcss-config@2.0.3`, `weapp-style-injector@1.0.3`

  </details>

## 5.2.14

### Patch Changes

- 🐛 **修复 Vite transform 与 HMR 未复用 Tailwind Scanner 实际文件范围的问题，避免被 `.gitignore` 排除的模块重新进入 source candidates。** [#1065](https://github.com/sonofmagic/weapp-tailwindcss/pull/1065) by @sonofmagic

## 5.2.13

### Patch Changes

- 🐛 **修复 Vite Web generator 在 monorepo 中通过 transform 和 HMR 扫描第三方依赖的问题，并保留显式 source 引入外部依赖的能力。** [#1062](https://github.com/sonofmagic/weapp-tailwindcss/pull/1062) by @sonofmagic

- 🐛 **优化 Generic Vite Web 生产构建：当 Tailwind CSS 已在 Vite transform 阶段生成时，跳过面向小程序增量处理的完整 bundle snapshot，避免读取和散列无关的大型 JS chunk。小程序、uni-app、uni-app x、Taro、weapp-vite、watch 与 HMR 构建继续使用原有流水线。** [#1063](https://github.com/sonofmagic/weapp-tailwindcss/pull/1063) by @sonofmagic

- 🐛 **优化 Generic Vite Web 生产构建的 CSS 收尾流程，复用 transform 阶段已登记的 CSS 产物身份，减少重复遍历和重复兼容处理，并补充分项性能计时。** [#1064](https://github.com/sonofmagic/weapp-tailwindcss/pull/1064) by @sonofmagic

- 🐛 **新增 ReactLynx 与 Rspeedy 的 Tailwind CSS v4 构建集成，保留原生 className，并在构建期静态化 Tailwind theme 变量，输出 Lynx 原生运行时可消费的 CSS。** [#1055](https://github.com/sonofmagic/weapp-tailwindcss/pull/1055) by @sonofmagic

- 🐛 **修复 Vite Web generator 默认扫描第三方依赖模块导致候选类污染和构建性能下降的问题，并让 `tailwindcss.v4.sources` 同时约束初始扫描与增量更新。** [#1061](https://github.com/sonofmagic/weapp-tailwindcss/pull/1061) by @sonofmagic
- 📦 **Dependencies** [`8287ade`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8287ade3e759bad448d8954076573e2848f45fae)
  → `@weapp-tailwindcss/postcss@3.2.10`

## 5.2.12

### Patch Changes

- 🐛 **升级仓库使用的 `weapp-vite` 与其配套的 `wevu` 到 6.19.1，确保 demo、构建链路和运行时依赖使用最新稳定版本。** [#1052](https://github.com/sonofmagic/weapp-tailwindcss/pull/1052) by @sonofmagic

- 🐛 **小程序样式现在默认移除无效的 `:active` 选择器，同时保留 Tailwind candidate 与模板类名转换，并允许通过 `cssOptions.cssRemoveActivePseudoClass: false` 显式恢复。Tailwind CSS v4 的任意 `@custom-variant` 都支持条件注释放在变体内部或包住整个变体的跨平台写法。H5 与 App 的 Web 构建行为保持不变。** [#1052](https://github.com/sonofmagic/weapp-tailwindcss/pull/1052) by @sonofmagic

- 🐛 **修复 Nuxt 页面在 Vite 热更新时源模块未同步、Tailwind 样式更新后页面状态不刷新的问题。** [`f264a83`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f264a83b8968fbd48c88edcd87db6438d0a122f8) by @sonofmagic

- 🐛 **统一升级构建链路依赖，并将多个跨包复用的工具依赖提炼到 pnpm catalog，降低版本漂移和后续升级成本。** [`11f26f7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/11f26f7c93f99db9f3f0b7e57c633e8654c2a6a6) by @sonofmagic
- 📦 **Dependencies** [`1dcb3b3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1dcb3b3a57ae088f2105e594db2df5a99225be45)
  → `@weapp-tailwindcss/postcss@3.2.9`

## 5.2.11

### Patch Changes

- 🐛 **修复 Tailwind v4 通用生成器仍可能把带 query 或 hash 的 bundler module id 当作物理文件路径读取的问题，确保 weapp-vite sidecar 等虚拟样式请求在进入文件系统解析前统一还原为源码路径。** [#1049](https://github.com/sonofmagic/weapp-tailwindcss/pull/1049) by @sonofmagic

## 5.2.10

### Patch Changes

- 🐛 **修复 uni-app App 构建中业务字符串被误当作 Tailwind 类名转译的问题。所有构建端的 JavaScript 现在只转译由 Tailwind 生成或验证链路确认的类名；废弃的 `jsArbitraryValueFallback` 不再允许任意值绕过 `classNameSet`，空集合和未命中候选均保持原文。** [#1046](https://github.com/sonofmagic/weapp-tailwindcss/pull/1046) by @sonofmagic

- 🐛 **修复逻辑方向属性展开后残留 `calc()` 声明导致小程序间距计算异常的问题，并避免清理过程改变作者声明的级联与 `!important` 语义。** [#1045](https://github.com/sonofmagic/weapp-tailwindcss/pull/1045) by @ZCY-G

- 🐛 **修复 weapp-vite HMR sidecar 虚拟查询被当作物理 CSS 文件路径传入 Tailwind 生成管线后触发 `ENOENT` 的问题。** [#1047](https://github.com/sonofmagic/weapp-tailwindcss/pull/1047) by @sonofmagic
- 📦 **Dependencies** [`5066997`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5066997beef53842a2e97da3af064d1349ea00be)
  → `@weapp-tailwindcss/postcss@3.2.8`

## 5.2.9

### Patch Changes

- 🐛 **修复 uni-app x 组件局部样式绑定被误识别为 Tailwind 类名、Native 端局部 `@apply` 未展开，以及 Web 端样式预处理与连续 HMR 候选更新不完整的问题。** [#1042](https://github.com/sonofmagic/weapp-tailwindcss/pull/1042) by @sonofmagic

- 🐛 **修复 Taro Vite 监听模式连续构建时根样式 replay 丢失的问题，保留框架生成的全局样式并恢复 native watch 回归验证。** [#1040](https://github.com/sonofmagic/weapp-tailwindcss/pull/1040) by @sonofmagic
- 📦 **Dependencies** [`5f1fa8c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5f1fa8c782ec6044e54890d31af6cb3788f80c59)
  → `@weapp-tailwindcss/postcss@3.2.7`

## 5.2.8

### Patch Changes

- 🐛 **修复 uni-app x Native scoped 作者样式被通用 CSS 生成管线提前改写的问题，并统一 Windows 下 Vite 模块身份与 HMR 候选刷新顺序，确保新增、删除和回滚类名时会重新编译对应 `.uvue` 本地样式；同时细分 Harmony 构建失败、保留 HBuilderX 日志中的首个关键错误，并让 Harmony 回归基于与 HBuilderX Alpha 对齐的编译器及最终 JavaScript 产物验收样式。** [#1036](https://github.com/sonofmagic/weapp-tailwindcss/pull/1036) by @sonofmagic

- 🐛 **升级并对齐 OXC 解析器与 AST 类型依赖，修复新版 `oxc-walker` 无法加载导致 JS 快路径回退的问题，并确保 CommonJS 构建继续兼容仅提供 ESM 导出的 walker。** [`8084d90`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8084d9026c9d7cd400ea26e5b5eb531600a9cc9b) by @sonofmagic

- 🐛 **修复 H5 与 App WebView 兼容模式错误静态化 Tailwind 运行时 CSS 变量的问题，避免 shadow、ring、gradient、mask 等颜色组合工具类互相串色。** [#1039](https://github.com/sonofmagic/weapp-tailwindcss/pull/1039) by @sonofmagic
- 📦 **Dependencies** [`b394b1b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b394b1baa945109ba93760b13bfcd12abacdab4f)
  → `@weapp-tailwindcss/postcss@3.2.6`

## 5.2.7

### Patch Changes

- 🐛 **修复 uni-app、Taro、MPX、weapp-vite 与原生 Gulp 小程序在冷构建或增量更新后可能输出空条件规则并导致平台样式解析报错的问题。** [#1034](https://github.com/sonofmagic/weapp-tailwindcss/pull/1034) by @sonofmagic

## 5.2.6

### Patch Changes

- 🐛 **修复 uni-app x 保存 Tailwind CSS 入口时，Vite 模块的空标识进入 HMR 模块图并中断热更新的问题；同步维护开发服务器与构建监听中的权威入口源码并刷新 Tailwind 运行时，同时让组件局部 `@apply` 继承唯一的项目 Tailwind 根入口，确保新增主题类在 Web 与原生 App 中无需重新运行即可生效。** [#1032](https://github.com/sonofmagic/weapp-tailwindcss/pull/1032) by @sonofmagic

## 5.2.5

### Patch Changes

- 🐛 **完善经典 uni-app app-plus 的默认 WebView 兼容转换，并在 `legacy-web` 现有处理链中为文本渐变补充 WebKit 前缀；Tailwind CSS v4 运行时间距变量和间距反转语义保持不变，使 Android 与 iOS App 无需业务侧兼容插件即可使用对应工具类。** [#1028](https://github.com/sonofmagic/weapp-tailwindcss/pull/1028) by @sonofmagic

- 🐛 **修复 uni-app 的 PostCSS 兼容链展开 Tailwind CSS v4 空变量回退值后生成 `filter: ;` 与 `backdrop-filter: ;` 的问题；最终小程序样式会移除无效的普通空属性，同时保留 Tailwind 运行时所需的空自定义属性初始化。** [#1030](https://github.com/sonofmagic/weapp-tailwindcss/pull/1030) by @sonofmagic

- 🐛 **修复 uni-app x scoped 作者样式被原生 Tailwind 兼容过滤误删的问题，并让 H5/Web 作者样式继续交由 SFC 预处理链处理；同时在原生 App 的 `.uvue` 类集合扩大时失效 Tailwind CSS 模块并触发自动重载，使新增字体、颜色、间距和任意值类无需手动重新运行到设备即可生效。** [#1029](https://github.com/sonofmagic/weapp-tailwindcss/pull/1029) by @sonofmagic
- 📦 **Dependencies** [`3f3f3b3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3f3f3b3045d9aac099a359b514cd9f3b7cab1d3f)
  → `@weapp-tailwindcss/postcss@3.2.5`

## 5.2.4

### Patch Changes

- 🐛 **兼容组件库 CSS 中常见的 `//` 行注释，避免样式解析失败；同时保留字符串、块注释和 URL 内容不变。修正 `uni-app x` 全局 `uvue` 样式入口被错误当作组件作者样式的问题，继续过滤原生编译器不支持的全局选择器。** [#1026](https://github.com/sonofmagic/weapp-tailwindcss/pull/1026) by @sonofmagic

- 🐛 **修复 `uni-app x` 在 `uniAppXCssTarget: 'uvue'` 下误删 `uvue` 组件 `<style scoped>` 作者样式的问题。现在会保留 scoped 组件样式，同时继续清理 `uvue` 不兼容声明和 scoped 请求里的 Tailwind 注入噪音。** [#1024](https://github.com/sonofmagic/weapp-tailwindcss/pull/1024) by @sonofmagic
- 📦 **Dependencies** [`67c90de`](https://github.com/sonofmagic/weapp-tailwindcss/commit/67c90de8a94716664561dc2898cb7bbde338c7cc)
  → `@weapp-tailwindcss/postcss@3.2.4`

## 5.2.3

### Patch Changes

- 🐛 **修复 uni-app x 使用 `unitsToPx` 时 CommonJS 构建无法加载单位转换插件，避免 HBuilderX 编译直接中断；升级相关 PostCSS 单位转换插件并使用其兼容的 CommonJS 导出。** [#1023](https://github.com/sonofmagic/weapp-tailwindcss/pull/1023) by @sonofmagic
- 📦 **Dependencies** [`d28f70d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d28f70dbb581673416868a5bb9517e82e0e24c98)
  → `@weapp-tailwindcss/postcss@3.2.3`

## 5.2.2

### Patch Changes

- 🐛 **修复 uni-app x uvue 产物中作者 CSS 变量 fallback 不兼容 HBuilderX 的问题，同时保留静态 fallback 与运行时变量覆盖能力。** [#1018](https://github.com/sonofmagic/weapp-tailwindcss/pull/1018) by @sonofmagic

- 🐛 **修复 uni-app x 使用 Tailwind CSS v4 时作者 CSS 主题变量的 fallback 被错误静态化的问题，让仅使用 `@apply` 的样式入口在唯一 Tailwind 配置可确定时继承该配置，并移除 uvue 产物中无法静态求值的 `calc()` 声明。** [#1016](https://github.com/sonofmagic/weapp-tailwindcss/pull/1016) by @sonofmagic
- 📦 **Dependencies** [`b52a84b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b52a84b2aa17a123156ed094e6c6a72a405ac2ce)
  → `@weapp-tailwindcss/postcss@3.2.2`

## 5.2.1

### Patch Changes

- 🐛 **确保 Vite 增量构建复用缓存样式时，最终小程序 CSS 产物仍会递归移除空的条件规则。** [#1009](https://github.com/sonofmagic/weapp-tailwindcss/pull/1009) by @sonofmagic

- 🐛 **修复 uni-app x 的 UVUE 样式目标无法识别 `translate()` 逗号分隔参数的问题，将顶层参数转换为空格分隔形式，并保留 `var()` 回退值等嵌套函数中的逗号。** [#1011](https://github.com/sonofmagic/weapp-tailwindcss/pull/1011) by @sonofmagic

- 🐛 **修复 uni-app x 开启 `rem2rpx` 后 Web 端 `rpx` 任意值与字号工具类不生效的问题。** [#1010](https://github.com/sonofmagic/weapp-tailwindcss/pull/1010) by @sonofmagic
- 📦 **Dependencies** [`62ac4c0`](https://github.com/sonofmagic/weapp-tailwindcss/commit/62ac4c0fd1619dfb10639455f412634335c00001)
  → `@weapp-tailwindcss/postcss@3.2.1`

## 5.2.0

### Minor Changes

- ✨ **升级核心 Babel 工具链到 Babel 8，并将 Node.js 最低版本提升到 `^22.18.0 || >=24.11.0`。相关包默认采用 ESM 语义，继续同时发布 ESM 与 CommonJS 入口；ESM 产物使用 `.js`，CommonJS 产物使用 `.cjs`，原有公开包名与子路径保持不变。同时收紧 tsdown 的依赖外置策略，避免 ESM 无条件内联可直接消费的依赖，并保证 CommonJS 不会同步加载 ESM-only 依赖。Webpack loader 与 CommonJS runtime 复用同一构建图，避免重复加载 Babel 8 等内联依赖；watch/serve 热更新复用解析缓存并采用轻量 AST 签名遍历，在完整语义约束允许时默认使用 OXC AST 快路径，并在普通 build、不支持的输入或运行时自动回退 Babel，避免冷构建同时加载双解析器。Webpack chunk 直接使用 compilation 产物图独立转译，原生 JS/WXS 才保留输出模块图关联，避免把 runtime bootstrap `require()` 误当作源码链接，降低 MPX、Taro Webpack 等链路的内存和插件处理耗时。Webpack 产物中的 harmony import 注释与 JSDoc import type 不再误触发模块图解析。** [#1004](https://github.com/sonofmagic/weapp-tailwindcss/pull/1004) by @sonofmagic

- ✨ **新增基于 CSS AST 的编译管线基础设施，提供可克隆的 Root 处理 API、统一的 Tailwind 生成会话、显式 source graph 与 artifact 归属，并支持通过环境变量在 legacy、shadow 和 graph 模式间渐进切换。** [`8a15138`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8a15138399875e714b3476f72f6e25671a0ef3ca) by @sonofmagic

- ✨ **从 `5.2.0` 开始将最低运行环境提升到 Node.js `22.12.0`，确保 CommonJS 默认加载 ESM 依赖；使用 HBuilderX 的项目需升级到 `5.11` 或更高版本。** [`a701376`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a70137652f56e2adb4c5b85fabad978918206e27) by @sonofmagic

### Patch Changes

- 🐛 **deps: upgrade** [`17c0dbe`](https://github.com/sonofmagic/weapp-tailwindcss/commit/17c0dbee727a642c78f9f9602e9d567a249d8025) by @sonofmagic

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

- 🐛 **稳定 Tailwind v4 的 source-aware 生成链路：Web target 保留 Vite 已生成的普通与第三方 CSS，CSS 候选只从 `@apply` 和 `@source inline(...)` 等结构化宏提取，避免将声明值误识别为工具类；同时改进多入口候选归属，并串行处理同一文件的 Vite HMR source snapshot，防止旧 revision 覆盖最新候选集合。** [`22d2667`](https://github.com/sonofmagic/weapp-tailwindcss/commit/22d26670f63ab25c8318d228d611937d4d557fcc) by @sonofmagic
- 📦 Updated 6 dependencies [`8d9cc88`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8d9cc8878cc430a4953579e2c76213402f0932e1)
  <details><summary>Details</summary>

  `@weapp-tailwindcss/logger@2.0.1`, `@weapp-tailwindcss/postcss@3.2.0`, `@weapp-tailwindcss/reset@0.1.2`, `@weapp-tailwindcss/shared@2.0.1`, `tailwindcss-config@2.0.2`, `weapp-style-injector@1.0.2`

  </details>

## 5.1.16

### Patch Changes

- 🐛 **修复 Mpx 构建存在多个 peer 依赖实例时 loader 与依赖模板混用的问题，根据 Webpack compilation 已注册的模板锁定实际拥有编译图的 `@mpxjs/webpack-plugin`，避免构建报错并保持 Tailwind 样式转换正常。同时修复 Tailwind CSS v4 用户 `@layer` 规则因格式缩进未命中插入位置而被追加到 utilities 之后的问题，按 CSS 结构恢复 `base`、`components`、`utilities` 与未分层样式的层叠顺序，并避免兼容回放重复输出 layer 规则。** [#995](https://github.com/sonofmagic/weapp-tailwindcss/pull/995) by @sonofmagic

- 🐛 **优化 Tailwind CSS v4 在 Vite 与 Webpack 构建、watch 和 HMR 场景下的候选增量更新与样式产物处理性能，并新增分层性能基准和回归门禁。** [#996](https://github.com/sonofmagic/weapp-tailwindcss/pull/996) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 后置生成样式绕过框架 PostCSS 管线的问题，确保 Vite、Webpack 等构建链能复用完整插件配置处理 CSS 变量与生成规则。** [#999](https://github.com/sonofmagic/weapp-tailwindcss/pull/999) by @sonofmagic

- 🐛 **默认关闭 `cssCalc` 预计算，避免 SVG 等大体积 CSS 自定义属性在 Autoprefixer 处理后重复展开；需要预计算兼容能力时可显式开启。同时清理 Vue scoped 样式中 `@apply` 生成的等价未作用域规则，避免组件样式重复输出。** [`0cc5efc`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0cc5efc39b3aeffc97a3addddff4ef74065d1d31) by @sonofmagic
- 📦 **Dependencies** [`da88a42`](https://github.com/sonofmagic/weapp-tailwindcss/commit/da88a42f41ffa1ce0de365d7708526a963ab3165)
  → `@weapp-tailwindcss/postcss@3.1.12`

## 5.1.15

### Patch Changes

- 🐛 **修复 Vite build watch 中 scoped Vue 组件样式在小程序选择器转义前被框架写入输出目录的问题，确保 uni-app 与 uni-app x 开发构建写入框架 CSS 缓存前已完成 Tailwind class 转换。同时将 Vue style request 元数据与 PostCSS 真实文件路径分离，避免 Windows 把带 Vite query 的模块 id 当作输出路径；开发者工具不再编译到包含反斜杠转义的临时样式，生产构建与 H5 样式生成行为保持不变。** [#992](https://github.com/sonofmagic/weapp-tailwindcss/pull/992) by @sonofmagic

- 🐛 **由 weapp-tailwindcss 统一消费小程序与 Web Compact 产物中的 `@layer`，按照声明顺序重排样式块后移除 layer 语法，并阻止 postcss-preset-env 生成 `:not(#)` 权重占位选择器。现代 Web 产物继续保留原生 cascade layers。** [#990](https://github.com/sonofmagic/weapp-tailwindcss/pull/990) by @sonofmagic

- 🐛 **统一 Vite、Webpack 与 Gulp 构建态的 Tailwind CSS 生成时机，在生成阶段展开必要的嵌套规则、编译平台条件并清理 `@layer`、Web preflight 与 specificity 占位选择器，同时保留工具类和本地 `@import` 交给框架原有的 PostCSS 流程；最终适配继续注入小程序 preflight，并清理等价的 calc fallback 声明，避免产物重复输出同一份样式，同时保留 Vite dev HMR 的增量样式。修复 scoped `@reference` + `@apply` 泄漏独立工具类，以及 Webpack 在拼接裸选择器用户样式时重复输出根变量、preflight 和同一产物内已被后规则覆盖的等价规则问题。为 MPX 2.x 声明可选 peer 依赖，使 pnpm 严格依赖模式下从生成样式上下文加载的 MPX loader 始终可解析，同时不影响非 MPX 项目的安装。** [#988](https://github.com/sonofmagic/weapp-tailwindcss/pull/988) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 小程序生成管线误删用户原生伪元素选择器的问题，确保 `button::after` 等无 class 规则按用户样式来源完成转换和合并，不再需要额外添加 workaround class，同时继续清理浏览器专用 preflight。** [`310267f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/310267ff4905b4beb593f8f75deece90beb3ae23) by @sonofmagic

- 🐛 **修复 Vite 构建中源 WXML 覆盖已转换 bundle 模板的问题，保留其他插件注入的模板结构，同时维持 Tailwind class 的正常生成与转义。** [#991](https://github.com/sonofmagic/weapp-tailwindcss/pull/991) by @sonofmagic
- 📦 **Dependencies** [`09bdcc7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/09bdcc7c47621ca88f526b57f544343885753ecc)
  → `@weapp-tailwindcss/postcss@3.1.11`

## 5.1.14

### Patch Changes

- 🐛 **修复 Vite 与 weapp-vite 项目配置多个 Tailwind CSS v4 `@source` 扫描根时的候选作用域合并问题，确保 monorepo 外部包、`@source not`、`@config` content 排除规则以及主包/分包样式隔离同时生效；同时恢复 Vite dev HMR 的增量 CSS 回放，在保留完整当前候选集的同时继续保留默认不删除的旧 CSS。** [#985](https://github.com/sonofmagic/weapp-tailwindcss/pull/985) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 现代颜色配合动态透明度变量时的 RGB 通道转换，避免 OKLCH 等颜色被错误地直接当作 RGB 通道输出。** [#987](https://github.com/sonofmagic/weapp-tailwindcss/pull/987) by @sonofmagic

- 🐛 **修复 Vite/Tailwind CSS v4 生成链路中误删 `page` 自定义 CSS 变量的问题。用户在 `App.vue` 等全局样式里声明 `--color-*`、`--font-*` 等变量时，不再因为命中 Tailwind v4 theme namespace 而被当作生成变量清理。** [#981](https://github.com/sonofmagic/weapp-tailwindcss/pull/981) by @sonofmagic

- 🐛 **修复 Vite serve/HMR 下小程序根样式产物的处理策略，保留框架原生生成的本地 `@import` shell，避免 `app.wxss` 等根样式文件被 Tailwind 生成 CSS 覆盖；Tailwind 生成内容继续写入配置的样式入口产物。** [`2d0e5dc`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2d0e5dcd100e98eb57a3101a597e636563e0c5f1) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 `@source` 扫描路径未复用 `customAttributes` 的问题，使 `t-class` 等自定义模板类名属性中的工具类可以参与 CSS 生成。** [#980](https://github.com/sonofmagic/weapp-tailwindcss/pull/980) by @sonofmagic
- 📦 **Dependencies** [`fb32eae`](https://github.com/sonofmagic/weapp-tailwindcss/commit/fb32eaeef309c0f129a60214b389d8615e6b669d)
  → `@weapp-tailwindcss/postcss@3.1.10`

## 5.1.13

### Patch Changes

- 🐛 **修复 uni-app Vite 开发热更新中，Vue 模板新增 `text-[yellow]`、`bg-[blue]` 等任意值类后，根样式产物可能未稳定重新生成的问题。** [`948a299`](https://github.com/sonofmagic/weapp-tailwindcss/commit/948a299380ef57b474c4ec395b35992aec897a90) by @sonofmagic

## 5.1.12

### Patch Changes

- 🐛 **修复 Vite H5 dev 热更新新增 Tailwind 候选时只生成增量候选 CSS，导致已有 Iconify 任意值图标样式在 CSS HMR 后丢失的问题。** [`058ff7d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/058ff7dddcfaa2c7173e1038ab89b37a754a621a) by @sonofmagic

## 5.1.11

### Patch Changes

- 🐛 **修复 Vite Web/H5 开发态中 Tailwind CSS 类名热更新不刷新样式的问题。** [`83c5d7e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/83c5d7e20a42e0b9bfaae70c5fba840af5db2baf) by @sonofmagic
  - 此前在 uni-app H5 等场景中，从 Vue script、Vue template 或 JS/TSX 中修改 `bg-[#0000ff]` 这类 Tailwind 类名后，补发的 Vite CSS HMR 更新会走 `css-update`，但 Vite 开发态 CSS module 实际通过 JS 重新导入更新页面内的 `<style>` 标签，导致浏览器样式没有生效。现在补发更新改为 `js-update`，并补充 Web/H5 真实 DOM 热更新矩阵回归，覆盖 uni-app、Taro React 与 Taro Vue 的模板、脚本和 TSX 类名修改。

## 5.1.10

### Patch Changes

- 🐛 **升级 `@tailwindcss-mangle/engine` 到 0.1.3，并适配 Tailwind v4 生成结果中 source metadata 的返回行为变化。** [`c0565ad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c0565ad2dad6adf2420348e5a490a763e853721c) by @sonofmagic
  - `weapp-tailwindcss` 现在会在自身的 v4 扫描层回填已解析的 `@source` 扫描规则，避免依赖底层 engine 继续透传 compiled sources；同时修正 Vite 已处理 CSS replay 到小程序根样式资产时的显式目标 fallback 边界。

- 🐛 **修复 Vite 小程序 watch HMR 在回放 `app.wxss`/`main.wxss` 等样式输出壳时，可能把输出文件自引用 `@import` 再次交给 Tailwind 解析的问题，避免增量编译时报 `Can't resolve 'app.wxss'`。** [#973](https://github.com/sonofmagic/weapp-tailwindcss/pull/973) by @sonofmagic
  - 同时在 generateBundle 回放已有同名 CSS asset 时复用当前 bundle 产物，避免 `main.wxss` 等小程序样式文件重复发射警告。

- 🐛 **新增 Tailwind v4 demo 的官方 PostCSS parity 验证链路，并支持 `generator: false` 关闭内置生成器但保留小程序 CSS、模板和 JS 转译。** [`a300a00`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a300a000b094ca138d2348568c9dd378b4779f4e) by @sonofmagic
  - 同时让小程序端 Tailwind v4 主题颜色跟随当前安装的 Tailwind 包解析，避免内置静态颜色表与官方输出漂移。

- 🐛 **修复 Vite serve 下快速连续源码变更可能丢失最新 Tailwind v4 class 候选的问题，并稳定 Taro H5 watch-HMR 回归中的源码 DOM 替换校验。** [`969229f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/969229f2935ef3c081628eb63ff68467766a9869) by @sonofmagic

- 🐛 **修复 Vite 小程序样式注入在显式 root `outputFile` 存在时，误把其它根样式文件也当作主样式注入目标的问题，避免 `@layer` 或非标准根样式文件干扰输出归属。** [`382b628`](https://github.com/sonofmagic/weapp-tailwindcss/commit/382b628b9df02dd8a8942706ca73c62b20b456f2) by @sonofmagic

- 🐛 **修复 Vite 开发模式下 source candidate 追加式 HMR 在多个 CSS module 同时更新时，新增样式可能被非主样式模块提前消费的问题，并让 watch 回归用例避开对 uni-app H5 supplemental CSS 注入时序的误判。** [`09c0523`](https://github.com/sonofmagic/weapp-tailwindcss/commit/09c052385cd6b60f39e64ab1b7b2394ffdd49297) by @sonofmagic

- 🐛 **修复 `jsPreserveClass` 在 `alwaysEscape` 模式下不生效的问题，确保用户显式保留的业务或第三方 class 不会被 JS 转译改写。** [`38c207c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/38c207c2a78603ebb16040c74c729241f14a9879) by @sonofmagic

- 🐛 **修复 Vite `cssEntries` 与 `rem2rpx` 场景下，uview-plus 等第三方库已编译样式可能因 root/scoped 去重误判而丢失实际使用声明的问题。** [#973](https://github.com/sonofmagic/weapp-tailwindcss/pull/973) by @sonofmagic
  - 同时修复 uni-app Vite watch 增量构建中根小程序样式输出可能被当作源码入口解析，导致 `app.wxss` 等输出样式无法正确重放的问题。

- 🐛 **修复 Tailwind CSS v4 显式 `source(none)` 入口仅包含 `@source not ...` 时，Vite source scan 误退化为全仓扫描的问题，避免生成范围超出入口声明。** [`e708e92`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e708e92524b18a42a67fa14c2dcf57ed213508e7) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 CSS macro 入口在初次 source scan 后无法复用增量生成缓存的问题，避免后续新增 candidate 时退回全量生成。** [`1227395`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1227395cf94a696ac4a51da72d79ddaa7225da9a) by @sonofmagic

- 🐛 **修复 Webpack/Taro/Mpx 的 Tailwind CSS v4 `cssEntries` 输出归属判断，避免页面样式误保留主入口 preflight，同时保留主入口哈希样式产物的小程序 preflight。** [#973](https://github.com/sonofmagic/weapp-tailwindcss/pull/973) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 入口样式的 `@source inline(...)`、`@source not inline(...)` 与 `@import "tailwindcss" source(none)` 识别，提升多入口/分包样式生成时的源文件匹配稳定性。** [`f02b3a7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f02b3a783515b00f5f93d908f18453f1551cdb3e) by @sonofmagic

- 🐛 **优化 Vite Web/WebCompat 生成性能：显式 `target: "web"` 不再在开发态额外默认执行 WebCompat，HMR 默认支持所有 target 的新增候选增量追加，WebCompat 增量路径只转换新增 CSS 片段，并减少 Web target 下不必要的 classSet 与用户 CSS 规则扫描。** [`2e19348`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2e193482712b7fb245ec03e9a22044fa2e728008) by @sonofmagic
  - 新增 `generator.hmr.preserveDeletedCss` 配置，默认 `true` 以启用高性能 HMR；设置为 `false` 时开发态源码 HMR 会全量再生成 CSS，从而不保留已删除 class 的旧 CSS。正式 build 始终保持精确输出。
- 📦 **Dependencies** [`c0565ad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c0565ad2dad6adf2420348e5a490a763e853721c)
  → `@weapp-tailwindcss/postcss@3.1.9`

## 5.1.9

### Patch Changes

- 🐛 **将小程序样式中不支持的非本地 `@import` 清理逻辑下沉到 PostCSS Root 级工具，并在 Vite HMR 注入路径复用同一次 CSS AST 解析来完成 import 清理和依赖收集，减少重复 parse。** [`b2cbe21`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b2cbe214e3958cb5febf3a46ba0c4b14af76c27b) by @sonofmagic
- 📦 **Dependencies** [`b2cbe21`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b2cbe214e3958cb5febf3a46ba0c4b14af76c27b)
  → `@weapp-tailwindcss/postcss@3.1.8`

## 5.1.8

### Patch Changes

- 🐛 **内部按框架与打包器拆分插件分支，保持 `WeappTailwindcss` 与 PostCSS 公开入口不变。** [#969](https://github.com/sonofmagic/weapp-tailwindcss/pull/969) by @sonofmagic
  - `weapp-tailwindcss` 现在会在 Vite、Webpack、Gulp 入口提前解析 app type / bundler 分支，并进入对应 `frameworks/*` 插件工厂。uni-app Vite、uni-app x Vite、Taro、MPX、weapp-vite 与原生 Gulp 链路拥有直观的目录边界，uni-app x Vite 的额外插件组合也只保留在自己的框架分支中，降低单个框架改动影响其它打包器的风险。
  - `@weapp-tailwindcss/postcss` 增加 CSS 处理分支解析，将普通小程序、Web、`uni-app-x-css-webview` 与 `uni-app-x-css-uvue` 兼容处理拆到独立目录，避免平台兼容逻辑继续散落在通用 handler 中。
  - PostCSS 内部进一步拆出 `frameworks/*` 策略层与无框架语义的 style target profile：Taro、MPX、uni-app、uni-app x、weapp-vite 等框架先进入各自 strategy，再显式选择 `mini-program`、`web` 或 uni-app x 专属 CSS target，方便后续按框架扩展不同处理顺序，同时用互斥测试锁住“不执行其它框架后处理”的边界。
  - 新增 `@weapp-tailwindcss/hbuilderx-runner`，沉淀 HBuilderX CLI 本地运行能力。它负责解析正在运行的 HBuilderX 或 `HBUILDERX_CLI_PATH`、封装项目 open/close/launch、统一超时和进程树清理，并把项目识别错误、配置加载失败、Android/iOS/Harmony 工具链缺失等常见失败归类成可诊断错误，供 HBuilderX e2e 与后续 demo/CLI 脚本复用。
- 📦 **Dependencies** [`46ef156`](https://github.com/sonofmagic/weapp-tailwindcss/commit/46ef156233bc756de23df019272afbaf83785c8d)
  → `@weapp-tailwindcss/postcss@3.1.7`

## 5.1.7

### Patch Changes

- 🐛 **修复 Tailwind CSS v4 入口 CSS 中 `@layer base` 和普通 CSS 的 `wx-button`、自定义标签等裸选择器规则在 Webpack/Vite 小程序构建产物中被裁剪的问题，并补充 Taro、uni-app、MPX、weapp-vite 回归覆盖。** [#965](https://github.com/sonofmagic/weapp-tailwindcss/pull/965) by @sonofmagic

- 🐛 **修复 uni-app x 运行到 Web/H5 时 `.uvue` 模板类名未经过安全选择器转译，导致 Tailwind CSS v4 任意值样式不生效的问题；同时补充 Web 端组件默认边框重置，避免 Tailwind v4 preflight 与 uni-app x Web 运行时基础样式叠加后出现黑框；修正 Vite dev CSS HMR module 的生成判断，避免普通组件样式重复生成 Tailwind CSS；并补充 webpack/Mpx 场景下主 CSS 入口重复落入页面样式资产时的保护。同步更正 uniAppX 文档配置注意项。** [#967](https://github.com/sonofmagic/weapp-tailwindcss/pull/967) by @sonofmagic

## 5.1.6

### Patch Changes

- 🐛 **修复 Tailwind v4 运行时候选收集对裸 `@apply` 的误判，要求 scoped/CSS module 场景通过 `@reference` 或 utilities 上下文显式声明依赖。** [`32ba3f3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/32ba3f3c789ca8f2b0db3c06f8221a36d1bcb5d1) by @sonofmagic

- 🐛 **修复 uni-app Vite App WebView 下 Tailwind v4 主入口样式未注入根 CSS、并可能重复出现在页面 CSS 的问题。** [`27eb27c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/27eb27c230754d9147f291f3449c5d5dd77e988d) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 小程序与 generator 产物中 `--tw-gradient-position` 仍保留 `in oklab` 等现代插值语法的问题，统一降级为小程序/WebView 兼容的渐变方向值。** [`ed75e33`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ed75e33c4342c98b198d60107c1bca13cbb8b607) by @sonofmagic

- 🐛 **将 `legacy-web` Web 兼容预设明确收敛到 Chrome 91 / AppleWebKit 537.36 基线，并补充现代 `rgb()` / `hsl()` 空格斜杠颜色语法降级，确保 `webCompat` 与 uni-app App WebView safe selector 产物保持可用。** [`abbcdf7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/abbcdf72edc5615965e46be0b3d8af3ac78887d1) by @sonofmagic
- 📦 **Dependencies** [`81450d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/81450d897a44e58cb7104fbe7c6d30a445ef76a7)
  → `weapp-style-injector@1.0.1`, `@weapp-tailwindcss/postcss@3.1.6`

## 5.1.5

### Patch Changes

- 🐛 **在 `weapp-tailwindcss` 主配置中新增 `styleInjector`，默认关闭。启用后会内置复用 `weapp-style-injector` 的样式入口注入能力，并在 Vite/Webpack 中按 `appType` 自动选择 uni-app、Taro、Mpx 或通用预设；当主插件通过 `disabled: true` 或 `disabled: { plugin: true }` 关闭时，样式注入也会同步关闭。** [`747dcf3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/747dcf34a1cf77a14b859ee86f537ce2cd89bddd) by @sonofmagic
  - 同时修复 `@weapp-tailwindcss/postcss` 中 `Px2rpxOptions` 在 NodeNext 类型解析下无法正确导出的声明问题。
  - `weapp-tailwindcss` 直接复用 `weapp-style-injector` 的现有实现，避免在主包内重复维护样式注入逻辑，同时保持 `weapp-style-injector` 原有独立入口不变。

- 🐛 **修复 Nuxt Web Vite demo 中页面入口没有实际渲染 `app/pages/index.vue`，导致开发态修改页面上的 Tailwind 类名（如 `bg-white` 改为 `bg-[red]`）看不到效果的问题；同时在 Web source HMR 时刷新 Tailwind source candidates，收窄 Nuxt 页面宏 full reload 判断，避免普通 Web source HMR 被误判为需要整页刷新，并补充 `demo/web` 真实浏览器 HMR 回归覆盖。** [`fd8c34d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/fd8c34d363fa847f50ccb5e23074ee0ce6eb4387) by @sonofmagic

- 🐛 **修复 uni-app H5 Vite 开发态中 Tailwind v4 类名改动只更新 CSS、不继续触发 Vue 页面模块 HMR 的问题。** [`8d4ac8d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8d4ac8d03ba2d6f813b41004adc15a81a9403d83) by @sonofmagic

- 🐛 **修复 Web target 下 Vite Vue SFC 作为 Tailwind source candidate 更新时，插件返回 CSS HMR 模块覆盖 Vue SFC 自身 HMR 结果的问题。** [#956](https://github.com/sonofmagic/weapp-tailwindcss/pull/956) by @sonofmagic

- 🐛 **移除 `@ast-core/escape` 直接依赖，改为在 `weapp-tailwindcss` 内部维护 JS 字符串字面量转义逻辑，减少发布包运行时依赖与 webpack 缓存依赖解析噪声。** [`4873962`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4873962435af8615cb2670237d1865d47db8b361) by @sonofmagic
- 📦 **Dependencies** [`747dcf3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/747dcf34a1cf77a14b859ee86f537ce2cd89bddd)
  → `@weapp-tailwindcss/postcss@3.1.5`, `weapp-style-injector@1.0.0`

## 5.1.4

### Patch Changes

- 🐛 **修复 `uni-app-vite` 自动推断后错误缩窄 `cssPreflight` 和 `cssSelectorReplacement.root` 的问题，恢复小程序端默认的 `view,text,::after,::before` 与 `:host,page,.tw-root,wx-root-portal-content` 选择器输出，并补充回归测试。** [`218c965`](https://github.com/sonofmagic/weapp-tailwindcss/commit/218c9656b4b2fe9b4e8a64d5c5ecb3fb6b23ab61)

- 🐛 **修复 uni-app-vite 小程序端在 Tailwind CSS v4 场景下对 `@layer base` 的误判警告，提前清理 mini-program CSS 中的 cascade layer 语法，并补充对应回归测试。** [`8b98c43`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8b98c4361680bcc51d192dbbdd126842c45d5db1)

- 🐛 **修复 Mpx `wx` 构建下 Tailwind CSS v4 条件 custom variant 的平台识别，确保 `#ifdef MP-WEIXIN` 分支生成微信端样式，并补充 uni-app、Taro、Mpx、uni-app x 的模板 Tailwind 写法回归覆盖。** [`cad1497`](https://github.com/sonofmagic/weapp-tailwindcss/commit/cad149713a471468b0af5928e23cfb8610d83c9a)

- 🐛 **新增 Tailwind CSS 指令 AST 分析工具，并让生成 CSS 入口复用该分析能力，减少重复解析 CSS 字符串的开销。** [`90dc9ca`](https://github.com/sonofmagic/weapp-tailwindcss/commit/90dc9ca048fb28aa913033dc0bb80d06ce85d70c)

- 🐛 **将本地 CSS `@import` 的分析、拆分、清理和输出路径重写逻辑下沉到 `@weapp-tailwindcss/postcss`，并新增可复用的 PostCSS Root 级 API。** [`d789492`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d7894923e84d8649065da5ec8ff29eaee26aa340)
  - `weapp-tailwindcss` 的 Tailwind v4 生成 CSS 管线现在会复用同一次 CSS AST 解析结果处理本地 import wrapper、纯 import shell 和 import 拆分，减少重复 `postcss.parse(css)` 开销。

- 🐛 **修复 Web 兼容模式下 Tailwind CSS v4 的渐变变量与 @property 处理，避免 H5 渐变失效，并补充 uni-app、taro、mpx、uni-app x 等场景的回归测试。** [`5540608`](https://github.com/sonofmagic/weapp-tailwindcss/commit/554060826b4e5f073a075f18f559f77b72d4fd0e)

- 🐛 **修复 Taro Vite 小程序构建中同名或匿名 CSS 产物乱序时，页面普通 CSS 与 Tailwind v4 生成 CSS 可能被写入错误分包样式文件的问题。** [`9298f69`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9298f694382cf24941c8a3bc371c67b6ed3054dc)

- 🐛 **修复 Web 兼容模式下 Tailwind CSS v4 的 `@property` 初始值与现代颜色降级处理，确保开启 `webCompat` 后仍保留现代浏览器的最终展示效果，同时为旧 WebView 提供可用 fallback。** [`36b1822`](https://github.com/sonofmagic/weapp-tailwindcss/commit/36b182251090a980b1a60ff5752a301a3d0e0fc5)
- 📦 **Dependencies** [`0e08dac`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0e08dacbe3de03a83a5c7b675adffaf6d0e81e3f)
  → `@weapp-tailwindcss/postcss@3.1.4`, `tailwindcss-config@2.0.1`

## 5.1.3

### Patch Changes

- 🐛 **修复 Taro webpack5/Vite + Tailwind v4 多 `cssEntries` 场景下，`mainCssChunkMatcher` 宽匹配导致页面或独立分包样式错误复用主样式入口的问题。** [`de82f2f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/de82f2fbe3304474b1cc02ad5f74691eb1b645d1) by @sonofmagic

- 🐛 **本次发布整理了从 `5.1.2` 之后的主要变更：修复 Tailwind v4 多 `cssEntries` 场景下的主样式误匹配与分包样式映射问题，补齐 Taro webpack5/Vite、Rspack、H5/web 兼容与平台环境支持，并同步修复主题过渡的首帧闪烁问题。** [`64faef4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/64faef437046ca1b3f438a2e55d101895500f7a5) by @sonofmagic

- 🐛 **修复 Vite 构建中 Tailwind CSS v4 显式 `cssEntries` 的分包样式映射，避免普通分包样式漏生成或被注入主包样式产物。** [#952](https://github.com/sonofmagic/weapp-tailwindcss/pull/952) by @sonofmagic

- 🐛 **新增 `weapp-tailwindcss/rspack` 导出入口，提供 Rspack 配置修补能力，用于在 Rsbuild/Rspack 中注入 Tailwind v4 CSS 生成 loader，并默认保留 Lightning CSS loader。** [`6937777`](https://github.com/sonofmagic/weapp-tailwindcss/commit/6937777a052cba6b4a79518d35d222b72703db39) by @sonofmagic
- 📦 **Dependencies** [`64faef4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/64faef437046ca1b3f438a2e55d101895500f7a5)
  → `@weapp-tailwindcss/postcss@3.1.3`

## 5.1.2

### Patch Changes

- 🐛 **修复 uni-app Vite 产物阶段可能把 Vue 模板源码当作样式交给 PostCSS 解析的问题，避免动态 `:style` 模板触发 `Unknown word` 报错。** [`cb75ed9`](https://github.com/sonofmagic/weapp-tailwindcss/commit/cb75ed92e9cbbe1b5c1f94a717b7191b96f26377) by @sonofmagic

- 🐛 **新增 Web 端 Tailwind CSS v4 产物兼容降级配置，可通过 `generator.webCompat` 移除或降级 `@theme`、`@layer`、`@property`、现代颜色函数与相关 `@supports`，以适配更多 Android/iOS WebView 场景。** [`9ce2cd5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9ce2cd590ea2a373f4372d499a10ed8a2d333d0c) by @sonofmagic
- 📦 **Dependencies** [`9ce2cd5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9ce2cd590ea2a373f4372d499a10ed8a2d333d0c)
  → `@weapp-tailwindcss/postcss@3.1.2`

## 5.1.1

### Patch Changes

- 🐛 **增强 Webpack web target 最终 CSS asset 的保留逻辑，避免重新生成 Tailwind CSS 时丢失无类名选择器、主题变量、字体、媒体查询和第三方组件样式，同时防止 watch 增量更新保留旧的 Tailwind 生成类。** [`c47543c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c47543c4de40e91f33a689d6f6e41c7c8218860b) by @sonofmagic

- 🐛 **修复 Taro Webpack 入口同时引入多个 CSS 时，已由 loader 生成的主样式被再次生成并导致自定义样式重复的问题；同时保留 webpack/css-loader 已处理的静态资源 URL，避免背景图等相对资源路径在合并 CSS 时退回为未打包的裸路径。** [#945](https://github.com/sonofmagic/weapp-tailwindcss/pull/945) by @sonofmagic

- 🐛 **新增 Vite 构建下的 `transform.include` / `transform.exclude` 配置，用于控制需要进入 `weapp-tailwindcss` HTML/CSS/JS 转译流程的源码或产物，并在 JS AST 转译耗时异常时提示可排除大型生成 TS/JS chunk。** [`56f1f40`](https://github.com/sonofmagic/weapp-tailwindcss/commit/56f1f40120d5a8c4ede61b6e6a5fc43b36964070) by @sonofmagic

- 🐛 **修复 Webpack web target 使用 Tailwind CSS v4 cssEntries 重新生成样式时，最终 CSS asset 中的 Docusaurus 主题样式和用户自定义样式被丢弃的问题。** [`fd2a9b7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/fd2a9b752ba7d14d91a096adce6fd89a649c0a4c) by @sonofmagic
- 📦 **Dependencies** [`ddcb7c8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ddcb7c82d00a06be462c13b7d11d4367c1b1091e)
  → `@weapp-tailwindcss/postcss@3.1.1`

## 5.1.0

### Minor Changes

- ✨ **移除 Rax 框架兼容支持，不再提供 `appType: 'rax'` 类型、Rax 依赖识别和 `src/global.css` 隐式入口探测。** [`3d04bcf`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3d04bcf6e538eb8ebe7ef27efd00de2280064995) by @sonofmagic

- ✨ **移除 `generator.target: "tailwind"` 生成目标，生成目标仅保留 `weapp` 与 `web`。需要原始 Tailwind Web CSS 时请使用 `generator.target: "web"`。** [`076152e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/076152e4cb73acbf9294c044942bf277559928f8) by @sonofmagic

- ✨ **移除 Tailwind CSS v3 兼容链路，后续生成、运行时与小程序 CSS 处理统一面向 Tailwind CSS v4。** [`d9be474`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d9be474f9f6f205a78f5057421e990a5004a6474) by @sonofmagic

- ✨ **Tailwind CSS v4 入口现在必须来自独立的 `.css` 文件，例如在 `app.css` 中写入 `@import "tailwindcss";`。不再支持把 Tailwind v4 根入口写在 `.scss`、`.less` 等预处理器文件或 Vue SFC 的 `<style>` 块中，也不再消费 inline `tailwindcss.v4.css` 作为根入口。** [`6f79918`](https://github.com/sonofmagic/weapp-tailwindcss/commit/6f79918b3ca70c3ad85399296a5d69e7844624c4) by @sonofmagic

- ✨ **将 `weapp-tailwindcss` 内部的 Tailwind 运行时接入切换为 `@tailwindcss-mangle/engine`，不再依赖 `tailwindcss-patch` 修改 Tailwind 包本身，并移除旧的 `twPatcher`、`createTailwindcssPatcher` 等 patcher 兼容命名，统一使用 Tailwind 运行时对象；同时新增 Tailwind CSS v3/v4 与 Web/H5、小程序、uni-app x Android/iOS/Harmony 的运行时分支路由，并将 Web/H5、小程序、原生 App 与 Tailwind 原样输出拆到独立分支文件，让不同版本和平台走独立判断入口，降低 App 端调整影响 H5 或小程序输出的风险；补齐 Tailwind CSS v3/v4 的源码候选扫描、Vite/Webpack 运行时类集合刷新与相关回归覆盖，并修复运行时候选污染时 WXML/JS 条件表达式里的普通业务字符串被误转义的问题。** [#939](https://github.com/sonofmagic/weapp-tailwindcss/pull/939) by @sonofmagic

- ✨ **Vite 与 Webpack5 生成链路收敛为 Tailwind CSS v4 优先的 CSS-first/loader-first 管线，入口仍保留 `weapp-tailwindcss/vite` 与 `weapp-tailwindcss/webpack`。新管线要求使用 Tailwind CSS v4，并建议通过显式 CSS entry 或 `tailwindcss.v4.cssEntries/cssSources` 声明样式来源；不再依赖旧的隐式 CSS source 推断、Webpack 末端补偿生成或历史 MPX 专用 loader 排序兜底。** [`cff9ad4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/cff9ad4d4b076933d017981e5364692915d2dc28) by @sonofmagic

### Patch Changes

- 🐛 **新增实验性 OXC JS 转译快路径，在关闭 source map 且不涉及模块图、模块替换、ignore 语义和任意值兜底时，可通过 `experimentalJsFastPath: 'oxc'` 尝试使用 `oxc-parser` 加速纯字面量转译；不满足条件、运行环境低于 `oxc-parser` 支持范围或无法加载 OXC 时会自动回退到 Babel。该快路径保持可选加载，不会影响 Node.js 18 的默认 CommonJS 使用，并减少遍历期间的临时对象分配。** [#938](https://github.com/sonofmagic/weapp-tailwindcss/pull/938) by @sonofmagic

- 🐛 **补全面向 demo 的热更新回归覆盖，修复 Vite watch 下样式源刷新不及时的问题，并调整 Taro Web/H5 与 Webpack demo 的 HMR 断言，使小程序端、H5 端、正常开发和热更新场景都能稳定通过。** [#935](https://github.com/sonofmagic/weapp-tailwindcss/pull/935) by @sonofmagic

- 🐛 **修复 Webpack web target 下 Tailwind CSS v4 入口 CSS 会被 css-loader 提前展开为 `@media source(none)`，导致文档站生产构建丢失大量样式的问题。** [`0219ec9`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0219ec9dad4f32a25bf2259736fd313f39eff1b0) by @sonofmagic

- 🐛 **修复 Webpack web target 在开发态首轮构建中扫描已打包 JS/HTML 导致文档站卡在 92% asset processing 的问题，并确保显式 Tailwind CSS v4 入口在生产与开发构建中都能生成完整工具类样式。** [`dfd9be8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/dfd9be8c88412ac12908170ee65c091cb17b6fa9) by @sonofmagic

- 🐛 **修复 Vite HMR 局部增量构建中缓存 hash 记录持续累积的问题，限制全局 compiler context 缓存的长期驻留规模，并为 watch/HMR 与 CI 流程补充内存报告和内存守卫，便于提前发现内存异常。** [`4d5447c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4d5447cf49be20126691e36d53a41f370383398d) by @sonofmagic

- 🐛 **Vite 集成不再默认替换 Taro 注入的 `postcss-html-transform`，保留 `@tarojs/plugin-html` 自身的样式转换行为。** [#938](https://github.com/sonofmagic/weapp-tailwindcss/pull/938) by @sonofmagic

- 🐛 **修复 Webpack web target 下已生成的 Tailwind CSS v4 产物会丢失官方 layer 声明的问题，并增加 core、Vite、Webpack、Gulp 与官方 PostCSS/Vite 产物一致性的回归测试。** [`a4d7330`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a4d7330d1866e9c17119dd6ae976ba1142c50801) by @sonofmagic

- 🐛 **优化 Tailwind v3/v4 增量生成缓存的内存占用：隔离 CSS 源可复用增量缓存，同时超出候选数或 CSS 字节上限的大型生成结果不再进入长期缓存，避免 HMR 中保留无效的大型 Tailwind context。** [`318e3f6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/318e3f6b21f5f31ea9f840538ce836d0e914a839) by @sonofmagic

- 🐛 **移除 `@weapp-tailwindcss/postcss` 中 Tailwind CSS v3 相关的版本探测、显式 `version` 配置、v3 fixture 与 benchmark 基线。** [`1dc7b97`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1dc7b9766df9ab218e1eedb0eec392e4d0a7f515) by @sonofmagic
  - PostCSS 生成插件现在固定按 Tailwind CSS v4 CSS-first 流程处理。仅包含 `@apply` 的局部 CSS 会在内部注入 Tailwind v4 `@reference` 上下文并跳过自动源码扫描，不再依赖旧的 v3/v4 分支判断。
- 📦 **Dependencies** [`1dc7b97`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1dc7b9766df9ab218e1eedb0eec392e4d0a7f515)
  → `@weapp-tailwindcss/postcss@3.1.0`

## 5.0.13

### Patch Changes

- 🐛 **新增 `weapp-tailwindcss/framework` 工具入口，用于判断当前项目是 MPX、Taro、uni-app、uni-app x、uni-app Vite 还是 weapp-vite。检测逻辑支持 package.json、manifest.json、HBuilderX 运行目录以及 `UNI_PLATFORM`、`UNI_UTS_PLATFORM`、`TARO_ENV`、`MPX_CLI_MODE` 等环境变量。** [`cc966fa`](https://github.com/sonofmagic/weapp-tailwindcss/commit/cc966fa07dee0adce865d484a4ecb132b5c8c0ef) by @sonofmagic
  - Vite 插件的自动 `appType` 推断现在复用同一套检测逻辑，并补充 uni-app x 依赖标记识别。

- 🐛 **调整 Tailwind CSS v4 渐变工具类的小程序兼容策略，默认保留 `--tw-gradient-*` CSS 变量链路，覆盖 `background-image` 文档中的 linear、radial、conic、任意值、自定义属性、stop 颜色与位置等组合。** [`d3487a1`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d3487a1b669bb194cdbfa0cd7a412e970b01632d) by @sonofmagic
  - 新增 `cssOptions` 作为统一的 CSS 生成与兼容后处理微调配置入口，`cssPreflight`、`cssPreflightRange`、`cssChildCombinatorReplaceValue`、`cssPresetEnv`、`autoprefixer`、`atRules`、`injectAdditionalCssVarScope`、`cssSelectorReplacement`、`rem2rpx`、`px2rpx`、`unitsToPx`、`unitConversion`、`platform`、`cssRemoveHoverPseudoClass`、`cssRemoveProperty`、`cssCalc` 与 `tailwindcssV4GradientFallback` 等配置都可以放入该分组。顶层旧字段仍保留兼容并标记为 deprecated；其中 `cssOptions.tailwindcssV4GradientFallback` 显式设置为 `true` 时才追加旧版字面量组合兜底，避免默认产物膨胀并让 v4 渐变行为更接近 Tailwind 官方输出。

- 🐛 **修复 Tailwind CSS v4 渐变位置变量在小程序中的空 fallback 兼容问题。`--tw-gradient-from-position`、`--tw-gradient-via-position` 与 `--tw-gradient-to-position` 会统一输出为带逗号和空格的空 fallback，避免 `var(--tw-gradient-*-position,)` 或缺少 fallback 时导致渐变在微信小程序运行时渲染异常；显式 fallback 仍保持原样。** [`8501c4b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8501c4b2243da8cb0f6fe2d33b22acd84a17d108) by @sonofmagic

- 🐛 **修复 Vite 开发模式下模板类名热更新后，已由 Vite 处理过的 Tailwind CSS 产物可能复用旧样式的问题。现在组件模板新增 `text-[123rpx]` 等任意值类名时，WXML 转译结果和生成的 `wxss/acss` 等样式会同步刷新。** [`81fed5b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/81fed5b83c141372fe7c90061fbdac2cb6478855) by @sonofmagic
  - 同时调整 Vite 样式入口判断，减少对 `app`、`main`、`tailwind`、`app-origin` 等文件名的硬编码依赖，改为优先依据构建图、已记住的 CSS 源、候选集变化和实际输出关系处理。

- 🐛 **修复 Vite 构建与热更新中 Tailwind CSS 输出文件关系推断问题。样式输出后缀改为优先来自构建产物图和真实 bundle 文件名，不再依赖微信小程序 `.wxss` 兜底、平台后缀映射表或 `app`/`main`/`app-origin` 这类固定主样式文件名语义；同时补充分包、JS/TS/JSX/Vue 来源与 Taro/uni-app 非微信小程序构建回归。** [`78a2a06`](https://github.com/sonofmagic/weapp-tailwindcss/commit/78a2a06c3338fd998d1f9381ad5e33026fa0c413) by @sonofmagic

- 🐛 **修复 Vite 场景下页面样式可能重复包含 `app.wxss` 全局规则的问题，并保留分包页面自身的样式产物。** [`6ffaf0a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/6ffaf0af83670190d8cfe5bc3d22a6034622d783) by @sonofmagic

- 🐛 **修复 Vite 生成模式下 Tailwind CSS v4 分包样式入口在支付宝、京东、抖音等非微信小程序端可能被当作已处理 CSS 跳过，导致分包样式产物为空或缺少 `@config` / `@source` 生成结果的问题。** [`61f92ae`](https://github.com/sonofmagic/weapp-tailwindcss/commit/61f92ae4a921b78f8f955bbf094a5ac404195eee) by @sonofmagic

- 🐛 **修复 Webpack Web 目标下最终 CSS 产物被重新处理后覆盖的问题，避免 Docusaurus、Infima 或业务 SCSS 样式在生产构建中丢失。** [`a9c60f7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a9c60f72848b32dbbe6803ef193c8575b5284b30) by @sonofmagic

- 🐛 **统一使用 `mainCssChunkMatcher(name, appType)` 作为主样式匹配配置，移除 `mainCssChunk` 配置入口。默认行为仍然不根据 `app`、`main`、平台后缀或框架类型推断主样式，避免在多小程序、H5、iOS、Android、鸿蒙等输出中产生框架耦合。** [`61f92ae`](https://github.com/sonofmagic/weapp-tailwindcss/commit/61f92ae4a921b78f8f955bbf094a5ac404195eee) by @sonofmagic
- 📦 **Dependencies** [`d3487a1`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d3487a1b669bb194cdbfa0cd7a412e970b01632d)
  → `@weapp-tailwindcss/postcss@3.0.8`

## 5.0.12

### Patch Changes

- 🐛 **修复 Vite、Webpack、Gulp watch/HMR 与 Node.js `createContext` API 长生命周期场景下样式增量生成和构建适配层缓存持续增长的问题，限制 Tailwind 增量缓存、Vite 样式缓存、Webpack 处理缓存与 Gulp 流式处理缓存规模，避免 `transformWxss` 默认反复强制刷新 Tailwind 运行时；同时为 Node.js API 暴露 `ctx.getRuntimeSet()`，让自研构建器可以直接复用 Tailwind 自动提取的运行时类名集合，并为 watch-HMR 与 Node API 回归工具补充 RSS/heap 内存监控和预算守卫。** [#923](https://github.com/sonofmagic/weapp-tailwindcss/pull/923) by @sonofmagic
  - 修复 weapp-vite 配置 `srcRoot` 后，Vite CSS pipeline 会额外生成 `miniprogram/app.wxss`、`miniprogram/sub-normal/pages/index.wxss` 等源码根前缀产物的问题，并避免独立分包样式被主包或普通分包候选污染。
  - 升级 `tailwindcss-patch` 到 `9.4.4`，并重新生成 generator mode 的 CSS 输出对比快照，确保升级后的构建报告仍保持独立 CSS 文件边界。
  - 修复 `resolveTailwindV3Source({ configObject })` 没有真正使用内联配置的问题，避免 Node.js API 和 generator parity 场景在不同工作目录下误读磁盘 Tailwind 配置。

## 5.0.11

### Patch Changes

- 🐛 **修复 Vite/Rolldown 产物回放 CSS 时直接向 `bundle` 新增资源导致 HMR 报错的问题，改为优先通过 `emitFile` 发射资源，兼容 Vite 8、Rolldown 与 Rollup。** [`41c9d77`](https://github.com/sonofmagic/weapp-tailwindcss/commit/41c9d776ec9f1f787e9a5c7ae50f547ccb4dad56) by @sonofmagic

## 5.0.10

### Patch Changes

- 🐛 **修复 `:where(.dark, .dark *)` 等多分支选择器展开后丢失通配符后代分支的问题，确保小程序端会生成对应的 `view` / `text` 后代选择器。** [#920](https://github.com/sonofmagic/weapp-tailwindcss/pull/920) by @sonofmagic
  - 修复 Taro demo 的 `dev:harmony` 脚本未显式开启 HMR timing 输出的问题，确保 Harmony 别名脚本与实际 watch 脚本行为一致。

- 🐛 **为 demo 补充亮色、系统暗色与 `.theme-dark` 手动暗色示例，并增加 H5 与小程序 IDE 视觉回归，避免手动暗色模式退回小程序不兼容的复杂选择器。** [#918](https://github.com/sonofmagic/weapp-tailwindcss/pull/918) by @sonofmagic

- 🐛 **补充浅色/深色模式与 watch HMR 的回归覆盖，确保 Taro、uni-app 等场景在热更新后正确生成小程序样式。** [#919](https://github.com/sonofmagic/weapp-tailwindcss/pull/919) by @sonofmagic
- 📦 **Dependencies** [`2d3d5ca`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2d3d5ca36df873b941baddfcdb0134965bc62f94)
  → `@weapp-tailwindcss/postcss@3.0.7`

## 5.0.9

### Patch Changes

- 🐛 **将 `weapp-tailwindcss` 中生成型 PostCSS 插件、PostCSS 辅助扫描逻辑和 `css-macro/postcss` 转换入口迁入 `@weapp-tailwindcss/postcss`，主包保留兼容转发入口，方便后续统一维护 PostCSS 能力边界。** [#914](https://github.com/sonofmagic/weapp-tailwindcss/pull/914) by @sonofmagic
- 📦 **Dependencies** [`d13bd91`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d13bd91f0d59118d4a2df01e8d3ec69eccb473f0)
  → `@weapp-tailwindcss/postcss@3.0.6`

## 5.0.8

### Patch Changes

- 🐛 **generator 的 Tailwind CSS v3 路径会优先复用 tailwindcss-patch 提供的 raw 生成引擎，并在旧版本依赖下保持原有回退逻辑。** [`14ea5e9`](https://github.com/sonofmagic/weapp-tailwindcss/commit/14ea5e918d6820fb9b24fcba21d1772f6eab6f5a) by @sonofmagic

- 🐛 **修复小程序 CSS 产物中仅含注释或已被清空的 `@media` 块未被移除的问题，避免微信开发者工具在 WXSS 编译时报 `unexpected token }`。同时同步 watch-HMR 的 Taro React v4 H5 脚本断言和 issue33 性能预算覆盖逻辑。** [#912](https://github.com/sonofmagic/weapp-tailwindcss/pull/912) by @sonofmagic

- 🐛 **修复 Taro Webpack 开发态下 Tailwind CSS v4 入口样式的所有权判断：当 `src/app.css` 已经由 webpack loader 生成过样式时，`app.wxss` 不再重复走 Tailwind 生成链路，避免 `cssEntries` 场景中同一个工具类被输出两次。** [#912](https://github.com/sonofmagic/weapp-tailwindcss/pull/912) by @sonofmagic

- 🐛 **修复 Tailwind CSS v3 生成器在临时项目或 CI 环境中无法从项目目录解析 Tailwind v3 内部模块时失败的问题。** [`63968d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/63968d83388ba2285fa87150a2bd45b565c42a53) by @sonofmagic

- 🐛 **升级 `tailwindcss-patch` 到 `9.4.3`，并让 `tailwindcss-patch` token/style 示例复用上游统一的候选提取与 v4 样式生成 API，减少本地重复编排逻辑。** [#912](https://github.com/sonofmagic/weapp-tailwindcss/pull/912) by @sonofmagic
- 📦 **Dependencies** [`4e9d664`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4e9d66437832957a39bb1966a2c352a0e8a6e49e)
  → `@weapp-tailwindcss/postcss@3.0.5`

## 5.0.7

### Patch Changes

- 🐛 **新增可选的 CSS token 来源追踪能力，开启后会在输出样式中标注工具类来自的源码文件，便于排查 demo 与快照中的多余样式。** [`9cf24ea`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9cf24eaabf73c368c91ecdda7f1661b8bf0945d2) by @sonofmagic

- 🐛 **修复 uni-app Vite 开发模式下 Tailwind CSS v4 热更新后主样式没有同步注入 `app.wxss` 的问题，避免 `text-[338rpx]` 等新增任意值类名在小程序端不生效。** [`7827f47`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7827f4715afd4c81601de0062937e1843a48df48) by @sonofmagic

- 🐛 **修复 uni-app Vite 开发模式下入口 CSS 热更新 replay 后没有同步写入 `app.wxss` 的问题，确保连续修改 `text-[102.43rpx]` 等任意值类名时小程序主样式立即更新。** [`6487443`](https://github.com/sonofmagic/weapp-tailwindcss/commit/64874439019319b9a8eabc5bceaab4445a19c0a7) by @sonofmagic

- 🐛 **修复 webpack web target 下 Tailwind CSS v4 入口被路径匹配后没有继续扫描显式 `@source` 的问题，避免 `sr-only`、`rounded-full` 等只出现在源码中的工具类漏生成。** [`951092e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/951092ecb8093114112ca5c7fea26d7e95830a36) by @sonofmagic
- 📦 **Dependencies** [`92c822e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/92c822eb29be8ad3571bb0a7fc27327e6defb19c)
  → `@weapp-tailwindcss/postcss@3.0.4`

## 5.0.6

### Patch Changes

- 🐛 **修复 Tailwind CSS v4 入口中包含块状 `@plugin` 等生成指令时，小程序 CSS 生成阶段可能把原始指令片段透传到 wxss 转译链路并触发 `Unclosed block` 的问题。** [`0e29d78`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0e29d7851f7596e0b41086472ff00fb0fee5abd3) by @sonofmagic

## 5.0.5

### Patch Changes

- 🐛 **修复 Vite 构建中同名分包样式源可能匹配错误的问题，并避免 Tailwind CSS v3 在隔离分包样式生成时复用增量缓存导致样式串包。** [`bdd7e90`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bdd7e900a1b6152b9c798c253b7d7a4ce8ffbce1) by @sonofmagic

- 🐛 **修复 uni-app x Tailwind CSS v4 场景下 `uvue.wxss` 默认 `border-width: medium` 覆盖 Tailwind preflight 后导致的异常黑边问题。** [`65f084b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/65f084ba30ad8a0b4c36ce46e567d2e1b1490b64) by @sonofmagic

- 🐛 **修复 uni-app x App 端构建中，Vite/uni 已转换为 CSS module JS 导出的样式模块再次进入样式处理链路，导致 Android/iOS 产物被二次 PostCSS 处理的问题。** [`e967204`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e9672049aebb58bd8f37520b5720399bf521767f) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 小程序样式输出：普通小程序端保留 `box-sizing`、`margin`、`padding`、`border` preflight reset，避免 Taro Vite 的 `app-origin` 样式重复注入主样式，并去重合并后的 hoisted preflight 声明。** [`4b2ed64`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4b2ed643d8b62f1c9e7a81c77a0e583444e6f9db) by @sonofmagic

- 🐛 **修复 Vite 开发构建中 CSS 源码回滚后，旧的 Vite CSS bundle asset 覆盖最新 transform 结果，导致样式没有恢复到最新内容的问题。** [`74b1605`](https://github.com/sonofmagic/weapp-tailwindcss/commit/74b1605d23e2936329629b5fb731eeaf7509c13a) by @sonofmagic

- 🐛 **修复 Vite/Rolldown 产物回放 CSS 时直接写入 bundle 的兼容问题，改为优先通过 emitFile 发射资源，避免 Rolldown 忽略回放样式。** [`ead42b6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ead42b6650fc2b21c3d73033e63b22e2605a27aa) by @sonofmagic

- 🐛 **修复 Vite 构建中已由 CSS 管线处理过的 Tailwind CSS v3 分包样式被再次按全局候选重新生成，导致普通分包和独立分包样式互相串入的问题。** [`d7562ae`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d7562ae1887844effb0f7b1c3c75ba7b75de17b1) by @sonofmagic
- 📦 **Dependencies** [`65f084b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/65f084ba30ad8a0b4c36ce46e567d2e1b1490b64)
  → `@weapp-tailwindcss/postcss@3.0.3`

## 5.0.4

### Patch Changes

- 🐛 **将 uni-app-x 的 Vue compiler 依赖改为按需加载并从主运行时打包中外置，减少构建 warning 与普通 Vite 入口体积。** [`56540cf`](https://github.com/sonofmagic/weapp-tailwindcss/commit/56540cfb5b5a6e527088c3d7c68bf1c1220284c4) by @sonofmagic

## 5.0.3

### Patch Changes

- 🐛 **升级 templates 到最新 weapp-tailwindcss，并补充模板多端构建回归用例。** [`3114831`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3114831ce5680303d158a7ca8cf21ad5e07fd67e) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 的 `rounded-full` 在小程序端生成 `calc(infinity * 1px)` 后无法稳定生效的问题，统一归一化为小程序可解析的 `9999px`。** [`84c1c02`](https://github.com/sonofmagic/weapp-tailwindcss/commit/84c1c02b66eb4d329a889fd555dae4188e35a227) by @sonofmagic
- 📦 **Dependencies** [`2f41ff5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2f41ff5c5861828b3cafe0a1248c7eecd690cfb7)
  → `@weapp-tailwindcss/postcss@3.0.2`

## 5.0.2

### Patch Changes

- 🐛 **修复小程序端生成样式中的 `:before` / `:after` 输出会被规范化为单冒号，以及 Tailwind preflight 中 `--tw-content: ''` 被错误合并到 `view,text,::after,::before` 基础选择器的问题，确保伪元素内容初始化只作用于 `::before` / `::after`，并补充分包入口样式快照覆盖。** [`206093e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/206093e9878e6f4456bbd72f1a61856abc86fc88) by @sonofmagic

- 🐛 **修复 webpack loader 在 Windows 下可能把 Tailwind 依赖目录注册为文件依赖的问题，避免 MPX 等 webpack watch 场景出现 invalid dependency 警告并导致热更新监听失效；同时补齐 e2e watch 失败时的预算报告输出。** [`53efe01`](https://github.com/sonofmagic/weapp-tailwindcss/commit/53efe0195655e495b61c14ad1878afc0f935b893) by @sonofmagic

- 🐛 **修复 Vite web/generator 模式下自动收集的 Tailwind v4 CSS source 未按源 CSS 文件目录解析相对 `@config` 路径的问题，避免 VitePress 等项目从 Vite root 错误解析配置文件。** [`f8fe9af`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f8fe9aff99a7d82a789dc421c05070f41aebdc08) by @sonofmagic
- 📦 **Dependencies** [`206093e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/206093e9878e6f4456bbd72f1a61856abc86fc88)
  → `@weapp-tailwindcss/postcss@3.0.1`

## 5.0.1

### Patch Changes

- 🐛 **修复 Tailwind CSS 包解析路径：当项目传入自定义 `tailwindcss.resolve.paths` 时，保留这些路径并追加默认查找路径，同时默认路径会包含 pnpm workspace 根目录的 `node_modules`。** [`8150c95`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8150c95f5ccc37754e4ccf72e6ad102bfab19d7e) by @sonofmagic
  - 调整 Tailwind CSS v4 默认入口策略：`weapp-tailwindcss` 默认只依赖并解析 `tailwindcss` 包入口，不再为 v4 自动优先使用 `@tailwindcss/postcss`。

## 5.0.0

### Major Changes

- 🚀 **新增 HBuilderX 直连演示矩阵，覆盖 uni-app Vite Vue 3 与 uni-app x 的 Tailwind CSS v3/v4 场景，并提供 `hbuilderx` preset。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 同时将已由 tsdown 打包进产物、且不需要消费者安装的实现依赖下移到 `devDependencies`。公开导出或运行期加载边界仍保留为正式依赖，例如 `tailwindcss-config` 的 `jiti`，以及 `@weapp-tailwindcss/shared` 对外导出的 `defu`、`get-value`、`set-value`。

- 🚀 **移除 v4 时代“先生成浏览器 CSS 再后处理”的关闭生成器链路，同时删除 `generator` 布尔写法、`mode`、默认 `target`、PostCSS 顶层 `target`、`staleClassNameFallback`、`rewriteCssImports` 与旧 Vite 插件命名。Vite、Webpack、Gulp 与 PostCSS 入口统一由 weapp-tailwindcss 接管 Tailwind CSS 样式生成，默认直接输出小程序 CSS。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🚀 **移除 `tailwindcssPatcherOptions` 中早期的 `patch`、`tailwind`、`features`、`output` 兼容配置形态，仅保留 `tailwindcss-patch` 当前的 `TailwindCssPatchOptions` 配置结构。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 同时删除未接入主转译链路的实验性 SWC/OXC JS handler 入口，避免继续维护无消费方的 POC 代码。

- 🚀 **移除 Webpack4、PostCSS7、Tailwind CSS v2 兼容链路，不再导出 `weapp-tailwindcss/webpack4`，并删除旧包名 `weapp-tailwindcss-webpack-plugin` 的 CLI 别名。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - `pluginName` 现在使用 `weapp-tailwindcss`。如果项目仍依赖 Webpack4、`@tailwindcss/postcss7-compat` 或 Tailwind CSS v2，请继续停留在旧版本。

- 🚀 **统一构建器插件的公开注册名为 `WeappTailwindcss`，移除 Webpack 与 Vite 入口中的旧 `Unified*` 导出别名；同时补齐 `target: 'web'` 场景下 Tailwind CSS v4 website 模式的 CSS 生成与源码扫描行为，避免文档站接入时依赖官方 Tailwind 生成插件。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🚀 **新增 Tailwind CSS v4 生成器公共入口，并提供 PostCSS 插件入口，支持按 `weapp`、`web` 与 `tailwind` 目标生成平台产物。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - Vite 插件支持通过 `generator` 选项启用 Tailwind CSS v4 直接生成链路，`force` 模式会把生成器产物作为主 CSS 真源；PostCSS 插件支持收集本地 `@source` 指向的小程序模板源码，生成更贴近小程序运行环境的 CSS。同步迁移 Tailwind CSS v4 的 Vite 示例到标准 `@import "tailwindcss"` 入口。
  - 新增独立 v5 生成器 demo 与使用示例文档，覆盖 uni-app Vue Vite、Taro Vite 与 Mpx，并保留原有 v4 demo 用法用于历史链路回归。

### Minor Changes

- ✨ **新增 `arbitraryValues.bareArbitraryValues` 配置，默认关闭。开启后会把 UnoCSS 风格裸任意值识别交给 `tailwindcss-patch` v4 引擎处理，例如 `p-10%`、`p-2.5px`、`m-4rem`，小程序侧继续按生成出的 `classNameSet` 精确转义。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 升级 `tailwindcss-patch` 到 `9.3.0`。

- ✨ **优化 `css-macro` 的样式生成方式：宏变体现在不再输出伪 `@media (weapp-tw-platform:...)` 包裹，而是生成内部条件节点，并由内置转换直接产出小程序条件编译注释。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 旧的 `@media (weapp-tw-platform:...)` 宏输出仍会被 `weapp-tailwindcss/css-macro/postcss` 兼容处理，方便存量自定义 PostCSS 流程平滑迁移。

- ✨ **默认启用 v5 样式生成模式，让 Vite、Webpack、Gulp 与 PostCSS 入口在未显式关闭 `generator` 时由 weapp-tailwindcss 接管 Tailwind CSS 样式生成。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- ✨ **默认开启 Tailwind CSS v4 生成模式的 `@import "weapp-tailwindcss"` 兜底识别，并新增 `generator.importFallback` 配置用于显式关闭。该能力用于框架无法完成 `@import "tailwindcss"` 转写时，仍让两种入口产出保持一致。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- ✨ **新增内置 `unitConversion` 配置，支持基于 `postcss-rule-unit-converter` 的任意样式单位转换，并可按 `weapp`、`h5`、`web`、`app` 等平台分别配置转换规则。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- ✨ **新增默认关闭的 `unocss` 兼容配置。开启后会复用 `tailwindcss-patch` 的 Tailwind CSS v4 裸任意值能力，class 字符转义继续沿用现有 `customReplaceDictionary` 链路，同时在文档站补充 UnoCSS 写法兼容章节。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- ✨ **增强 v5 生成器的 Tailwind CSS v4 source 发现能力：PostCSS 插件默认按 CSS 入口目录扫描源码并支持 `@source not` 排除，Vite 生成器路径透传 `tailwindcss.v4.sources` 配置。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 升级 `tailwindcss-patch` 到 `9.2.0`，Tailwind CSS v4 生成器默认扫描编译后的 `@source` 条目，确保 `classSet` 能收集配置文件命中的候选类名。

- ✨ **为 Vite、Webpack、Webpack4 与 Gulp 入口新增推荐的 `WeappTailwindcss` 导出别名，并保留小写 `weappTailwindcss` 用法，方便各构建器使用统一插件注册名称。PostCSS 入口继续使用默认导出。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

### Patch Changes

- 🐛 **修复 `babelParserOptions` 默认开启缓存时的内存膨胀问题：解析缓存键改为哈希后缀，不再直接拼接源码；同时增加缓存条数和源码长度上限，避免大项目把 AST 缓存撑爆。** [`5c1bb9b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5c1bb9bd2b27352be80567c969da4b0ea06e0490) by @sonofmagic

- 🐛 **修复生成产物时误删或漏提取用户自定义的 `@layer components { ... }` 块，导致相关样式没有写入 `app.wxss` 的问题。覆盖纯 CSS 与 Sass/Less fallback 源码中的自定义 layer。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **将小程序 CSS 清理、收尾与兼容处理集中到 `@weapp-tailwindcss/postcss`，主包仅保留兼容导出与构建器编排；同时把实验性的 Lightning CSS 样式处理迁移到 `@weapp-tailwindcss/experimental/lightningcss`。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **清理 `weapp-tailwindcss` 中未接入生产链路的历史残留代码与孤立测试，并移除不再直接使用的 `cac`、`webpack-sources` 依赖。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **默认继续开启 Babel AST 解析缓存，但改为使用源码 hash 生成缓存 key，并新增 `babelParserOptions.cacheMaxEntries` 与 `babelParserOptions.cacheMaxSourceLength` 限制缓存条数和可缓存源码大小，避免大型项目中完整源码 key 与大 AST 长时间驻留导致内存占用过高；仍可通过 `babelParserOptions.cache: false` 显式关闭。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **内置 `css-macro` 的 PostCSS 转换感应逻辑：当 Tailwind CSS v3 配置中注册 `weapp-tailwindcss/css-macro`，或 Tailwind CSS v4 入口 CSS 中声明 `@plugin "weapp-tailwindcss/css-macro"` 时，会自动启用条件编译注释转换，不再要求常规集成手动注册 `weapp-tailwindcss/css-macro/postcss`。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 同时在生成 CSS 裁剪阶段保留由 `css-macro` 产生的 `#ifdef` / `#ifndef` / `#endif` 注释，并同步更新文档与 demo 配置。

- 🐛 **修复 css-macro 在 uni-app 样式条件编译之后才生成条件注释导致错误平台分支残留的问题。现在 Tailwind CSS v3/v4 生成链路会在最终样式输出前按当前平台裁剪 `ifdef` / `ifndef` 分支，避免微信小程序产物保留 `ifndef-[MP-WEIXIN]` 样式。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **升级 ESM 化依赖后，将公开包的 Node.js 安装版本约束统一到 `^20.19.0 || >=22.12.0`，避免不支持稳定 ESM/CJS 混合加载的 Node.js 版本安装使用。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **新增 `splitCandidateTokens` 候选 token 分割入口，并保留 `splitCode` 作为兼容别名。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - `weapp-tailwindcss` 内部的 JS、WXML 动态表达式与 uni-app x 局部样式候选分割改为使用更明确的 `splitCandidateTokens`，继续保持 `classNameSet` 精确命中原则，避免普通字符串被误转义。

- 🐛 **优化 demo 构建与热更新中的 Tailwind 生成链路：Vite/Gulp/Webpack 会更精确地复用源码候选、CSS source 与运行时 class set 缓存，避免 v3 空构建复用上一次非空候选、v4 source 文件变化未进入签名，以及 v3 PostCSS 过早过滤配置类导致的重复生成和漏生成。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **优化 Vite 构建器在 demo 热更新场景下的源候选缓存与 CSS 生成刷新逻辑，避免增量编译反复丢失源码候选或执行不必要的全量任务。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 同时调整 Taro Vite 与 weapp-vite demo 的 watch 验证脚本，默认使用真实原生 watch 增量流程，避免测试脚本重启构建进程或额外执行全量构建导致热更新时间被放大。

- 🐛 **优化 Webpack 与 Gulp demo 的 watch 热更新路径：普通页面、组件、脚本或模板变更复用已有 Tailwind runtime class set 和依赖元数据，仅在 Tailwind 配置、CSS source 或内容依赖变化时重新刷新完整 patcher。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **优化 Tailwind CSS v4 增量生成：新增候选类时仅转换新增 CSS 片段并追加到缓存结果，避免每次热更新都重新转换完整生成 CSS。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **优化 Vite 生成模式在 uni-app watch 场景下的 Tailwind CSS 增量热更新性能，复用底层生成器的新增 CSS 片段并避免重复处理整份历史样式。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v3 在 Vite 增量构建中只使用 source scan 候选集时遗漏当前 bundle 新增类名的问题，避免 WXML 已转义但 WXSS 未生成对应样式。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v3 生成器在 uni-app Vite 热更新中重复清理 Tailwind require cache 导致 wxss 生成缓存失效、增量编译明显变慢的问题。现在 v3 生成器会复用运行时 patch 初始化结果，并在每次生成前主动重置 Tailwind v3 plugin 上下文，避免旧 class 泄漏。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **优化 Vite watch 模式下 Tailwind v4 热更新性能：缓存 source candidates 扫描结果，优先按 `@source`/CSS 入口缩小扫描范围，并复用 Tailwind v4 generator 的增量结果，避免 demo 热更新时反复全量扫描源码和重复生成 CSS。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **优化 Vite、webpack、gulp 开发构建下的热更新路径：复用已有候选集合与 runtime class set，仅在 source 配置或运行时相关内容变化时重新扫描。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Gulp 生成模式在 dev/watch 场景下模板或脚本新增类名后，主 WXSS 复用旧 classSet 缓存导致缺少新增样式的问题。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 修复 Webpack 生成模式在仅 JS 类名集合变化时主 WXSS 可能复用旧缓存的问题，并把稳定的 demo 热更新回归纳入 `pnpm e2e:ci`。
  - 将核心包的大体量内部开发脚本迁移到私有 workspace 项目 `@weapp-tailwindcss/scripts`，发布包内仅保留安装生命周期所需脚本。

- 🐛 **修复小程序生成模式下自定义 `@layer components` 在最终主 CSS 中被追加到 utilities 后面的问题。现在 Tailwind CSS v3/v4 的小程序产物会保留 `.raw-btn`、`.btn` 等用户组件层规则，并在不保留 `@layer` 包裹的前提下把它们排到 utilities 之前。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复小程序最终样式中可能残留 `color-mix`、`oklab`、`oklch`、`lab`、`lch` 与 `display-p3` 颜色函数的问题，能确定的颜色会降级为 `rgb`/`rgba`，避免输出小程序不支持的颜色语法。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Mpx + Tailwind CSS v4 子包 CSS 中相对 `@config` 路径在构建时被错误按项目根解析的问题，保持源码相对当前文件的写法可用。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Webpack 生成模式在 MPX watch/HMR 场景下，仅脚本类名集合变化时可能复用旧 WXSS 缓存，导致脚本中新加的 Tailwind 工具类未生成样式的问题。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 将 `demo/mpx-app` 的 script-only 新增类名回归纳入正式 watch-HMR 覆盖，并接入 `e2e:ci` 的稳定热更新门禁。

- 🐛 **修复 Tailwind CSS v3/v4 在部分生成链路中把 `text-[55rpx]` 等任意值误判为颜色时，非主 CSS chunk 没有恢复为长度声明的问题。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复核心源码在严格 TypeScript 配置下的类型问题，并清理对应 ESLint 诊断。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复生成模式的额外源码候选扫描绕过 Tailwind 扫描排除规则的问题，确保 Tailwind CSS v3 `content` 中的 `!` 排除以及 Tailwind CSS v4 `@source not` 不会被 Vite/PostCSS 补扫重新引入。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 新增 e2e-watch HMR 速度报告产物，CI 每次 watch 回归都会输出 hot update 的 avg/p50/p95/max、按项目和按场景拆分的耗时摘要，并随 artifact 上传。
  - 补齐 Tailwind CSS v4 `@source inline(...)` 与 `@source not inline(...)` 在 Vite/PostCSS 生成模式下的候选收集支持，覆盖 brace expansion、换行参数、`source(none)`/全量排除以及内联排除文件候选等场景。

- 🐛 **修复小程序 CSS 前缀清理后 `transition-property` 声明重复的问题，避免 Tailwind CSS v3 的 `.transition` 输出保留多条等价声明。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复普通 uni-app App WebView 构建的生成目标推断，`UNI_PLATFORM=app/app-plus` 默认切换为 `web` 输出族；uni-app x `UNI_UTS_PLATFORM=app-*` 原生 App 目标继续保留小程序/uvue 兼容输出，不新增 `target: 'app'`。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 uni-app Vite 小程序构建中动态模板类名转译不完整的问题，确保 `wxml` 以及其它小程序模板目标在完整 `runtimeSet` 重试后可以继续转译 `h-[458rpx]`、`w-[218rpx]`、`inset-x-[30%]` 等任意值类名，并避免 Tailwind CSS v3 `@apply` 使用 `min-w-0` 等工具类时误报 unknown utility。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **优化 uni-app Vite + Tailwind CSS v4 热更新性能：主包占位 CSS 现在会根据已注册 CSS source 的 Tailwind source entries 与当前候选命中选择单个源，避免候选变化时把多个自动发现的 CSS source 合并生成到主包样式；同时跳过 Vue SFC 子请求对源码候选集合的覆盖，保留原始 `.vue` 文件中的完整 class 候选。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复开启 `unocss` 兼容后，`text-var(--brand)`、`w-calc(100%-1rem)`、`bg-#fff` 等 UnoCSS 风格裸任意值在 Tailwind CSS v3 / v4 生成链路中没有稳定进入候选或输出选择器无法和原始 class 对齐的问题。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v3 generator 模式下 `@layer` 自定义组件和工具类仅在 CSS `@apply` 中引用时被裁剪的问题，并补齐 v3 指令与函数的回归覆盖。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v3 在 uni-app vite build-mode dev 首次增量热更新时全量扫描输出 JS/WXML，导致候选集被 vendor 普通字符串放大、热更新极慢的问题，并将 `bgObj` 对象 key 热更新场景纳入 watch-HMR e2e 回归。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v3 在 Vite watch 热更新中因源码类名变化反复触发完整 runtime extract 导致 HMR 变慢的问题。v3 首轮仍保留完整 runtime 基线，后续 watch 轮次按文件增量更新源码候选类，避免已删除源码类继续污染 CSS，同时保留 safelist 等非源码基线类。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v3 在 uni-app H5/web 目标下的 generator 模式。Vite dev 阶段现在会识别 Sass `@use "tailwindcss/*"` 入口并提前生成 web CSS，同时保留 v4 web 跳过二次生成的行为；生产构建中 v3 web CSS 也会继续由 generator 输出，避免裸 `@apply` 或小程序转义样式进入 H5 产物。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 小程序产物移除 `@property` 后可能丢失 `--tw-border-style` 默认值的问题，避免只有 `border` 工具类时小程序端无法得到和 Web 端一致的默认实线边框；同时按需补齐实际使用到的 v4 运行时默认变量，并合并等价的小程序元素作用域规则，避免输出重复 selector。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 小程序产物中透明度颜色可能保留 `color-mix(in oklab, ...)` 的问题，将 `text-white/10`、`bg-sky-500/75`、`bg-sky-500/(--alpha)` 等颜色透明度写法转换为小程序可用的 `rgba(...)` 输出；同时修复 v4 增量热更新追加样式时重复注入 preflight reset 的问题。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 生成模式下小程序产物可能缺失默认 preflight reset 的问题，避免 `divide-double`、`divide-dotted` 等分割线样式在未清零边框宽度时渲染出额外边框。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 生成模式下渐变运行时变量只落在主题作用域的问题，将 `--tw-gradient-*` 默认值补到小程序元素与伪元素作用域，避免 `bg-gradient-* from-* to-*` 在组件节点中失效；伪元素选择器使用小程序工具链更稳定的 `:before` / `:after` 输出。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **对齐 Tailwind CSS v4 官方 source detection 语义：Vite 生成模式的自动源码扫描默认忽略 CSS 与预处理器文件，只有显式 `@source` 注册时才会扫描这些样式文件，避免自动候选收集把样式入口误当作内容源。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 source 扫描回归，避免 PostCSS 和 Vite 生成链路误丢 `@source` 命中的文件，并过滤小程序不支持的 slash variant 候选。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 uni-app Vite 下 Tailwind CSS v4 子包样式生成过慢的问题：子包 `wxss` 现在会优先反查对应源码侧 CSS 入口，并在命中 `source(none)` 等独立入口时隔离主包运行时候选，避免静态 icon 插件等大候选集被重复合并到子包生成流程。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind v4 generator 模式下用户样式被统一追加到生成 CSS 末尾的问题，保留 Vite/uni-app 合并后的原始 CSS source order。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Vite H5 开发模式下仅修改 Vue 脚本中的 Tailwind 任意值类名时，样式模块未稳定参与 HMR，导致新颜色类名 CSS 未生成到页面的问题。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Vite 模式下 Tailwind CSS v4 自动 CSS 入口在临时文件被清理后可能导致 source 扫描失败的问题。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 `weapp-tailwindcss/vite` 插件返回类型绑定单一 Vite 版本导致的类型不兼容问题，兼容 demo 或下游项目使用不同 Vite 版本的 `defineConfig` 场景。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Vite + Tailwind CSS v4 生成时把 vendor 依赖 chunk 中的运行时配置字符串误提取为候选类的问题，并对齐裸 Tailwind v4 CSS 入口的默认 source 扫描范围。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **补充记录 Webpack watch 模式下默认忽略输出目录的修复，确保 Taro Webpack 项目不会因为插件改写 `dist` 产物而反复触发重新编译。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Mpx webpack 场景下 `@mpxjs/webpack-plugin` 子路径 loader 解析失败的问题，并补充跨框架支持矩阵的 CI 与 IDE 验证入口。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 monorepo demo 直接启动时可能复用过期 `dist` 的问题：所有依赖 `weapp-tailwindcss` 的 demo 在 `dev`/`build` 前会按需检查核心包构建产物，源码更新后自动刷新本地 `dist`，避免热更新性能优化没有被实际 demo 加载。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 小程序生成模式默认颜色与 v3 不一致的问题，Tailwind CSS v3 兼容模式下恢复 v3 默认色板，并避免输出小程序不支持的 `oklch` 默认颜色。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **支持在生成模式中通过 `generator.config` 指定 Tailwind 配置文件，兼容原 Tailwind PostCSS 插件 `config` 选项的手动配置路径用法。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v3 生成器在插件 class cache 中过滤通配符候选时的兼容问题，补充 v3/v4 生成器对官方插件、自定义插件和 Iconify 图标插件的回归覆盖，并在 Tailwind CSS v4 小程序生成模式下将默认颜色变量替换为小程序可识别的 hex 色值。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **为 watch-HMR 回归增加 weapp-tailwindcss 插件自身处理耗时采集与 500ms 预算校验，区分构建器端到端热更新时间和插件内部处理时间，便于持续优化开发体验。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **当 `WEAPP_TW_HMR_TIMING=1` 时额外输出人可读的插件处理耗时，便于 demo 开发态观察构建和 HMR 性能。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **收敛小程序 CSS 的 `-webkit-` 前缀输出，默认仅保留 `background-clip: text`、`mask-*`、`box-orient` 等小程序场景需要的兼容写法，并移除 `text-decoration`、`filter/backdrop-filter`、`transform/animation/transition` 等浏览器冗余前缀。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **增强 Sass/Less 等预处理器样式入口的 Tailwind 指令识别与改写能力，避免将预处理器私有语法直接交给 Tailwind 解析，并补充真实 demo 与 CI 回归覆盖。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 uni-app Vite 小程序 dev 产物中 Sass/Less 预处理器入口里的自定义 `@layer components` 被漏提取的问题，确保 `@apply` 生成的 `.raw-btn`、`.btn` 以及伪元素样式会写入 `dist/dev/mp-weixin/app.wxss`，且不会残留小程序不支持的 `@layer`/`@apply`。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **精简 `weapp-tw patch` 兼容链路：该命令在 v5 中改为无需执行的兼容提示，移除目标记录、workspace 批量 patch、运行时 `twPatcher.patch()` 初始化调用与手动 patch 状态检查相关逻辑，由构建运行时直接接管 Tailwind CSS 处理。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **补齐 Tailwind CSS v4 生成模式升级兼容覆盖，固定 v3/v4 默认值、preflight、space/divide 选择器与新版候选类语法在小程序目标下的输出行为。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **将 `@vue/compiler-dom` 与 `@vue/compiler-sfc` 调整为构建期依赖。uni-app x 转换所需的 Vue compiler 依赖会随 `weapp-tailwindcss` 产物内联，发布包不再要求使用者运行时额外安装这些 Vue compiler 包。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **支持单引号和双引号包裹的 `content-*` 任意值默认同时提取，并将 `arbitraryValues.allowDoubleQuotes` 保留为兼容旧配置的废弃选项。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **移除初始化流程和核心包安装生命周期中的 `weapp-tw patch` 自动入口。当前生成模式会在构建运行时接管 Tailwind CSS 补丁与类名收集，新项目不再需要把补丁命令写入 `postinstall`；旧 CSS 后处理链路仍可手动执行 `weapp-tw patch` 或 `weapp-tw status` 排查状态。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 执行 `weapp-tw patch` 时会提示 `weapp-tailwindcss@5` 生成模式不再需要该指令，也不需要配置 `postinstall` 这个 npm hook，避免新项目继续复制旧链路配置。

- 🐛 **移除 webpack loader 对 `loader-utils` 的依赖，改为使用 webpack 5 loader context 的 `getOptions()` 读取配置。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **移除 `weapp-tailwindcss` 中遗留的 mangle 相关依赖、常量、测试夹具与历史快照，保留当前小程序类名转义链路。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 下 `text-[32.4rpx]` 等 rpx 长度任意值在 web 和小程序目标中泄漏内部 `length:` 类型提示的问题，保持最终选择器和类名使用原始写法。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **现在 Tailwind CSS v3 和 v4 场景都会默认开启内置 `autoprefixer` 后处理，用于补齐小程序 WebView 所需的兼容前缀；如需关闭可继续传入 `autoprefixer: false`。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **Vite source candidates 收集改为复用 `tailwindcss-patch` 的源码候选提取 API，移除本地重复的字符串/`@apply` 提取逻辑，避免与 Tailwind scanner 语义分叉。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复小程序最终样式中被提到前面的 base/theme 规则顺序，确保用户样式仍然能排在这些基础规则之前，不再被 `:host/page` 和 `view/text` 重排压到后面。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **收紧 demo watch-HMR 回归验收：所有 demo 热更新样本统一按 2 秒预算校验，并在速度报告中标注 1 秒推荐目标。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复全新安装后 Tailwind CSS v3 未自动准备运行时补丁导致的 `rpx` 任意值误判、生成模式 classSet 为空，以及 Vite/JS 任意值类名未转译问题。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 小程序生成模式默认值与 v3 不一致的问题，默认注入 Tailwind CSS v3 兼容默认值。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修正 Tailwind CSS v3 项目的默认生成模式行为：`auto` 会和 Tailwind CSS v4 一样由 weapp-tailwindcss 接管 Tailwind 样式生成，并移除重复的官方 Tailwind PostCSS 链路。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 v5 默认生成模式在 Tailwind CSS v3 + uni-app Vite 小程序/quickapp 构建中遗漏 `@tailwind`/`@apply` 展开导致产物残留原始 Tailwind 指令的问题。现在 `@apply` 会作为生成入口参与 Tailwind v3 样式生成，并且生成后的兼容 CSS 追加不会把未展开的 `@apply` 规则重新写回产物。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **补充 Tailwind CSS v4 生成模式对官方 Adding custom styles 写法的回归覆盖，确保 `@theme`、任意值/属性/变体、自定义 CSS、`@utility` 函数式工具类和 `@custom-variant` 在生成模式下保持语义一致。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 生成模式下 colors 透明度变量在小程序样式兼容阶段被静态降级为不透明色的问题，并补充颜色工具类、`@theme` 自定义颜色与禁用默认颜色的回归覆盖。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复小程序样式转换中错误保留 `[data-theme=dark]` / `[data-mode="dark"]` 这类属性选择器的问题。web 目标继续保留 Tailwind CSS v4 data attribute dark variant，小程序目标会移除依赖属性选择器的无效规则，避免生成小程序不支持的选择器或让 dark 样式无条件生效。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 生成模式下 data attribute 版 `@custom-variant dark` 在小程序选择器兜底清理阶段丢失属性选择器的问题，并补充默认媒体查询、`.dark` 自定义选择器和 `[data-theme=dark]` 自定义选择器的回归覆盖。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **按 Tailwind CSS 主版本解析默认 `cssPreflight`，v4 运行时改用 `margin: 0`、`padding: 0` 和 `border: 0 solid`，避免继续注入 v3 的拆分边框默认值。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 生成模式下 `tailwindcss/preflight.css` subpath import 的处理策略：web 目标仅在显式使用 `layer(...)` 导入时保留 Preflight，小程序目标继续裁剪浏览器标签 reset，并补充对应回归测试。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 生成模式下 bundler 和 PostCSS 入口未启用官方 source detection 的问题，支持自动扫描、`@source`、`source(...)` / `source(none)`、`@source not`、`inline()` 与 brace expansion 等规则，同时保持 Tailwind CSS v3 生成链路不变。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **完善 Tailwind CSS v4 生成模式对 `package.json#imports` subpath imports 的支持：`@import "#..."` 会触发默认生成模式，`@config "#..."` 会保留给 Tailwind v4 按官方规则解析，并新增 `@import`、`@reference`、`@plugin`、`@config` 的真实生成回归测试。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 生成模式下 `--animate-*` 主题变量对应的 `@keyframes` 在小程序 CSS 裁剪阶段被误删的问题，并补充 `@theme` 命名空间、`inline`、`static`、自定义主题重置和主题变量引用的回归覆盖。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **支持 Vite、Webpack 和 Gulp 场景下自动识别 Tailwind CSS v4 入口 CSS，未显式传入 `cssEntries` 时会捕获包含 Tailwind 根指令的样式内容，并通过 `tailwindcss-patch@9.3.3` 的 `cssSources` 刷新运行时 patcher；显式配置 `cssEntries` 或 `cssSources` 时仍保持用户配置优先。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **统一 Tailwind CSS v4 示例、测试辅助入口和构建器重写契约，推荐继续使用 `@import "tailwindcss"`，并仅将 `weapp-tailwindcss` CSS 入口保留为兼容解析路径。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v3/v4 增量生成缓存只追加不删除的问题。当 HMR 中候选类集合减少时，生成器会完整重生成当前候选集合并刷新缓存，避免 Taro dev 回滚或删除 class 后旧 utilities 继续残留在 wxss 中。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Taro Webpack watch 场景下输出目录被监听后，由插件改写产物反复触发重新编译的问题。Webpack 插件现在会在 watch 模式中默认把 `outputPath` 追加到 `ignored`，避免 `dist` 写入造成自循环。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 同时整理 Taro Webpack v3 demo 的 Tailwind 样式入口顺序，避免 `postcss-import` 顺序警告干扰 watch 日志。

- 🐛 **Vite 生成模式下 Tailwind CSS v3 默认优先使用 Oxide 扫描到的源码候选类作为运行时输入，并将 v3 CSS 生成从 `postcss([tailwindcss(...)])` 切换为内部直接引擎，减少开发热更新中对 v3 PostCSS 插件和 runtime patcher 提取链路的依赖。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 uni-app H5 / web 模式下 Vite 插件仍走小程序生成链路的问题。H5 会自动使用 web target，跳过小程序模板、JS、runtime class set 与 source candidate 根目录扫描，保留 Vite/Tailwind 生成的浏览器 CSS；小程序构建仍保持 class 转义和 wxss 输出。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **升级 `tailwindcss-patch` 到 `9.4.1`。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - `tailwindcss-patch@9.4.1` 的发布入口已经导出 `splitCandidateTokens`，`weapp-tailwindcss` 的 JS、Vite 产物和 uni-app x 局部样式候选 token 分割逻辑改为直接消费该 API，避免继续维护重复兼容实现。

- 🐛 **升级 `tailwindcss-patch` 到 `9.4.2`，并改为统一消费 npm 发布版本，避免主仓库安装和 CI 依赖 `tailwindcss-mangle` submodule 的 workspace 链接。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **升级 `tailwindcss-patch` 到 `9.3.1`，同步消费最新补丁版本。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **Upgrade tailwindcss-patch to 9.3.7 and align Tailwind CSS v4 source option resolution with the shared patch defaults while preserving configured source entries for bundler scans.** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Tailwind CSS v3 自定义生成引擎在显式候选驱动的增量生成中重复扫描配置 content 的问题，避免 uni-app Vite 热更新时生成 CSS 持续膨胀并拖慢 HMR。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **优化 Tailwind CSS v3 开发热更新性能，增量生成时复用 Tailwind v3 runtime context，并缓存稳定 CSS 源的 legacy compat 转换结果，避免新增 class 时重复重建 v3 上下文和重复转换兼容 CSS。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **优化 Tailwind CSS v3 生成器在 Vite 热更新中的增量 CSS 生成路径。现在 v3 生成器在热更新场景会复用同一 source/style/target 下已生成的 CSS，只为新增候选类生成 utilities 片段，减少重复执行完整 Tailwind v3 PostCSS 生成的次数。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **优化 Tailwind CSS v4 在 Vite watch 下的热更新性能，避免已有候选集时重复扫描源码，并复用增量 CSS 生成缓存。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **调整 Vite 插件的 Tailwind CSS 生成时机，让生成后的 CSS 进入 Vite 原生 CSS/PostCSS 管道，默认尊重用户的 `postcss.config` 与 `css.postcss` 插件配置。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **增强 Vite v5 生成模式的 Tailwind 依赖追踪，在生成 CSS 时向 Vite 注册生成器依赖，覆盖 CSS 入口、配置文件和 Tailwind source 解析产物。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **优化 Vite 生成模式下 Tailwind CSS v4 的热更新性能，候选类变化时不再重生成未关联的页面和分包 CSS。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **优化 Tailwind CSS v4 在 Vite 构建中的 CSS source 匹配模型：普通主 CSS 输出也会优先通过 source candidates 精确匹配单个 cssSource，无法判定时不再对多个 cssSources 执行全量生成，减少 uni-app 等多 CSS source 项目的热更新耗时。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **Tailwind CSS v4 初始源码扫描生成完成后会同步预热增量生成缓存，避免第一次热更新因为没有基线缓存而再次触发完整 v4 生成。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Vite watch 场景下生成器候选类刷新不完整的问题，确保脚本中新增的原子类能同步生成到小程序样式产物。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 补齐 demo 与 apps 的 watch/HMR 端到端覆盖，在模板、脚本与样式变更后同时校验小程序模板、JS 与 WXSS 产物中的转义结果。

- 🐛 **在 uni-app、uni-app x、Mpx 与 Taro 的 H5/Web 构建环境中，生成器默认目标会自动切换为 Web，同时保留显式 `generator.target` 配置的优先级。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **为 Taro、uni-app 等支持 Web/H5 的 watch 回归补充 Tailwind CSS HMR 验证，并通过 Playwright 校验 Web 端样式热更新链路。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **Fix Vite web target builds so generated CSS assets are left as Vite web CSS instead of being routed back through mini-program Tailwind generation and CSS post-processing.** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - Also clean Tailwind v3 legacy compat CSS after repairing unclosed imported rules so raw `@tailwind` and `@apply` directives do not leak into generated mini-program CSS.

- 🐛 **修复 Webpack 产物中可能残留 Tailwind CSS v4 源指令的问题，避免页面级样式里的 `@reference` 等指令直出到小程序 WXSS 后触发开发者工具编译错误。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **优化 Webpack `processAssets` 阶段的产物写回逻辑：当转换结果与当前 asset 内容一致时，不再调用 `updateAsset`，也不触发 `onUpdate`。这可以减少同一轮 asset processing 中的重复写回，并降低 watch 场景下的无效产物变更。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
- 📦 Updated 5 dependencies [`73a7794`](https://github.com/sonofmagic/weapp-tailwindcss/commit/73a7794d50916d2189f22bfaa9e9ab9402b30df7)
  <details><summary>Details</summary>

  `tailwindcss-config@2.0.0`, `@weapp-tailwindcss/postcss@3.0.0`, `@weapp-tailwindcss/reset@0.1.1`, `@weapp-tailwindcss/shared@2.0.0`, `@weapp-tailwindcss/logger@2.0.0`

  </details>

## 5.0.0-next.38

### Patch Changes

- 🐛 **修复开启 `unocss` 兼容后，`text-var(--brand)`、`w-calc(100%-1rem)`、`bg-#fff` 等 UnoCSS 风格裸任意值在 Tailwind CSS v3 / v4 生成链路中没有稳定进入候选或输出选择器无法和原始 class 对齐的问题。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **升级 `tailwindcss-patch` 到 `9.4.2`，并改为统一消费 npm 发布版本，避免主仓库安装和 CI 依赖 `tailwindcss-mangle` submodule 的 workspace 链接。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

## 5.0.0-next.37

### Patch Changes

- 🐛 **补充记录 Webpack watch 模式下默认忽略输出目录的修复，确保 Taro Webpack 项目不会因为插件改写 `dist` 产物而反复触发重新编译。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

## 5.0.0-next.36

### Patch Changes

- 🐛 **修复 Tailwind CSS v4 小程序产物移除 `@property` 后可能丢失 `--tw-border-style` 默认值的问题，避免只有 `border` 工具类时小程序端无法得到和 Web 端一致的默认实线边框；同时按需补齐实际使用到的 v4 运行时默认变量，并合并等价的小程序元素作用域规则，避免输出重复 selector。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
- 📦 **Dependencies** [`e6f624f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e6f624f5e69bb5a85df9ac93fda1badfd31f2bce)
  → `@weapp-tailwindcss/postcss@3.0.0-next.10`

## 5.0.0-next.35

### Patch Changes

- 🐛 **修复 Tailwind CSS v3/v4 增量生成缓存只追加不删除的问题。当 HMR 中候选类集合减少时，生成器会完整重生成当前候选集合并刷新缓存，避免 Taro dev 回滚或删除 class 后旧 utilities 继续残留在 wxss 中。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **修复 Webpack 产物中可能残留 Tailwind CSS v4 源指令的问题，避免页面级样式里的 `@reference` 等指令直出到小程序 WXSS 后触发开发者工具编译错误。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **优化 Webpack `processAssets` 阶段的产物写回逻辑：当转换结果与当前 asset 内容一致时，不再调用 `updateAsset`，也不触发 `onUpdate`。这可以减少同一轮 asset processing 中的重复写回，并降低 watch 场景下的无效产物变更。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

## 5.0.0-next.34

### Patch Changes

- 🐛 **修复 Taro Webpack watch 场景下输出目录被监听后，由插件改写产物反复触发重新编译的问题。Webpack 插件现在会在 watch 模式中默认把 `outputPath` 追加到 `ignored`，避免 `dist` 写入造成自循环。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - 同时整理 Taro Webpack v3 demo 的 Tailwind 样式入口顺序，避免 `postcss-import` 顺序警告干扰 watch 日志。

## 5.0.0-next.33

### Patch Changes

- 🐛 **修复 `babelParserOptions` 默认开启缓存时的内存膨胀问题：解析缓存键改为哈希后缀，不再直接拼接源码；同时增加缓存条数和源码长度上限，避免大项目把 AST 缓存撑爆。** [`5c1bb9b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5c1bb9bd2b27352be80567c969da4b0ea06e0490) by @sonofmagic

- 🐛 **新增 `splitCandidateTokens` 候选 token 分割入口，并保留 `splitCode` 作为兼容别名。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - `weapp-tailwindcss` 内部的 JS、WXML 动态表达式与 uni-app x 局部样式候选分割改为使用更明确的 `splitCandidateTokens`，继续保持 `classNameSet` 精确命中原则，避免普通字符串被误转义。

- 🐛 **支持单引号和双引号包裹的 `content-*` 任意值默认同时提取，并将 `arbitraryValues.allowDoubleQuotes` 保留为兼容旧配置的废弃选项。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic

- 🐛 **升级 `tailwindcss-patch` 到 `9.4.1`。** [#890](https://github.com/sonofmagic/weapp-tailwindcss/pull/890) by @sonofmagic
  - `tailwindcss-patch@9.4.1` 的发布入口已经导出 `splitCandidateTokens`，`weapp-tailwindcss` 的 JS、Vite 产物和 uni-app x 局部样式候选 token 分割逻辑改为直接消费该 API，避免继续维护重复兼容实现。
- 📦 **Dependencies** [`aaba811`](https://github.com/sonofmagic/weapp-tailwindcss/commit/aaba811cfc2ad003d3daf2cf290c9d8b770c6dfb)
  → `@weapp-tailwindcss/shared@2.0.0-next.1`, `@weapp-tailwindcss/postcss@3.0.0-next.9`, `tailwindcss-config@2.0.0-next.3`

## 5.0.0-next.32

### Patch Changes

- 🐛 **修复 css-macro 在 uni-app 样式条件编译之后才生成条件注释导致错误平台分支残留的问题。现在 Tailwind CSS v3/v4 生成链路会在最终样式输出前按当前平台裁剪 `ifdef` / `ifndef` 分支，避免微信小程序产物保留 `ifndef-[MP-WEIXIN]` 样式。** [#888](https://github.com/sonofmagic/weapp-tailwindcss/pull/888) by @sonofmagic

## 5.0.0-next.31

### Patch Changes

- 🐛 **修复小程序生成模式下自定义 `@layer components` 在最终主 CSS 中被追加到 utilities 后面的问题。现在 Tailwind CSS v3/v4 的小程序产物会保留 `.raw-btn`、`.btn` 等用户组件层规则，并在不保留 `@layer` 包裹的前提下把它们排到 utilities 之前。** [#887](https://github.com/sonofmagic/weapp-tailwindcss/pull/887) by @github-actions

## 5.0.0-next.30

### Patch Changes

- 🐛 **修复 uni-app Vite 小程序 dev 产物中 Sass/Less 预处理器入口里的自定义 `@layer components` 被漏提取的问题，确保 `@apply` 生成的 `.raw-btn`、`.btn` 以及伪元素样式会写入 `dist/dev/mp-weixin/app.wxss`，且不会残留小程序不支持的 `@layer`/`@apply`。** [`0c96ecc`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0c96ecc1d9a35215b479663e466c86267662c01f) by @sonofmagic

## 5.0.0-next.29

### Patch Changes

- 🐛 **修复生成产物时误删用户自定义的 `@layer components { ... }` 块，导致相关样式没有写入 `app.wxss` 的问题。** [#885](https://github.com/sonofmagic/weapp-tailwindcss/pull/885) by @github-actions

## 5.0.0-next.28

### Patch Changes

- 🐛 **修复普通 uni-app App WebView 构建的生成目标推断，`UNI_PLATFORM=app/app-plus` 默认切换为 `web` 输出族；uni-app x `UNI_UTS_PLATFORM=app-*` 原生 App 目标继续保留小程序/uvue 兼容输出，不新增 `target: 'app'`。** [#884](https://github.com/sonofmagic/weapp-tailwindcss/pull/884) by @github-actions

- 🐛 **将 `@vue/compiler-dom` 与 `@vue/compiler-sfc` 调整为构建期依赖。uni-app x 转换所需的 Vue compiler 依赖会随 `weapp-tailwindcss` 产物内联，发布包不再要求使用者运行时额外安装这些 Vue compiler 包。** [`5ac951f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5ac951f44e6dc3c9c70dc7d7f520a66595904e6a) by @sonofmagic

## 5.0.0-next.27

### Major Changes

- 🚀 **统一构建器插件的公开注册名为 `WeappTailwindcss`，移除 Webpack 与 Vite 入口中的旧 `Unified*` 导出别名；同时补齐 `target: 'web'` 场景下 Tailwind CSS v4 website 模式的 CSS 生成与源码扫描行为，避免文档站接入时依赖官方 Tailwind 生成插件。** [#883](https://github.com/sonofmagic/weapp-tailwindcss/pull/883) by @github-actions

### Patch Changes

- 🐛 **对齐 Tailwind CSS v4 官方 source detection 语义：Vite 生成模式的自动源码扫描默认忽略 CSS 与预处理器文件，只有显式 `@source` 注册时才会扫描这些样式文件，避免自动候选收集把样式入口误当作内容源。** [#883](https://github.com/sonofmagic/weapp-tailwindcss/pull/883) by @github-actions

- 🐛 **修复 Vite 模式下 Tailwind CSS v4 自动 CSS 入口在临时文件被清理后可能导致 source 扫描失败的问题。** [#883](https://github.com/sonofmagic/weapp-tailwindcss/pull/883) by @github-actions

- 🐛 **修复 `weapp-tailwindcss/vite` 插件返回类型绑定单一 Vite 版本导致的类型不兼容问题，兼容 demo 或下游项目使用不同 Vite 版本的 `defineConfig` 场景。** [#883](https://github.com/sonofmagic/weapp-tailwindcss/pull/883) by @github-actions

## 5.0.0-next.26

### Major Changes

- 🚀 **新增 HBuilderX 直连演示矩阵，覆盖 uni-app Vite Vue 3 与 uni-app x 的 Tailwind CSS v3/v4 场景，并提供 `hbuilderx` preset。** [#882](https://github.com/sonofmagic/weapp-tailwindcss/pull/882) by @sonofmagic
  - 同时将已由 tsdown 打包进产物、且不需要消费者安装的实现依赖下移到 `devDependencies`。公开导出或运行期加载边界仍保留为正式依赖，例如 `tailwindcss-config` 的 `jiti`，以及 `@weapp-tailwindcss/shared` 对外导出的 `defu`、`get-value`、`set-value`。

### Patch Changes

- 🐛 **修复 Vite H5 开发模式下仅修改 Vue 脚本中的 Tailwind 任意值类名时，样式模块未稳定参与 HMR，导致新颜色类名 CSS 未生成到页面的问题。** [#881](https://github.com/sonofmagic/weapp-tailwindcss/pull/881) by @github-actions
- 📦 Updated 4 dependencies [`2d2acf2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2d2acf29cfee02ffb32783c8bd3c5de8d9aab9df)
  <details><summary>Details</summary>

  `@weapp-tailwindcss/postcss@3.0.0-next.8`, `@weapp-tailwindcss/logger@2.0.0-next.0`, `@weapp-tailwindcss/shared@2.0.0-next.0`, `tailwindcss-config@2.0.0-next.2`

  </details>

## 5.0.0-next.25

### Minor Changes

- ✨ **优化 `css-macro` 的样式生成方式：宏变体现在不再输出伪 `@media (weapp-tw-platform:...)` 包裹，而是生成内部条件节点，并由内置转换直接产出小程序条件编译注释。** [#879](https://github.com/sonofmagic/weapp-tailwindcss/pull/879) by @github-actions
  - 旧的 `@media (weapp-tw-platform:...)` 宏输出仍会被 `weapp-tailwindcss/css-macro/postcss` 兼容处理，方便存量自定义 PostCSS 流程平滑迁移。

- ✨ **新增内置 `unitConversion` 配置，支持基于 `postcss-rule-unit-converter` 的任意样式单位转换，并可按 `weapp`、`h5`、`web`、`app` 等平台分别配置转换规则。** [#879](https://github.com/sonofmagic/weapp-tailwindcss/pull/879) by @github-actions

- ✨ **新增默认关闭的 `unocss` 兼容配置。开启后会复用 `tailwindcss-patch` 的 Tailwind CSS v4 裸任意值能力，class 字符转义继续沿用现有 `customReplaceDictionary` 链路，同时在文档站补充 UnoCSS 写法兼容章节。** [#879](https://github.com/sonofmagic/weapp-tailwindcss/pull/879) by @github-actions

### Patch Changes

- 🐛 **内置 `css-macro` 的 PostCSS 转换感应逻辑：当 Tailwind CSS v3 配置中注册 `weapp-tailwindcss/css-macro`，或 Tailwind CSS v4 入口 CSS 中声明 `@plugin "weapp-tailwindcss/css-macro"` 时，会自动启用条件编译注释转换，不再要求常规集成手动注册 `weapp-tailwindcss/css-macro/postcss`。** [#879](https://github.com/sonofmagic/weapp-tailwindcss/pull/879) by @github-actions
  - 同时在生成 CSS 裁剪阶段保留由 `css-macro` 产生的 `#ifdef` / `#ifndef` / `#endif` 注释，并同步更新文档与 demo 配置。

- 🐛 **升级 ESM 化依赖后，将公开包的 Node.js 安装版本约束统一到 `^20.19.0 || >=22.12.0`，避免不支持稳定 ESM/CJS 混合加载的 Node.js 版本安装使用。** [#879](https://github.com/sonofmagic/weapp-tailwindcss/pull/879) by @github-actions

- 🐛 **移除 webpack loader 对 `loader-utils` 的依赖，改为使用 webpack 5 loader context 的 `getOptions()` 读取配置。** [#879](https://github.com/sonofmagic/weapp-tailwindcss/pull/879) by @github-actions
- 📦 **Dependencies** [`29901e2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/29901e2b1d7fc6ec83d73a202e8f60e186d1b022)
  → `@weapp-tailwindcss/postcss@3.0.0-next.7`, `@weapp-tailwindcss/reset@0.1.1-next.1`

## 5.0.0-next.24

### Patch Changes

- 🐛 **修复 Tailwind CSS v4 下 `text-[32.4rpx]` 等 rpx 长度任意值在 web 和小程序目标中泄漏内部 `length:` 类型提示的问题，保持最终选择器和类名使用原始写法。** [#878](https://github.com/sonofmagic/weapp-tailwindcss/pull/878) by @github-actions

- 🐛 **为 Taro、uni-app 等支持 Web/H5 的 watch 回归补充 Tailwind CSS HMR 验证，并通过 Playwright 校验 Web 端样式热更新链路。** [#878](https://github.com/sonofmagic/weapp-tailwindcss/pull/878) by @github-actions

## 5.0.0-next.23

### Patch Changes

- 🐛 **修复 Tailwind CSS v3 在 uni-app H5/web 目标下的 generator 模式。Vite dev 阶段现在会识别 Sass `@use "tailwindcss/*"` 入口并提前生成 web CSS，同时保留 v4 web 跳过二次生成的行为；生产构建中 v3 web CSS 也会继续由 generator 输出，避免裸 `@apply` 或小程序转义样式进入 H5 产物。** [`4e32dc4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4e32dc4bf1369937fbebb2bec9fc287f97bdef4c) by @sonofmagic

- 🐛 **修复 uni-app H5 / web 模式下 Vite 插件仍走小程序生成链路的问题。H5 会自动使用 web target，跳过小程序模板、JS、runtime class set 与 source candidate 根目录扫描，保留 Vite/Tailwind 生成的浏览器 CSS；小程序构建仍保持 class 转义和 wxss 输出。** [`e54e8ef`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e54e8ef1ac56c5cfbf8168362e188ad9b2eea2e4) by @sonofmagic

## 5.0.0-next.22

### Patch Changes

- 🐛 **在 uni-app、uni-app x、Mpx 与 Taro 的 H5/Web 构建环境中，生成器默认目标会自动切换为 Web，同时保留显式 `generator.target` 配置的优先级。** [#876](https://github.com/sonofmagic/weapp-tailwindcss/pull/876) by @github-actions

## 5.0.0-next.21

### Patch Changes

- 🐛 **将小程序 CSS 清理、收尾与兼容处理集中到 `@weapp-tailwindcss/postcss`，主包仅保留兼容导出与构建器编排；同时把实验性的 Lightning CSS 样式处理迁移到 `@weapp-tailwindcss/experimental/lightningcss`。** [`649d229`](https://github.com/sonofmagic/weapp-tailwindcss/commit/649d2296a164a301ec7d40de093d2e1ccb8e60f1) by @sonofmagic

- 🐛 **修复小程序 CSS 前缀清理后 `transition-property` 声明重复的问题，避免 Tailwind CSS v3 的 `.transition` 输出保留多条等价声明。** [`b9e28da`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b9e28da65561c495dcc430346a5565211329cfbe) by @sonofmagic
- 📦 **Dependencies** [`649d229`](https://github.com/sonofmagic/weapp-tailwindcss/commit/649d2296a164a301ec7d40de093d2e1ccb8e60f1)
  → `@weapp-tailwindcss/postcss@3.0.0-next.6`

## 5.0.0-next.20

### Patch Changes

- 🐛 **修复 Tailwind CSS v3 generator 模式下 `@layer` 自定义组件和工具类仅在 CSS `@apply` 中引用时被裁剪的问题，并补齐 v3 指令与函数的回归覆盖。** [#874](https://github.com/sonofmagic/weapp-tailwindcss/pull/874) by @github-actions

- 🐛 **收敛小程序 CSS 的 `-webkit-` 前缀输出，默认仅保留 `background-clip: text`、`mask-*`、`box-orient` 等小程序场景需要的兼容写法，并移除 `text-decoration`、`filter/backdrop-filter`、`transform/animation/transition` 等浏览器冗余前缀。** [#874](https://github.com/sonofmagic/weapp-tailwindcss/pull/874) by @github-actions
- 📦 **Dependencies** [`8575242`](https://github.com/sonofmagic/weapp-tailwindcss/commit/85752425b89b1224e11c4f3dd81a1ae144397be2)
  → `@weapp-tailwindcss/postcss@2.2.1-next.5`

## 5.0.0-next.19

### Patch Changes

- 🐛 **现在 Tailwind CSS v3 和 v4 场景都会默认开启内置 `autoprefixer` 后处理，用于补齐小程序 WebView 所需的兼容前缀；如需关闭可继续传入 `autoprefixer: false`。** [#872](https://github.com/sonofmagic/weapp-tailwindcss/pull/872) by @github-actions

- 🐛 **调整 Vite 插件的 Tailwind CSS 生成时机，让生成后的 CSS 进入 Vite 原生 CSS/PostCSS 管道，默认尊重用户的 `postcss.config` 与 `css.postcss` 插件配置。** [#871](https://github.com/sonofmagic/weapp-tailwindcss/pull/871) by @sonofmagic
- 📦 **Dependencies** [`9f7d222`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9f7d222b0467fe342b86b6165e2406fc18cfbfd8)
  → `@weapp-tailwindcss/postcss@2.2.1-next.4`

## 5.0.0-next.18

### Patch Changes

- 🐛 **修复 Tailwind CSS v4 source 扫描回归，避免 PostCSS 和 Vite 生成链路误丢 `@source` 命中的文件，并过滤小程序不支持的 slash variant 候选。** [#870](https://github.com/sonofmagic/weapp-tailwindcss/pull/870) by @github-actions

- 🐛 **修复 Vite + Tailwind CSS v4 生成时把 vendor 依赖 chunk 中的运行时配置字符串误提取为候选类的问题，并对齐裸 Tailwind v4 CSS 入口的默认 source 扫描范围。** [#870](https://github.com/sonofmagic/weapp-tailwindcss/pull/870) by @github-actions

- 🐛 **Upgrade tailwindcss-patch to 9.3.7 and align Tailwind CSS v4 source option resolution with the shared patch defaults while preserving configured source entries for bundler scans.** [#870](https://github.com/sonofmagic/weapp-tailwindcss/pull/870) by @github-actions

## 5.0.0-next.17

### Patch Changes

- 🐛 **修复小程序最终样式中可能残留 `color-mix`、`oklab`、`oklch`、`lab`、`lch` 与 `display-p3` 颜色函数的问题，能确定的颜色会降级为 `rgb`/`rgba`，避免输出小程序不支持的颜色语法。** [`f36f230`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f36f23092a2986b9960ebc34ee54bdb93072e882) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 小程序产物中透明度颜色可能保留 `color-mix(in oklab, ...)` 的问题，将 `text-white/10`、`bg-sky-500/75`、`bg-sky-500/(--alpha)` 等颜色透明度写法转换为小程序可用的 `rgba(...)` 输出；同时修复 v4 增量热更新追加样式时重复注入 preflight reset 的问题。** [`67896ab`](https://github.com/sonofmagic/weapp-tailwindcss/commit/67896ab30b06aaf16335257c5b5b3156a86c302b) by @sonofmagic

- 🐛 **修复小程序最终样式中被提到前面的 base/theme 规则顺序，确保用户样式仍然能排在这些基础规则之前，不再被 `:host/page` 和 `view/text` 重排压到后面。** [`a09b3e2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a09b3e2263a094467eabe80e2815e736c9e3ade4) by @sonofmagic
- 📦 **Dependencies** [`f36f230`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f36f23092a2986b9960ebc34ee54bdb93072e882)
  → `@weapp-tailwindcss/postcss@2.2.1-next.3`

## 5.0.0-next.16

### Patch Changes

- 🐛 **修复 Tailwind CSS v4 生成模式下渐变运行时变量只落在主题作用域的问题，将 `--tw-gradient-*` 默认值补到小程序元素与伪元素作用域，避免 `bg-gradient-* from-* to-*` 在组件节点中失效；伪元素选择器使用小程序工具链更稳定的 `:before` / `:after` 输出。** [#866](https://github.com/sonofmagic/weapp-tailwindcss/pull/866) by @github-actions

- 🐛 **Fix Vite web target builds so generated CSS assets are left as Vite web CSS instead of being routed back through mini-program Tailwind generation and CSS post-processing.** [`ad72840`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ad728404a9ceefe85429cd56449a63ebd6930c07) by @sonofmagic
  - Also clean Tailwind v3 legacy compat CSS after repairing unclosed imported rules so raw `@tailwind` and `@apply` directives do not leak into generated mini-program CSS.

## 5.0.0-next.15

### Patch Changes

- 🐛 **修复 Tailwind v4 generator 模式下用户样式被统一追加到生成 CSS 末尾的问题，保留 Vite/uni-app 合并后的原始 CSS source order。** [#865](https://github.com/sonofmagic/weapp-tailwindcss/pull/865) by @github-actions

## 5.0.0-next.14

### Patch Changes

- 🐛 **默认继续开启 Babel AST 解析缓存，但改为使用源码 hash 生成缓存 key，并新增 `babelParserOptions.cacheMaxEntries` 与 `babelParserOptions.cacheMaxSourceLength` 限制缓存条数和可缓存源码大小，避免大型项目中完整源码 key 与大 AST 长时间驻留导致内存占用过高；仍可通过 `babelParserOptions.cache: false` 显式关闭。** [`eb75a9a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/eb75a9a90cfdd64844006f58da5d536ac4c16d10) by @sonofmagic

## 5.0.0-next.13

### Patch Changes

- 🐛 **优化 demo 构建与热更新中的 Tailwind 生成链路：Vite/Gulp/Webpack 会更精确地复用源码候选、CSS source 与运行时 class set 缓存，避免 v3 空构建复用上一次非空候选、v4 source 文件变化未进入签名，以及 v3 PostCSS 过早过滤配置类导致的重复生成和漏生成。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **优化 Vite 构建器在 demo 热更新场景下的源候选缓存与 CSS 生成刷新逻辑，避免增量编译反复丢失源码候选或执行不必要的全量任务。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions
  - 同时调整 Taro Vite 与 weapp-vite demo 的 watch 验证脚本，默认使用真实原生 watch 增量流程，避免测试脚本重启构建进程或额外执行全量构建导致热更新时间被放大。

- 🐛 **优化 Webpack 与 Gulp demo 的 watch 热更新路径：普通页面、组件、脚本或模板变更复用已有 Tailwind runtime class set 和依赖元数据，仅在 Tailwind 配置、CSS source 或内容依赖变化时重新刷新完整 patcher。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **优化 Tailwind CSS v4 增量生成：新增候选类时仅转换新增 CSS 片段并追加到缓存结果，避免每次热更新都重新转换完整生成 CSS。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **优化 Vite 生成模式在 uni-app watch 场景下的 Tailwind CSS 增量热更新性能，复用底层生成器的新增 CSS 片段并避免重复处理整份历史样式。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **修复 Tailwind CSS v3 在 Vite 增量构建中只使用 source scan 候选集时遗漏当前 bundle 新增类名的问题，避免 WXML 已转义但 WXSS 未生成对应样式。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **优化 Vite watch 模式下 Tailwind v4 热更新性能：缓存 source candidates 扫描结果，优先按 `@source`/CSS 入口缩小扫描范围，并复用 Tailwind v4 generator 的增量结果，避免 demo 热更新时反复全量扫描源码和重复生成 CSS。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **修复 Mpx + Tailwind CSS v4 子包 CSS 中相对 `@config` 路径在构建时被错误按项目根解析的问题，保持源码相对当前文件的写法可用。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **优化 uni-app Vite + Tailwind CSS v4 热更新性能：主包占位 CSS 现在会根据已注册 CSS source 的 Tailwind source entries 与当前候选命中选择单个源，避免候选变化时把多个自动发现的 CSS source 合并生成到主包样式；同时跳过 Vue SFC 子请求对源码候选集合的覆盖，保留原始 `.vue` 文件中的完整 class 候选。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **修复 Tailwind CSS v4 生成模式下小程序产物可能缺失默认 preflight reset 的问题，避免 `divide-double`、`divide-dotted` 等分割线样式在未清零边框宽度时渲染出额外边框。** [`d97e16d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d97e16d9813fa94bdb803b863cbb6e583076cbe8) by @sonofmagic

- 🐛 **修复 uni-app Vite 下 Tailwind CSS v4 子包样式生成过慢的问题：子包 `wxss` 现在会优先反查对应源码侧 CSS 入口，并在命中 `source(none)` 等独立入口时隔离主包运行时候选，避免静态 icon 插件等大候选集被重复合并到子包生成流程。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **修复 monorepo demo 直接启动时可能复用过期 `dist` 的问题：所有依赖 `weapp-tailwindcss` 的 demo 在 `dev`/`build` 前会按需检查核心包构建产物，源码更新后自动刷新本地 `dist`，避免热更新性能优化没有被实际 demo 加载。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **当 `WEAPP_TW_HMR_TIMING=1` 时额外输出人可读的插件处理耗时，便于 demo 开发态观察构建和 HMR 性能。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **Vite source candidates 收集改为复用 `tailwindcss-patch` 的源码候选提取 API，移除本地重复的字符串/`@apply` 提取逻辑，避免与 Tailwind scanner 语义分叉。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **Vite 生成模式下 Tailwind CSS v3 默认优先使用 Oxide 扫描到的源码候选类作为运行时输入，并将 v3 CSS 生成从 `postcss([tailwindcss(...)])` 切换为内部直接引擎，减少开发热更新中对 v3 PostCSS 插件和 runtime patcher 提取链路的依赖。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **修复 Tailwind CSS v3 自定义生成引擎在显式候选驱动的增量生成中重复扫描配置 content 的问题，避免 uni-app Vite 热更新时生成 CSS 持续膨胀并拖慢 HMR。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **优化 Tailwind CSS v3 开发热更新性能，增量生成时复用 Tailwind v3 runtime context，并缓存稳定 CSS 源的 legacy compat 转换结果，避免新增 class 时重复重建 v3 上下文和重复转换兼容 CSS。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **优化 Tailwind CSS v3 生成器在 Vite 热更新中的增量 CSS 生成路径。现在 v3 生成器在热更新场景会复用同一 source/style/target 下已生成的 CSS，只为新增候选类生成 utilities 片段，减少重复执行完整 Tailwind v3 PostCSS 生成的次数。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **优化 Tailwind CSS v4 在 Vite watch 下的热更新性能，避免已有候选集时重复扫描源码，并复用增量 CSS 生成缓存。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **优化 Vite 生成模式下 Tailwind CSS v4 的热更新性能，候选类变化时不再重生成未关联的页面和分包 CSS。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **优化 Tailwind CSS v4 在 Vite 构建中的 CSS source 匹配模型：普通主 CSS 输出也会优先通过 source candidates 精确匹配单个 cssSource，无法判定时不再对多个 cssSources 执行全量生成，减少 uni-app 等多 CSS source 项目的热更新耗时。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

- 🐛 **Tailwind CSS v4 初始源码扫描生成完成后会同步预热增量生成缓存，避免第一次热更新因为没有基线缓存而再次触发完整 v4 生成。** [#863](https://github.com/sonofmagic/weapp-tailwindcss/pull/863) by @github-actions

## 5.0.0-next.12

### Patch Changes

- 🐛 **修复 Tailwind CSS v3 生成器在 uni-app Vite 热更新中重复清理 Tailwind require cache 导致 wxss 生成缓存失效、增量编译明显变慢的问题。现在 v3 生成器会复用运行时 patch 初始化结果，并在每次生成前主动重置 Tailwind v3 plugin 上下文，避免旧 class 泄漏。** [`aceef73`](https://github.com/sonofmagic/weapp-tailwindcss/commit/aceef7393f419cd9da144a0856489e4c6c04274a) by @sonofmagic

- 🐛 **修复 Tailwind CSS v3 在 uni-app vite build-mode dev 首次增量热更新时全量扫描输出 JS/WXML，导致候选集被 vendor 普通字符串放大、热更新极慢的问题，并将 `bgObj` 对象 key 热更新场景纳入 watch-HMR e2e 回归。** [#862](https://github.com/sonofmagic/weapp-tailwindcss/pull/862) by @github-actions

## 5.0.0-next.11

### Minor Changes

- ✨ **默认开启 Tailwind CSS v4 生成模式的 `@import "weapp-tailwindcss"` 兜底识别，并新增 `generator.importFallback` 配置用于显式关闭。该能力用于框架无法完成 `@import "tailwindcss"` 转写时，仍让两种入口产出保持一致。** [#860](https://github.com/sonofmagic/weapp-tailwindcss/pull/860) by @github-actions

### Patch Changes

- 🐛 **修复核心源码在严格 TypeScript 配置下的类型问题，并清理对应 ESLint 诊断。** [#859](https://github.com/sonofmagic/weapp-tailwindcss/pull/859) by @sonofmagic

- 🐛 **修复 Tailwind CSS v3 在 Vite watch 热更新中因源码类名变化反复触发完整 runtime extract 导致 HMR 变慢的问题。v3 首轮仍保留完整 runtime 基线，后续 watch 轮次按文件增量更新源码候选类，避免已删除源码类继续污染 CSS，同时保留 safelist 等非源码基线类。** [#860](https://github.com/sonofmagic/weapp-tailwindcss/pull/860) by @github-actions

- 🐛 **为 watch-HMR 回归增加 weapp-tailwindcss 插件自身处理耗时采集与 500ms 预算校验，区分构建器端到端热更新时间和插件内部处理时间，便于持续优化开发体验。** [#860](https://github.com/sonofmagic/weapp-tailwindcss/pull/860) by @github-actions

- 🐛 **增强 Sass/Less 等预处理器样式入口的 Tailwind 指令识别与改写能力，避免将预处理器私有语法直接交给 Tailwind 解析，并补充真实 demo 与 CI 回归覆盖。** [#860](https://github.com/sonofmagic/weapp-tailwindcss/pull/860) by @github-actions

- 🐛 **收紧 demo watch-HMR 回归验收：所有 demo 热更新样本统一按 2 秒预算校验，并在速度报告中标注 1 秒推荐目标。** [#860](https://github.com/sonofmagic/weapp-tailwindcss/pull/860) by @github-actions

- 🐛 **统一 Tailwind CSS v4 示例、测试辅助入口和构建器重写契约，推荐继续使用 `@import "tailwindcss"`，并仅将 `weapp-tailwindcss` CSS 入口保留为兼容解析路径。** [#859](https://github.com/sonofmagic/weapp-tailwindcss/pull/859) by @sonofmagic
- 📦 **Dependencies** [`bc3b689`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bc3b689f916d9dd8e2fbb7a685d040b2510ddee3)
  → `@weapp-tailwindcss/postcss@2.2.1-next.2`, `@weapp-tailwindcss/reset@0.1.1-next.0`

## 5.0.0-next.10

### Patch Changes

- 🐛 **优化 Vite、webpack、gulp 开发构建下的热更新路径：复用已有候选集合与 runtime class set，仅在 source 配置或运行时相关内容变化时重新扫描。** [`7612981`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7612981348bb98b50f42315f1534f9189deb566e) by @sonofmagic

- 🐛 **修复生成模式的额外源码候选扫描绕过 Tailwind 扫描排除规则的问题，确保 Tailwind CSS v3 `content` 中的 `!` 排除以及 Tailwind CSS v4 `@source not` 不会被 Vite/PostCSS 补扫重新引入。** [#858](https://github.com/sonofmagic/weapp-tailwindcss/pull/858) by @github-actions
  - 新增 e2e-watch HMR 速度报告产物，CI 每次 watch 回归都会输出 hot update 的 avg/p50/p95/max、按项目和按场景拆分的耗时摘要，并随 artifact 上传。
  - 补齐 Tailwind CSS v4 `@source inline(...)` 与 `@source not inline(...)` 在 Vite/PostCSS 生成模式下的候选收集支持，覆盖 brace expansion、换行参数、`source(none)`/全量排除以及内联排除文件候选等场景。

## 5.0.0-next.9

### Patch Changes

- 🐛 **修复 uni-app Vite 小程序构建中动态模板类名转译不完整的问题，确保 `wxml` 以及其它小程序模板目标在完整 `runtimeSet` 重试后可以继续转译 `h-[458rpx]`、`w-[218rpx]`、`inset-x-[30%]` 等任意值类名，并避免 Tailwind CSS v3 `@apply` 使用 `min-w-0` 等工具类时误报 unknown utility。** [`5cb48cc`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5cb48cc47c074d52d73b2bdb7481e1224d541305) by @sonofmagic

## 5.0.0-next.8

### Patch Changes

- 🐛 **修复 Tailwind CSS v3/v4 在部分生成链路中把 `text-[55rpx]` 等任意值误判为颜色时，非主 CSS chunk 没有恢复为长度声明的问题。** [#856](https://github.com/sonofmagic/weapp-tailwindcss/pull/856) by @github-actions

- 🐛 **支持 Vite、Webpack 和 Gulp 场景下自动识别 Tailwind CSS v4 入口 CSS，未显式传入 `cssEntries` 时会捕获包含 Tailwind 根指令的样式内容，并通过 `tailwindcss-patch@9.3.3` 的 `cssSources` 刷新运行时 patcher；显式配置 `cssEntries` 或 `cssSources` 时仍保持用户配置优先。** [#856](https://github.com/sonofmagic/weapp-tailwindcss/pull/856) by @github-actions
- 📦 **Dependencies** [`42906cb`](https://github.com/sonofmagic/weapp-tailwindcss/commit/42906cb2daec75c30fe6cf60c0f005cd462de888)
  → `tailwindcss-config@1.1.6-next.1`, `@weapp-tailwindcss/postcss@2.2.1-next.1`

## 5.0.0-next.7

### Patch Changes

- 🐛 **精简 `weapp-tw patch` 兼容链路：该命令在 v5 中改为无需执行的兼容提示，移除目标记录、workspace 批量 patch、运行时 `twPatcher.patch()` 初始化调用与手动 patch 状态检查相关逻辑，由构建运行时直接接管 Tailwind CSS 处理。** [#855](https://github.com/sonofmagic/weapp-tailwindcss/pull/855) by @github-actions

- 🐛 **修复全新安装后 Tailwind CSS v3 未自动准备运行时补丁导致的 `rpx` 任意值误判、生成模式 classSet 为空，以及 Vite/JS 任意值类名未转译问题。** [#855](https://github.com/sonofmagic/weapp-tailwindcss/pull/855) by @github-actions

- 🐛 **按 Tailwind CSS 主版本解析默认 `cssPreflight`，v4 运行时改用 `margin: 0`、`padding: 0` 和 `border: 0 solid`，避免继续注入 v3 的拆分边框默认值。** [#855](https://github.com/sonofmagic/weapp-tailwindcss/pull/855) by @github-actions

- 🐛 **修复 Vite watch 场景下生成器候选类刷新不完整的问题，确保脚本中新增的原子类能同步生成到小程序样式产物。** [#855](https://github.com/sonofmagic/weapp-tailwindcss/pull/855) by @github-actions
  - 补齐 demo 与 apps 的 watch/HMR 端到端覆盖，在模板、脚本与样式变更后同时校验小程序模板、JS 与 WXSS 产物中的转义结果。
- 📦 **Dependencies**
  → `@weapp-tailwindcss/reset@0.1.1-next.0`

## 5.0.0-next.6

### Patch Changes

- 🐛 **清理 `weapp-tailwindcss` 中未接入生产链路的历史残留代码与孤立测试，并移除不再直接使用的 `cac`、`webpack-sources` 依赖。** [#854](https://github.com/sonofmagic/weapp-tailwindcss/pull/854) by @github-actions

- 🐛 **修复 Webpack 生成模式在 MPX watch/HMR 场景下，仅脚本类名集合变化时可能复用旧 WXSS 缓存，导致脚本中新加的 Tailwind 工具类未生成样式的问题。** [#854](https://github.com/sonofmagic/weapp-tailwindcss/pull/854) by @github-actions
  - 将 `demo/mpx-app` 的 script-only 新增类名回归纳入正式 watch-HMR 覆盖，并接入 `e2e:ci` 的稳定热更新门禁。

- 🐛 **移除 `weapp-tailwindcss` 中遗留的 mangle 相关依赖、常量、测试夹具与历史快照，保留当前小程序类名转义链路。** [#854](https://github.com/sonofmagic/weapp-tailwindcss/pull/854) by @github-actions

## 5.0.0-next.5

### Major Changes

- 🚀 **移除 `tailwindcssPatcherOptions` 中早期的 `patch`、`tailwind`、`features`、`output` 兼容配置形态，仅保留 `tailwindcss-patch` 当前的 `TailwindCssPatchOptions` 配置结构。** [#853](https://github.com/sonofmagic/weapp-tailwindcss/pull/853) by @github-actions
  - 同时删除未接入主转译链路的实验性 SWC/OXC JS handler 入口，避免继续维护无消费方的 POC 代码。

- 🚀 **移除 Webpack4、PostCSS7、Tailwind CSS v2 兼容链路，不再导出 `weapp-tailwindcss/webpack4`，并删除旧包名 `weapp-tailwindcss-webpack-plugin` 的 CLI 别名。** [#853](https://github.com/sonofmagic/weapp-tailwindcss/pull/853) by @github-actions
  - `pluginName` 现在使用 `weapp-tailwindcss`。如果项目仍依赖 Webpack4、`@tailwindcss/postcss7-compat` 或 Tailwind CSS v2，请继续停留在旧版本。

### Minor Changes

- ✨ **新增 `arbitraryValues.bareArbitraryValues` 配置，默认关闭。开启后会把 UnoCSS 风格裸任意值识别交给 `tailwindcss-patch` v4 引擎处理，例如 `p-10%`、`p-2.5px`、`m-4rem`，小程序侧继续按生成出的 `classNameSet` 精确转义。** [#853](https://github.com/sonofmagic/weapp-tailwindcss/pull/853) by @github-actions
  - 升级 `tailwindcss-patch` 到 `9.3.0`。

### Patch Changes

- 🐛 **修复 Gulp 生成模式在 dev/watch 场景下模板或脚本新增类名后，主 WXSS 复用旧 classSet 缓存导致缺少新增样式的问题。** [#853](https://github.com/sonofmagic/weapp-tailwindcss/pull/853) by @github-actions
  - 修复 Webpack 生成模式在仅 JS 类名集合变化时主 WXSS 可能复用旧缓存的问题，并把稳定的 demo 热更新回归纳入 `pnpm e2e:ci`。
  - 将核心包的大体量内部开发脚本迁移到私有 workspace 项目 `@weapp-tailwindcss/scripts`，发布包内仅保留安装生命周期所需脚本。

- 🐛 **移除初始化流程和核心包安装生命周期中的 `weapp-tw patch` 自动入口。当前生成模式会在构建运行时接管 Tailwind CSS 补丁与类名收集，新项目不再需要把补丁命令写入 `postinstall`；旧 CSS 后处理链路仍可手动执行 `weapp-tw patch` 或 `weapp-tw status` 排查状态。** [#853](https://github.com/sonofmagic/weapp-tailwindcss/pull/853) by @github-actions
  - 执行 `weapp-tw patch` 时会提示 `weapp-tailwindcss@5` 生成模式不再需要该指令，也不需要配置 `postinstall` 这个 npm hook，避免新项目继续复制旧链路配置。
- 📦 **Dependencies** [`00ecc29`](https://github.com/sonofmagic/weapp-tailwindcss/commit/00ecc2998ee1b00a2de65c7fd45b396f5d7e0931)
  → `@weapp-tailwindcss/reset@0.1.1-next.0`

## 5.0.0-next.4

### Minor Changes

- ✨ **移除 v4 时代“先生成浏览器 CSS 再后处理”的关闭生成器链路，`generator: false` 现在按默认生成模式处理，Vite、Webpack、Gulp 与 PostCSS 入口统一由 weapp-tailwindcss 接管 Tailwind CSS 样式生成。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

### Patch Changes

- 🐛 **标记 v5 默认生成模式稳定后不再推荐的兼容配置，并在迁移文档中补充 `generator` 布尔写法、`mode`、默认 `target`、PostCSS 顶层 `target`、`staleClassNameFallback`、`rewriteCssImports` 与旧 Vite 插件命名的废弃说明。** [`d329bcf`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d329bcf83122680e4348f096b4ff314ff52859ad) by @sonofmagic

- 🐛 **修复 Mpx webpack 场景下 `@mpxjs/webpack-plugin` 子路径 loader 解析失败的问题，并补充跨框架支持矩阵的 CI 与 IDE 验证入口。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

- 🐛 **支持在生成模式中通过 `generator.config` 指定 Tailwind 配置文件，兼容原 Tailwind PostCSS 插件 `config` 选项的手动配置路径用法。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

- 🐛 **修正 Tailwind CSS v3 项目的默认生成模式行为：`auto` 会和 Tailwind CSS v4 一样由 weapp-tailwindcss 接管 Tailwind 样式生成，并移除重复的官方 Tailwind PostCSS 链路。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

- 🐛 **修复 v5 默认生成模式在 Tailwind CSS v3 + uni-app Vite 小程序/quickapp 构建中遗漏 `@tailwind`/`@apply` 展开导致产物残留原始 Tailwind 指令的问题。现在 `@apply` 会作为生成入口参与 Tailwind v3 样式生成，并且生成后的兼容 CSS 追加不会把未展开的 `@apply` 规则重新写回产物。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

- 🐛 **补充 Tailwind CSS v4 生成模式对官方 Adding custom styles 写法的回归覆盖，确保 `@theme`、任意值/属性/变体、自定义 CSS、`@utility` 函数式工具类和 `@custom-variant` 在生成模式下保持语义一致。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

- 🐛 **修复 Tailwind CSS v4 生成模式下 colors 透明度变量在小程序样式兼容阶段被静态降级为不透明色的问题，并补充颜色工具类、`@theme` 自定义颜色与禁用默认颜色的回归覆盖。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

- 🐛 **修复小程序样式转换中错误保留 `[data-theme=dark]` / `[data-mode="dark"]` 这类属性选择器的问题。web 目标继续保留 Tailwind CSS v4 data attribute dark variant，小程序目标会移除依赖属性选择器的无效规则，避免生成小程序不支持的选择器或让 dark 样式无条件生效。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

- 🐛 **修复 Tailwind CSS v4 生成模式下 data attribute 版 `@custom-variant dark` 在小程序选择器兜底清理阶段丢失属性选择器的问题，并补充默认媒体查询、`.dark` 自定义选择器和 `[data-theme=dark]` 自定义选择器的回归覆盖。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

- 🐛 **修复 Tailwind CSS v4 生成模式下 `tailwindcss/preflight.css` subpath import 的处理策略：web 目标仅在显式使用 `layer(...)` 导入时保留 Preflight，小程序目标继续裁剪浏览器标签 reset，并补充对应回归测试。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

- 🐛 **修复 Tailwind CSS v4 生成模式下 bundler 和 PostCSS 入口未启用官方 source detection 的问题，支持自动扫描、`@source`、`source(...)` / `source(none)`、`@source not`、`inline()` 与 brace expansion 等规则，同时保持 Tailwind CSS v3 生成链路不变。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

- 🐛 **完善 Tailwind CSS v4 生成模式对 `package.json#imports` subpath imports 的支持：`@import "#..."` 会触发默认生成模式，`@config "#..."` 会保留给 Tailwind v4 按官方规则解析，并新增 `@import`、`@reference`、`@plugin`、`@config` 的真实生成回归测试。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

- 🐛 **修复 Tailwind CSS v4 生成模式下 `--animate-*` 主题变量对应的 `@keyframes` 在小程序 CSS 裁剪阶段被误删的问题，并补充 `@theme` 命名空间、`inline`、`static`、自定义主题重置和主题变量引用的回归覆盖。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

- 🐛 **升级 `tailwindcss-patch` 到 `9.2.1`，同步消费最新补丁版本。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions

- 🐛 **增强 Vite v5 生成模式的 Tailwind 依赖追踪，在生成 CSS 时向 Vite 注册生成器依赖，覆盖 CSS 入口、配置文件和 Tailwind source 解析产物。** [#852](https://github.com/sonofmagic/weapp-tailwindcss/pull/852) by @github-actions
- 📦 **Dependencies** [`3d11ae3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3d11ae36e3d244d22d816ad1b6fb5d1984bc5c8c)
  → `@weapp-tailwindcss/postcss@2.2.1-next.0`

## 5.0.0-next.3

### Minor Changes

- ✨ **默认启用 v5 样式生成模式，让 Vite、Webpack、Gulp 与 PostCSS 入口在未显式关闭 `generator` 时由 weapp-tailwindcss 接管 Tailwind CSS 样式生成。** [`25124cc`](https://github.com/sonofmagic/weapp-tailwindcss/commit/25124cc2877b6a903381fc0c708477a87138904a) by @sonofmagic

## 5.0.0-next.2

### Patch Changes

- 🐛 **修复 Tailwind CSS v4 小程序生成模式默认颜色与 v3 不一致的问题，Tailwind CSS v3 兼容模式下恢复 v3 默认色板，并避免输出小程序不支持的 `oklch` 默认颜色。** [#846](https://github.com/sonofmagic/weapp-tailwindcss/pull/846) by @sonofmagic

- 🐛 **修复 Tailwind CSS v3 生成器在插件 class cache 中过滤通配符候选时的兼容问题，补充 v3/v4 生成器对官方插件、自定义插件和 Iconify 图标插件的回归覆盖，并在 Tailwind CSS v4 小程序生成模式下将默认颜色变量替换为小程序可识别的 hex 色值。** [#846](https://github.com/sonofmagic/weapp-tailwindcss/pull/846) by @sonofmagic

- 🐛 **补齐 Tailwind CSS v4 生成模式升级兼容覆盖，固定 v3/v4 默认值、preflight、space/divide 选择器与新版候选类语法在小程序目标下的输出行为。** [#846](https://github.com/sonofmagic/weapp-tailwindcss/pull/846) by @sonofmagic

- 🐛 **修复 Tailwind CSS v4 小程序生成模式默认值与 v3 不一致的问题，默认注入 Tailwind CSS v3 兼容默认值。** [#846](https://github.com/sonofmagic/weapp-tailwindcss/pull/846) by @sonofmagic

## 5.0.0-next.1

### Minor Changes

- ✨ **为 Vite、Webpack、Webpack4 与 Gulp 入口新增推荐的 `WeappTailwindcss` 导出别名，并保留小写 `weappTailwindcss` 用法，方便各构建器使用统一插件注册名称。PostCSS 入口继续使用默认导出。** [#846](https://github.com/sonofmagic/weapp-tailwindcss/pull/846) by @sonofmagic

## 5.0.0-next.0

### Major Changes

- 🚀 **新增 Tailwind CSS v4 生成器公共入口，并提供 PostCSS 插件入口，支持按 `weapp`、`web` 与 `tailwind` 目标生成平台产物。** [#846](https://github.com/sonofmagic/weapp-tailwindcss/pull/846) by @sonofmagic
  - Vite 插件支持通过 `generator` 选项启用 Tailwind CSS v4 直接生成链路，`force` 模式会把生成器产物作为主 CSS 真源；PostCSS 插件支持收集本地 `@source` 指向的小程序模板源码，生成更贴近小程序运行环境的 CSS。同步迁移 Tailwind CSS v4 的 Vite 示例到标准 `@import "tailwindcss"` 入口。
  - 新增独立 v5 生成器 demo 与使用示例文档，覆盖 uni-app Vue Vite、Taro Vite 与 Mpx，并保留原有 v4 demo 用法用于历史链路回归。

### Minor Changes

- ✨ **增强 v5 生成器的 Tailwind CSS v4 source 发现能力：PostCSS 插件默认按 CSS 入口目录扫描源码并支持 `@source not` 排除，Vite 生成器路径透传 `tailwindcss.v4.sources` 配置。** [#846](https://github.com/sonofmagic/weapp-tailwindcss/pull/846) by @sonofmagic

### Patch Changes

- 📦 **Dependencies** [`f38313a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f38313a61c673cf3658eba0e29cf3c8c844f6798)
  → `tailwindcss-config@1.1.6-next.0`

## 4.12.0

### Minor Changes

- ✨ **优化 JS Handler 结果缓存策略，提升 HMR 和 Bundler 场景下的缓存命中率。** [`790bc9f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/790bc9f56383cf0330b8ad76a8b8c0a3f85ac05c) by @sonofmagic
  - 将缓存淘汰策略从 FIFO 替换为 LRU（复用已有 `lru-cache` 依赖），缓存上限从 256 提升到 512，确保高频访问的文件不被低频文件驱逐。
  - 使用内容哈希（MD5）替代原始源码字符串作为缓存键，移除 512 字符的源码长度限制，大文件也能被缓存。
  - 移除 Bundler 路径（含 `filename`/`moduleGraph`）的缓存排除逻辑，Webpack/Vite/Gulp 调用也能命中结果缓存。
  - 新增选项指纹（Options Fingerprint）机制，将影响转译结果的 16 个字段序列化为唯一标识符，确保不同配置下的缓存正确隔离。
  - 简化选项解析缓存从 4 层 WeakMap 嵌套到 2 层结构，保持引用稳定性。
  - 含 `linked`（跨文件分析）或 `error`（解析失败）的结果不缓存，确保数据一致性。

- ✨ **将 JS 快速预检查机制扩展到所有构建器路径（Webpack v5、Webpack v4、Gulp、核心 API）。** [`ac76d03`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ac76d03ab63ffc4f67ef1a2874a2cf330605575b) by @sonofmagic
  - 新增共享预检查模块 `src/js/precheck.ts`，通过正则快速判断 JS 文件是否需要转译，跳过不必要的 Babel AST 解析。
  - 原 Vite 专属的 `shouldSkipViteJsTransform` 改为从共享模块 re-export，保持向后兼容。
  - Webpack v5 的 `processAssets` 钩子、Webpack v4 的 `emit` 钩子、Gulp 的 `transformJs` 流、核心 `createContext().transformJs()` 均已集成预检查。
  - 新增环境变量 `WEAPP_TW_DISABLE_JS_PRECHECK`，设置为 `'1'` 时可禁用预检查，强制所有文件走完整转译流程。
  - 预检查开销极低：211KB 大文件仅需 ~171μs，小文件 <1μs，对需要转译的文件无性能影响。

### Patch Changes

- 🐛 **修复 `uni-app x` 的 `uvue/nvue` 样式目标会输出宿主不支持 CSS 的问题。** [`a835a94`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a835a94ae0780610dcb4da8439cdb8f5a44bb36c) by @sonofmagic
  - 在 `uvue` 目标下过滤非 class selector，避免继续输出 `space-x-*`、`space-y-*` 这类组合器选择器。
  - 在 `uvue` 目标下过滤不兼容声明，例如 `display: block`、`display: inline-flex`、`display: grid`、`grid-template-columns`、`gap`、`min-height: 100vh`。
  - 新增 `uniAppX.uvueUnsupported` 配置，支持 `error | warn | silent`，默认 `warn`。
  - 当策略为 `warn` 时，跳过不兼容 utility 并输出包含 class 名与来源文件的警告，避免 HBuilderX 因非法 CSS 直接报错。

- 🐛 **移除 Tailwind CSS v4 `bg-linear-to-*` 生成的 lab 渐变 `@supports` 检测块，避免小程序端保留无效的 `linear-gradient(in lab, red, red)` 兼容分支。** [`dc9791c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/dc9791cdebf812dba00877e5430606e275f7221f) by @sonofmagic
  - 保留基础 `--tw-gradient-position` 与 `background-image: linear-gradient(var(--tw-gradient-stops))` 产物，并补充 `bg-linear-to-r` 单测与 Taro Vite v4 端到端回归。

- 🐛 **新增 `weapp-tailwindcss doctor` 诊断命令，用于检查项目根目录、Node.js 版本、包管理器、Tailwind CSS、PostCSS、常见小程序框架和构建器配置，并支持 `--json` 与 `--strict` 输出模式。** [`b67c6d9`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b67c6d9a522ce0a38d99b754b77f27f22eb22557) by @sonofmagic

- 🐛 **统一 CLI 与 `doctor` 诊断命令的 Node.js 版本判断，按文档和包声明使用 `^20.19.0 || >=22.12.0` 范围，避免较低的 Node.js 22 版本被误判为可用。** [`41160e3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/41160e3538f752fd79348366a708edcb2e726b3e) by @sonofmagic

- 🐛 **调整 `postinstall` 补丁脚本：安装阶段遇到运行时模块缺失时不再中断 `pnpm install`，并保留 `cli:patch` 作为严格校验入口。** [`81dfa54`](https://github.com/sonofmagic/weapp-tailwindcss/commit/81dfa543e977ec42423465def752795bdbb50081) by @sonofmagic
  - 同时将包内测试脚本改为使用 `pnpm run cli:patch`，避免继续通过 `npm run postinstall` 复用安装生命周期。

- 🐛 **修复 Windows 环境下 watch HMR 回归场景的稳定性问题。** [`d9bda5a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d9bda5a8989eee3655d51af9307abe7cfa12c62c) by @sonofmagic
  - 放宽 Windows E2E Watch 的热更新耗时阈值，避免完整矩阵在 Windows runner 上因正常波动误判失败。
  - 扩大 fresh mutation class 的候选生成空间，避免历史 watch class 累积后无法生成新 class。
  - 恢复 Windows nightly 完整场景的默认重试能力，降低 runner 抖动对 E2E Watch 的影响。

- 🐛 **在 Tailwind CSS v4 场景下默认启用内置 autoprefixer 后处理，为小程序 CSS 补齐 `-webkit-background-clip: text` 等 WebView 兼容前缀，并新增 `autoprefixer: false` 配置用于显式关闭。** [`501a5c2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/501a5c250f5d96edb5dae72f082e745ec0dbe486) by @sonofmagic
- 📦 **Dependencies** [`a835a94`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a835a94ae0780610dcb4da8439cdb8f5a44bb36c)
  → `@weapp-tailwindcss/postcss@2.2.0`, `@weapp-tailwindcss/reset@0.1.0`

## 4.12.0-alpha.3

### Patch Changes

- 🐛 **修复 Windows 环境下 watch HMR 回归场景的稳定性问题。** [`d9bda5a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d9bda5a8989eee3655d51af9307abe7cfa12c62c) by @sonofmagic
  - 放宽 Windows E2E Watch 的热更新耗时阈值，避免完整矩阵在 Windows runner 上因正常波动误判失败。
  - 扩大 fresh mutation class 的候选生成空间，避免历史 watch class 累积后无法生成新 class。
  - 恢复 Windows nightly 完整场景的默认重试能力，降低 runner 抖动对 E2E Watch 的影响。

## 4.12.0-alpha.2

### Patch Changes

- 🐛 **新增 `weapp-tailwindcss doctor` 诊断命令，用于检查项目根目录、Node.js 版本、包管理器、Tailwind CSS、PostCSS、常见小程序框架和构建器配置，并支持 `--json` 与 `--strict` 输出模式。** [`b67c6d9`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b67c6d9a522ce0a38d99b754b77f27f22eb22557) by @sonofmagic

- 🐛 **统一 CLI 与 `doctor` 诊断命令的 Node.js 版本判断，按文档和包声明使用 `^20.19.0 || >=22.12.0` 范围，避免较低的 Node.js 22 版本被误判为可用。** [`41160e3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/41160e3538f752fd79348366a708edcb2e726b3e) by @sonofmagic

- 🐛 **调整 `postinstall` 补丁脚本：安装阶段遇到运行时模块缺失时不再中断 `pnpm install`，并保留 `cli:patch` 作为严格校验入口。** [`81dfa54`](https://github.com/sonofmagic/weapp-tailwindcss/commit/81dfa543e977ec42423465def752795bdbb50081) by @sonofmagic
  - 同时将包内测试脚本改为使用 `pnpm run cli:patch`，避免继续通过 `npm run postinstall` 复用安装生命周期。

## 4.12.0-alpha.1

### Patch Changes

- 📦 **Dependencies** [`8d4131f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8d4131fc0832f9db9c631a1c7f2964094a77b8a6)
  → `@weapp-tailwindcss/postcss@2.2.0-alpha.1`

## 4.12.0-next.0

### Minor Changes

- ✨ **优化 JS Handler 结果缓存策略，提升 HMR 和 Bundler 场景下的缓存命中率。** [`790bc9f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/790bc9f56383cf0330b8ad76a8b8c0a3f85ac05c) by @sonofmagic
  - 将缓存淘汰策略从 FIFO 替换为 LRU（复用已有 `lru-cache` 依赖），缓存上限从 256 提升到 512，确保高频访问的文件不被低频文件驱逐。
  - 使用内容哈希（MD5）替代原始源码字符串作为缓存键，移除 512 字符的源码长度限制，大文件也能被缓存。
  - 移除 Bundler 路径（含 `filename`/`moduleGraph`）的缓存排除逻辑，Webpack/Vite/Gulp 调用也能命中结果缓存。
  - 新增选项指纹（Options Fingerprint）机制，将影响转译结果的 16 个字段序列化为唯一标识符，确保不同配置下的缓存正确隔离。
  - 简化选项解析缓存从 4 层 WeakMap 嵌套到 2 层结构，保持引用稳定性。
  - 含 `linked`（跨文件分析）或 `error`（解析失败）的结果不缓存，确保数据一致性。

- ✨ **将 JS 快速预检查机制扩展到所有构建器路径（Webpack v5、Webpack v4、Gulp、核心 API）。** [`ac76d03`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ac76d03ab63ffc4f67ef1a2874a2cf330605575b) by @sonofmagic
  - 新增共享预检查模块 `src/js/precheck.ts`，通过正则快速判断 JS 文件是否需要转译，跳过不必要的 Babel AST 解析。
  - 原 Vite 专属的 `shouldSkipViteJsTransform` 改为从共享模块 re-export，保持向后兼容。
  - Webpack v5 的 `processAssets` 钩子、Webpack v4 的 `emit` 钩子、Gulp 的 `transformJs` 流、核心 `createContext().transformJs()` 均已集成预检查。
  - 新增环境变量 `WEAPP_TW_DISABLE_JS_PRECHECK`，设置为 `'1'` 时可禁用预检查，强制所有文件走完整转译流程。
  - 预检查开销极低：211KB 大文件仅需 ~171μs，小文件 <1μs，对需要转译的文件无性能影响。

### Patch Changes

- 🐛 **修复 `uni-app x` 的 `uvue/nvue` 样式目标会输出宿主不支持 CSS 的问题。** [`a835a94`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a835a94ae0780610dcb4da8439cdb8f5a44bb36c) by @sonofmagic
  - 在 `uvue` 目标下过滤非 class selector，避免继续输出 `space-x-*`、`space-y-*` 这类组合器选择器。
  - 在 `uvue` 目标下过滤不兼容声明，例如 `display: block`、`display: inline-flex`、`display: grid`、`grid-template-columns`、`gap`、`min-height: 100vh`。
  - 新增 `uniAppX.uvueUnsupported` 配置，支持 `error | warn | silent`，默认 `warn`。
  - 当策略为 `warn` 时，跳过不兼容 utility 并输出包含 class 名与来源文件的警告，避免 HBuilderX 因非法 CSS 直接报错。

- 🐛 **在 Tailwind CSS v4 场景下默认启用内置 autoprefixer 后处理，为小程序 CSS 补齐 `-webkit-background-clip: text` 等 WebView 兼容前缀，并新增 `autoprefixer: false` 配置用于显式关闭。** [`501a5c2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/501a5c250f5d96edb5dae72f082e745ec0dbe486) by @sonofmagic
- 📦 **Dependencies** [`a835a94`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a835a94ae0780610dcb4da8439cdb8f5a44bb36c)
  → `@weapp-tailwindcss/postcss@2.2.0-next.0`, `@weapp-tailwindcss/reset@0.1.0-next.0`

## 4.11.2

### Patch Changes

- 🐛 **修复 `weapp-vite dev` 启动时 `weapp-tailwindcss` 运行时 Tailwind CSS 日志重复输出的问题。** [`5264907`](https://github.com/sonofmagic/weapp-tailwindcss/commit/526490725b1143a03af90a23eb69f43ad9eb684d) by @sonofmagic
  - 现在同一进程内针对相同 Tailwind CSS 目标与版本的运行时日志会自动去重，仅输出一次，同时保留 CLI 场景的目标路径日志不变。

- 🐛 **精简运行时 Tailwind CSS 绑定日志，避免输出冗长的依赖绝对路径。** [`d2586fa`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d2586fae685a0cf3d96f76d963660940215d42e2) by @sonofmagic
  - 现在运行时会输出 `Weapp-tailwindcss 使用 Tailwind CSS (vX.Y.Z)`，同时保留 CLI `weapp-tw patch` 场景的详细目标路径日志，便于排查补丁绑定目标。

## 4.11.1

### Patch Changes

- 🐛 **修复 taro weapp 场景下 `app-origin.wxss` 仍可能残留 `:not(#n)` 占位选择器的问题，并补充 `#834` 的回归测试，确保最终输出不再包含 `@layer`、`:not(#\\#)` 与 `:not(#n)`。** [`7942ef4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7942ef486a1990e113c0e54a665ceb278cfb7bce) by @sonofmagic

- 🐛 **修复 Taro Vite Tailwind CSS v4 构建时最终样式产物仍残留 `:not(#\#)` / `:not(#n)` 的问题。** [`f972c34`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f972c34fd64954ef15992d0a3d203300f1ccb2ed) by @sonofmagic
  - 同时为 Taro demo 的构建守卫增加对 `@tarojs/plugin-doctor` 原生检查的安全绕过，避免当前环境下其 Rust 模块 panic 导致 demo 无法完成真实构建验证。
- 📦 **Dependencies** [`7942ef4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7942ef486a1990e113c0e54a665ceb278cfb7bce)
  → `@weapp-tailwindcss/postcss@2.1.7`

## 4.11.0

### Minor Changes

- ✨ **为所有编译插件入口新增 `weappTailwindcss` 别名导出，方便用户统一简写引用：** [#819](https://github.com/sonofmagic/weapp-tailwindcss/pull/819) by @sonofmagic
  - `weapp-tailwindcss/webpack` → `UnifiedWebpackPluginV5` 的别名
  - `weapp-tailwindcss/webpack4` → `UnifiedWebpackPluginV4` 的别名
  - `weapp-tailwindcss/vite` → `UnifiedViteWeappTailwindcssPlugin` 的别名
  - `weapp-tailwindcss/gulp` → `createPlugins` 的别名

### Patch Changes

- 🐛 **修复 Vite 集成在 dts 构建阶段替换 postcss 插件时触发的类型递归比较问题，避免 TS2321 与 TS2345 导致构建失败。** [`c8860fa`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c8860fa202e202833f2c503fd7ea53af824a76fe) by @sonofmagic
  - 同时升级部分依赖与工作区 catalog 版本（包括 postcss、fs-extra、storybook 等），并同步更新锁文件以保持依赖解析一致性。

- 🐛 **修复 `uni-app x / uvue` 下 `@tailwind base` 的伪元素选择器兼容问题：** [`577f2b7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/577f2b7a4ab20f9d819e5a8826a535a4895cf712) by @sonofmagic
  - 在 `uni-app x` 模式下移除 `::before`、`::after`、`:before`、`:after`、`::backdrop` 等 `uvue` 不支持的选择器，避免 `App.uvue` 保留 `@tailwind base` 时编译报错
  - 保留 `*` 上的 Tailwind CSS 变量初始化与有效基础规则，确保基础 reset 与 utility 依赖的 CSS 变量不回退
  - 补充 `uni-app x + @tailwind base + styleIsolationVersion=2` 的 regression test，并验证 issue #822 相关组件局部样式能力不回退

- 🐛 **完善 `e2e:watch` 热更新回归流程：** [#819](https://github.com/sonofmagic/weapp-tailwindcss/pull/819) by @sonofmagic
  - 新增 `demo` 与 `apps` 分组测试入口，避免分组执行时重复跑单 case 文件
  - 将 `test:watch-hmr` 切换为 `node --import tsx` 启动，修复部分环境下 `tsx` IPC `EPERM` 导致的回归无法启动问题
  - 调整 `apps/taro-webpack-tailwindcss-v4` 的 watch 回归命令，确保 Taro webpack 场景下模板、脚本、样式热更新都能稳定校验

- 🐛 **Miscellaneous improvements** [`534e817`](https://github.com/sonofmagic/weapp-tailwindcss/commit/534e8175cb430405f833489543cdd4eec3dd6ebd) by @sonofmagic
  - 正式支持 `uni-app x + HBuilderX 5 + styleIsolationVersion=2` 下组件级 Tailwind 局部样式注入，修复 `components/**/*.uvue` 内部子节点 class 在组件隔离模式下不生效的问题
  - 在 `uniAppX` 配置中新增对象形态与 `componentLocalStyles` 细粒度控制，preset 默认开启该能力，并默认仅在 `manifest.json` 的 `styleIsolationVersion=2` 时生效
  - `manifest.json` 改为使用 `comment-json` 解析，兼容 HBuilderX 常见的注释写法，并补充 issue #822 回归测试覆盖静态与动态 class 场景

- 🐛 **修复 `watch-hmr` 回归校验在多场景下的稳定性问题：** [`c8a694c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c8a694c333866158501af6edc9733fe399bcc680) by @sonofmagic
  - 修正 `uni-app` 与 `skyline` 场景下的回归脚本行为，减少误判与漏判
  - 调整 warmup、settle 与 mutation sequencing 判定逻辑，避免编译未成功或内容变更时过早结束校验
  - 放宽部分同类样式与 `skyline` 样式热更断言，并跳过 `Windows` 下不稳定的 `skyline` watch 用例

- 🐛 **增强多平台热更新回归覆盖，补齐 `uni-app`、`uni-app-vue3-vite`、`mpx` 的 comment-carrier 场景，并新增汇总断言校验 same-class 稳定性、comment-carrier 命中数量与热更新时间指标。** [#819](https://github.com/sonofmagic/weapp-tailwindcss/pull/819) by @sonofmagic
  - 修复 `uni-app-vue3-vite` 在 comment-carrier 场景下 marker 无法进入运行时输出导致 watch-hmr 卡住的问题，同时将关键 HMR 用例接入 `E2E Watch` 工作流，确保 PR 与夜间任务都能持续校验多平台热更新链路。

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

- 🐛 **修复 `uni-app x` 在 `HBuilderX` 小程序运行场景下的 Tailwind 目标绑定问题，并收敛 preset 默认配置：** [`dfc2ab2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/dfc2ab2d702d3892bbddbb6bd3808fb0b6f9bcd3) by @sonofmagic
  - `uniAppX` preset 现在会自动补齐 `resolve.paths`，并根据当前工程已安装的 Tailwind 版本推断默认 patcher 配置
  - 修复显式 `tailwindcss@3` 工程被 `v4` 配置对象误判的问题，避免运行时类名集合绑定到错误的 Tailwind 目标
  - `demo/uni-app-x-hbuilderx-tailwindcss3` 可在更少用户配置下直接运行到微信小程序端，并正确转译 `text-[50px]`、`border-[#ff0000]` 等动态类名

- 🐛 **修复 `uni-app x` 组件局部样式中的静态 class 回归问题：** [`0590c21`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0590c2119d82ecbc2097eecd9e67a12dc9151320) by @sonofmagic
  - 修复 `styleIsolationVersion=2` 下普通自定义 scoped class 被错误当成 Tailwind utility 本地化，并生成非法 `@apply` 的问题
  - 保持 issue #822 的组件局部 Tailwind 样式注入能力不回退，静态与动态 Tailwind class 仍然会正确进入组件局部样式作用域
  - 补充混合 `Tailwind class + scoped custom class` 的 regression fixture 与测试，覆盖 `app-android` 场景
- 📦 **Dependencies** [`c8860fa`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c8860fa202e202833f2c503fd7ea53af824a76fe)
  → `@weapp-tailwindcss/postcss@2.1.6`, `@weapp-tailwindcss/shared@1.1.3`

## 4.11.0-alpha.8

### Patch Changes

- 🐛 **修复 `uni-app x / uvue` 下 `@tailwind base` 的默认兼容行为，并同步稳定相关测试：** [`699dfe2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/699dfe21ddbb41dcb8f5e401800767a2098c3707) by @sonofmagic
  - 将 `uni-app x` 的 base 兼容后处理收敛到 `@weapp-tailwindcss/postcss`，不再由 `weapp-tailwindcss` 额外持有私有样式后处理
  - 在 `uni-app x` 模式下移除对 `view`、`text`、`*`、`::before`、`::after`、`:before`、`:after`、`::backdrop` 等全局 carrier selector 的依赖
  - 将 utility 运行所需的 `--tw-*` 默认变量按需下沉到具体 class selector，保证保留 `@tailwind base` 时仍可正常编译和运行
  - 更新 `uni-app x`、bundler、tailwindcss 全量大用例的回归断言与超时设置，避免在完整测试中因旧预期或默认超时导致误报失败
- 📦 **Dependencies** [`699dfe2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/699dfe21ddbb41dcb8f5e401800767a2098c3707)
  → `@weapp-tailwindcss/postcss@2.1.6-alpha.3`

## 4.11.0-alpha.7

### Patch Changes

- 🐛 **修复 `uni-app x / uvue` 下 `@tailwind base` 的伪元素选择器兼容问题：** [`577f2b7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/577f2b7a4ab20f9d819e5a8826a535a4895cf712) by @sonofmagic
  - 在 `uni-app x` 模式下移除 `::before`、`::after`、`:before`、`:after`、`::backdrop` 等 `uvue` 不支持的选择器，避免 `App.uvue` 保留 `@tailwind base` 时编译报错
  - 保留 `*` 上的 Tailwind CSS 变量初始化与有效基础规则，确保基础 reset 与 utility 依赖的 CSS 变量不回退
  - 补充 `uni-app x + @tailwind base + styleIsolationVersion=2` 的 regression test，并验证 issue #822 相关组件局部样式能力不回退
- 📦 **Dependencies** [`577f2b7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/577f2b7a4ab20f9d819e5a8826a535a4895cf712)
  → `@weapp-tailwindcss/postcss@2.1.6-alpha.2`

## 4.11.0-alpha.6

### Patch Changes

- 🐛 **修复 `uni-app x` 组件局部样式中的静态 class 回归问题：** [`0590c21`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0590c2119d82ecbc2097eecd9e67a12dc9151320) by @sonofmagic
  - 修复 `styleIsolationVersion=2` 下普通自定义 scoped class 被错误当成 Tailwind utility 本地化，并生成非法 `@apply` 的问题
  - 保持 issue #822 的组件局部 Tailwind 样式注入能力不回退，静态与动态 Tailwind class 仍然会正确进入组件局部样式作用域
  - 补充混合 `Tailwind class + scoped custom class` 的 regression fixture 与测试，覆盖 `app-android` 场景

## 4.11.0-alpha.5

### Patch Changes

- 🐛 **Miscellaneous improvements** [`534e817`](https://github.com/sonofmagic/weapp-tailwindcss/commit/534e8175cb430405f833489543cdd4eec3dd6ebd) by @sonofmagic
  - 正式支持 `uni-app x + HBuilderX 5 + styleIsolationVersion=2` 下组件级 Tailwind 局部样式注入，修复 `components/**/*.uvue` 内部子节点 class 在组件隔离模式下不生效的问题
  - 在 `uniAppX` 配置中新增对象形态与 `componentLocalStyles` 细粒度控制，preset 默认开启该能力，并默认仅在 `manifest.json` 的 `styleIsolationVersion=2` 时生效
  - `manifest.json` 改为使用 `comment-json` 解析，兼容 HBuilderX 常见的注释写法，并补充 issue #822 回归测试覆盖静态与动态 class 场景

## 4.11.0-alpha.4

### Patch Changes

- 🐛 **修复 `uni-app x` 在 `HBuilderX` 小程序运行场景下的 Tailwind 目标绑定问题，并收敛 preset 默认配置：** [`dfc2ab2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/dfc2ab2d702d3892bbddbb6bd3808fb0b6f9bcd3) by @sonofmagic
  - `uniAppX` preset 现在会自动补齐 `resolve.paths`，并根据当前工程已安装的 Tailwind 版本推断默认 patcher 配置
  - `uniAppX` 现支持对象配置；preset 默认开启 `componentLocalStyles`，并默认仅在 `manifest.json` 的 `styleIsolationVersion=2` 时生效
  - 新增 `uniAppX.componentLocalStyles.enabled` 与 `uniAppX.componentLocalStyles.onlyWhenStyleIsolationVersion2` 细粒度开关，用于控制 issue #822 所需的组件局部样式注入
  - 修复显式 `tailwindcss@3` 工程被 `v4` 配置对象误判的问题，避免运行时类名集合绑定到错误的 Tailwind 目标
  - `demo/uni-app-x-hbuilderx-tailwindcss3` 可在更少用户配置下直接运行到微信小程序端，并正确转译 `text-[50px]`、`border-[#ff0000]` 等动态类名

## 4.11.0-alpha.3

### Patch Changes

- 🐛 **修复 `watch-hmr` 回归校验在多场景下的稳定性问题：** [`c8a694c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c8a694c333866158501af6edc9733fe399bcc680) by @sonofmagic
  - 修正 `uni-app` 与 `skyline` 场景下的回归脚本行为，减少误判与漏判
  - 调整 warmup、settle 与 mutation sequencing 判定逻辑，避免编译未成功或内容变更时过早结束校验
  - 放宽部分同类样式与 `skyline` 样式热更断言，并跳过 `Windows` 下不稳定的 `skyline` watch 用例

## 4.11.0-alpha.2

### Patch Changes

- 🐛 **升级 `tailwindcss-patch` 到 `8.7.4-alpha.0`，同步消费最新的 alpha 版本依赖。** [#819](https://github.com/sonofmagic/weapp-tailwindcss/pull/819) by @sonofmagic
- 📦 **Dependencies** [`cbead4c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/cbead4ced4b7cba116488d745d47bf826bc83859)
  → `@weapp-tailwindcss/postcss@2.1.6-alpha.1`, `@weapp-tailwindcss/shared@1.1.3-alpha.1`

## 4.11.0-alpha.1

### Patch Changes

- 🐛 **完善 `e2e:watch` 热更新回归流程：** [#819](https://github.com/sonofmagic/weapp-tailwindcss/pull/819) by @sonofmagic
  - 新增 `demo` 与 `apps` 分组测试入口，避免分组执行时重复跑单 case 文件
  - 将 `test:watch-hmr` 切换为 `node --import tsx` 启动，修复部分环境下 `tsx` IPC `EPERM` 导致的回归无法启动问题
  - 调整 `apps/taro-webpack-tailwindcss-v4` 的 watch 回归命令，确保 Taro webpack 场景下模板、脚本、样式热更新都能稳定校验

## 4.11.0-alpha.0

### Minor Changes

- ✨ **为所有编译插件入口新增 `weappTailwindcss` 别名导出，方便用户统一简写引用：** [#819](https://github.com/sonofmagic/weapp-tailwindcss/pull/819) by @sonofmagic
  - `weapp-tailwindcss/webpack` → `UnifiedWebpackPluginV5` 的别名
  - `weapp-tailwindcss/webpack4` → `UnifiedWebpackPluginV4` 的别名
  - `weapp-tailwindcss/vite` → `UnifiedViteWeappTailwindcssPlugin` 的别名
  - `weapp-tailwindcss/gulp` → `createPlugins` 的别名

### Patch Changes

- 🐛 **修复 Vite 集成在 dts 构建阶段替换 postcss 插件时触发的类型递归比较问题，避免 TS2321 与 TS2345 导致构建失败。** [`c8860fa`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c8860fa202e202833f2c503fd7ea53af824a76fe) by @sonofmagic
  - 同时升级部分依赖与工作区 catalog 版本（包括 postcss、fs-extra、storybook 等），并同步更新锁文件以保持依赖解析一致性。

- 🐛 **增强多平台热更新回归覆盖，补齐 `uni-app`、`uni-app-vue3-vite`、`mpx` 的 comment-carrier 场景，并新增汇总断言校验 same-class 稳定性、comment-carrier 命中数量与热更新时间指标。** [#819](https://github.com/sonofmagic/weapp-tailwindcss/pull/819) by @sonofmagic
  - 修复 `uni-app-vue3-vite` 在 comment-carrier 场景下 marker 无法进入运行时输出导致 watch-hmr 卡住的问题，同时将关键 HMR 用例接入 `E2E Watch` 工作流，确保 PR 与夜间任务都能持续校验多平台热更新链路。

- 🐛 **性能优化：针对 CSS 选择器转换、JS 处理器、WXML 模板处理等热路径进行多项缓存与计算优化。** [`49e50d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/49e50d8bde7327d47e9ba649537092ea57bcdf16) by @sonofmagic
  - JS 处理器：复用 `resolveClassNameTransformWithResult` 返回的 `escapedValue` 避免重复 escape 计算；引入 `getReplacement` 缓存消除重复 `replaceWxml` 调用；移除 `escapeStringRegexp` + `new RegExp` 正则编译开销
  - `createJsHandler`：预构建默认 `defaults` 对象，无覆盖选项时跳过 `defuOverrideArray` 合并
  - WXML 模板：`templateReplacer` 支持复用模块级 tokenizer 实例；`createTemplateHandler` 预构建 attribute matcher 并传递给 `customTemplateHandler`
  - PostCSS fallback 选择器解析：为 `transform` 函数添加 selector 级别缓存，避免重复解析相同选择器
  - `splitCode`：为默认和 allowDoubleQuotes 两种模式分别添加结果缓存，预编译分割正则
- 📦 **Dependencies** [`c8860fa`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c8860fa202e202833f2c503fd7ea53af824a76fe)
  → `@weapp-tailwindcss/postcss@2.1.6-alpha.0`, `@weapp-tailwindcss/shared@1.1.3-alpha.0`

## 4.10.3

### Patch Changes

- 🐛 **修复 Vite 开发增量构建中，clean JS 产物未回填缓存导致 `<script>` 任意值类名（如 `bg-[#000]`、`px-[432.43px]`）偶发失效的问题。** [`cdd45d0`](https://github.com/sonofmagic/weapp-tailwindcss/commit/cdd45d06b1e47d89f46a635d8d5c20c5787caccd) by @sonofmagic
  - 同时补充 issue #33 回归测试，复用 watch-hmr 体系覆盖 script/template 任意值在 add/modify/delete 三阶段的增量行为，并增加调试日志用于定位 dirty 文件、token 命中与缓存跳过决策。
  - 增强 watch-hmr 回归鲁棒性（CRLF/LF 写回一致性、短暂 ENOENT 重试、Windows 进程树退出）并在 e2e-watch 工作流加入 issue33 专项三平台矩阵与失败 artifacts（json/snapshots/failures）。

## 4.10.2

### Patch Changes

- 🐛 **修复 TailwindCSS v4 场景下动态 class 任意值（如 `gap-[20px]`）在 JS 产物中未稳定转译的问题：** [`7be1209`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7be12097d012f2eef09a76c1740ff9dc44eab8a7) by @sonofmagic
  - 增加对 `classNameSet` 转义等价类名的命中能力；
  - 在严格 class 语义上下文中提供受控的 arbitrary value fallback（仅在 v4 + runtimeSet 异常时自动启用）；
  - 统一在不同 bundler 与 cwd 组合下透传 Tailwind 主版本与运行时集合，提升构建稳定性。

## 4.10.1

### Patch Changes

- 🐛 **修复 JS 转译误伤问题，并将 JS 候选匹配策略收敛为 classNameSet 精确命中。** [`13fcf19`](https://github.com/sonofmagic/weapp-tailwindcss/commit/13fcf19ef2dd30516825651c61dcb9f65f69e751) by @sonofmagic
  - JS 仅转译来自 `tailwindcss-patch` 的 `classNameSet` 命中项，不再对普通字符串做启发式 fallback 转译
  - `App.vue:4`、`index.ts:120:3`、日志/堆栈/业务文本等非 class 字符串不再被误转义
  - 补充回归测试，覆盖 `staleClassNameFallback=true/false` 下仍保持 classNameSet-only 行为

## 4.10.0

### Minor Changes

- ✨ **增强 `weapp-tailwindcss` 在复杂 Tailwind 语法与热更新回归场景下的稳定性与可观测性：** [`b2aa840`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b2aa84042aa34fcd01e8667619d5d378b008c046) by @sonofmagic
  - 扩展 watch HMR 回归到双轮次对比（`baseline-arbitrary` 与 `complex-corpus`），并在报告中输出分轮次指标与差异对比，便于长期性能追踪。
  - 强化跨框架 watch 路径下的复杂类名热更新验证，覆盖更多任意值、复杂变体与组合语法。
  - 补充复杂语法语料与端到端样式产物回归测试，提升对 Tailwind 复杂写法转译行为的覆盖度与回归保障。

### Patch Changes

- 🐛 **收敛 JS 转译策略为 classNameSet 精确命中，修复 source-location 文本误转义：**
  - JS 仅转译来自 `tailwindcss-patch` 的 `classNameSet` 命中项，不再对普通字符串做启发式 fallback 转译。
  - 修复 `at App.vue:4`、`index.ts:120:3`、`Foo.jsx:8` 等 source-location token 被误判为 class 并转义的问题。
  - 补充 JS handler 与 Vite bundle 回归测试，覆盖 `staleClassNameFallback=true/false` 下的 classNameSet-only 行为与正向类名转译能力。

- 🐛 **修复 Vite + uni-app 场景下的 HMR 类名漏转译问题，并增强 JS 转译鲁棒性：** [`be6f65d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/be6f65d4232621fedef617a00a2072bc02b89ec6) by @sonofmagic
  - 修复 `generateBundle` 阶段 runtime class set 失效策略：当 `html/js` 源码发生变化时强制刷新 runtimeSet，不再只依赖 `tailwind.config` 签名，避免新增 arbitrary value 在热更新后漏转义。
  - 为 Vite JS 处理链路补充 `staleClassNameFallback` 策略（`serve` 与 `build --watch` 默认开启），并新增 `UserDefinedOptions.staleClassNameFallback` 供用户显式配置。
  - 补充对应回归测试：覆盖“静态 class -> `:class` 常量字符串（包含新增 arbitrary value）”的热更新场景，并验证 `jsPreserveClass` 可避免业务字符串误转义。

- 🐛 **适配 `tailwindcss-patch@8.7.x` 的选项结构升级，并补齐向后兼容与稳定性修复：** [`fe5ac5e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/fe5ac5e400609878d2ce2e91aede134cde0e1823) by @sonofmagic
  - 将 patch 选项统一迁移到新版字段（如 `tailwindcss` / `apply` / `extract` / `projectRoot`），同时兼容旧字段输入，降低升级成本。
  - 修复 v4 patcher 选项合并与基路径覆盖逻辑，确保 `cssEntries` 与 `tailwindcss` 相关配置在新旧格式下行为一致。
  - 更新 CLI 默认 patch 选项映射，`extendLengthUnits` 等能力迁移到 `apply` 分组，避免新版 `tailwindcss-patch` 下配置失效。
  - 补齐相关类型定义与测试，避免在 DTS 构建和 patch 选项推导中出现类型漂移。

- 🐛 **Fix css-macro conditional comment generation for logical platform expressions.** [`84e3395`](https://github.com/sonofmagic/weapp-tailwindcss/commit/84e33954cbca5ce565301471469f75cf44fdb1dc) by @sonofmagic
  - Normalize `ifdef/ifndef` conditions like `H5||APP` and `H5_||_APP` to the uni-app style `H5 || APP`.
  - Keep escaped expressions (such as `H5\\_||\\_MP-WEIXIN`) as literals.
  - Ensure emitted conditional comments are always valid paired blocks (`#ifdef/#endif` and `#ifndef/#endif`) without nested `#ifndef` expansion.
  - Restore stable CSS output generation in uni-app scenarios using `ifdef-[...]` class macros.

- 🐛 **提升热更新链路的稳定性与性能，并补齐真实 watch 回归保障：** [`7824e01`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7824e010f8f7e4a7a9ae6eedd707ff4a329d991b) by @sonofmagic
  - 优化运行时类名转译策略，修复 stale runtimeSet 场景下新增任意值类与小数类（如 `text-[23.43px]`、`space-y-2.5`）在 JS/WXML/Vue 中的漏转译问题。
  - 提炼并复用类名候选判定逻辑，减少重复实现，降低后续维护成本。
  - 增强 demo 级 watch 回归脚本（taro + uni-app），覆盖新增类热更新、输出变更检测与恢复校验。
  - 为 watch 回归增加本地构建预热与日志降噪能力（可选 `--quiet-sass`），减少无效噪音并提升排查效率。
  - 优化相关缓存与增量处理路径，缩短常见热更新阶段插件处理耗时。

- 🐛 **修复 Vite + uni-app 在 HMR 增量阶段的样式回退问题，并增强 watch 热更新回归覆盖：** [`5dbec90`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5dbec90798221d9e941ecc44e2e7f00ecc2edc18) by @sonofmagic
  - 修复 `generateBundle` 的 CSS dirty 跳过逻辑：即使本轮 CSS 原文 hash 未变化，也会通过缓存回填已转译结果，避免 `app.wxss` 在 dev/watch 下回退到未转译内容并与同轮 JS/WXML class 改写失配。
  - 新增对应单元测试，覆盖“JS 变化但 CSS 原文不变”场景，确保缓存命中时仍应用 CSS 转译结果。
  - 增强 `e2e:watch` 的 same-class-literal HMR 校验：新增全局样式稳定性指标与断言，确保“源码变化但 class literal 不变”时仍能覆盖并检测样式稳定性。
  - 对 `mpx` 用例保留兼容策略：该场景仅放宽同字面量变更时的全局样式稳定断言，不影响其余项目的严格校验。

- 🐛 **扩展热更新 e2e 回归覆盖面并提升跨框架 watch 稳定性：** [`7261ffa`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7261ffa6b6d8a7c262020123cceef39c827bf9e4) by @sonofmagic
  - watch 回归用例从 `taro/uni-app` 扩展到 `taro/uni-app/mpx/rax/mina/weapp-vite`，默认运行全量 `all`。
  - 新增 `e2e:watch:mpx`、`e2e:watch:rax`、`e2e:watch:mina`、`e2e:watch:weapp-vite` 便捷命令。
  - 加强 watch 预热与编译成功判定，降低误判和超时波动。
  - 优化子进程退出与清理策略，避免 watch 任务残留影响后续回归。
  - 强化复杂 Tailwind 类组合（含任意值、小数、calc、伪元素等）在热更新路径下的转译验证。

- 🐛 **修复 Tailwind v4 `space-x-*` 在小程序端生成不兼容方向伪类导致的构建产物报错问题：** [`515aa47`](https://github.com/sonofmagic/weapp-tailwindcss/commit/515aa473159218d67ba8bc461ae7c95d573d3f80) by @sonofmagic
  - 在选择器转换阶段清理 `:-webkit-any(...)`、`:-moz-any(...)`、`:lang(...)` 相关分支，避免输出微信开发者工具不支持的选择器。
  - 对 `:not(...)` 包裹的方向条件保留主体选择器并移除条件；对纯方向分支选择器直接移除，避免产生无效 CSS。
  - 补充 `selectorParser` 回归测试，覆盖上述 RTL/language 伪类清理逻辑。

- 🐛 **扩展 watch 热更新回归矩阵与分项目报告能力，补齐重点 demo/apps 的可观测性：** [`a76b055`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a76b0557ae378cf149aa0df7ec213c9fd3eaeacc) by @sonofmagic
  - 将热更新用例按项目维度拆分执行，覆盖 apps 与 demos 的独立链路，报告按项目分别输出。
  - 新增并强制校验重点项目热更新报告覆盖：`demo/uni-app-vue3-vite`、`demo/uni-app-tailwindcss-v4`、`demo/taro-vite-tailwindcss-v4`、`demo/taro-app-vite`、`demo/taro-webpack-tailwindcss-v4`、`demo/taro-vue3-app`。
  - 在模板文件（wxml/vue/tsx 等）与 JS/TS 变更热更新验证之外，增加全局样式 `app.wxss` 转译类同步检查，确保新增类在全局产物可追踪。
  - 增强回归脚本稳定性与报告字段，补充按项目的热更新耗时与样式转译校验信息，便于横向对比与回归排查。

- 🐛 **优化 Vite 适配器的启动与增量构建性能（保持功能一致性）：** [`9fc32ff`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9fc32ff8d12430e7d8e207127e1130a16e13731d) by @sonofmagic
  - 运行时类集刷新改为按签名与配置变化触发，不再在每次 `generateBundle` 强制刷新。
  - `generateBundle` 支持基于 dirty entries 与 linked entries 的增量处理，减少全量遍历开销。
  - JS 转换新增轻量 precheck，无相关特征时跳过 Babel 解析与遍历。
  - 新增 Vite 性能基准与汇总脚本，支持 optimized/legacy 对照复现。

- 🐛 **新增一条专门面向热更新的 e2e 回归链路（构建产物快照链路之外），用于真实验证 taro/uni-app 在 watch 模式下的 HMR 生效性与耗时：** [`d350d81`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d350d817b006f7727ad8a3ed3950ca9c700a78b6) by @sonofmagic
  - 新增 `e2e:watch` 系列命令与独立 vitest 配置，支持按 `taro` / `uni` / `both` 运行。
  - 强化 `test:watch-hmr` 回归脚本：输出结构化报告（含 hot update / rollback 延迟）、支持性能预算断言与日志降噪。
  - 在回归中注入更复杂的 Tailwind 类名组合（含任意值、小数、`calc()`、`grid-cols-[...]`、`/` 透明度、伪元素变体等），确保新增类在 JS/WXML 场景的转译结果可验证。
  - 增加“类名避撞”策略，避免测试注入类与 demo 现有类冲突导致误判，提升回归稳定性与可重复性。
  - 默认 watch e2e 启用 `--skip-build` 聚焦热更新链路，另提供完整预构建模式命令用于全链路对照。

- 🐛 **修复 uni-app + Vite/HBuilderX 增量热更新中 template 转译退化导致 `wxml` 回退为未转义类名的问题：** [`76df4cf`](https://github.com/sonofmagic/weapp-tailwindcss/commit/76df4cfbc0ba1e8e2bcea7afd33a40060dae3580) by @sonofmagic
  - 调整 `generateBundle` 的 html 增量处理策略：非首轮也会将当前 bundle 内 html 资产纳入处理流程，确保每轮都能命中缓存并回填上次转译结果（`processCachedTask`）。
  - 避免仅 script 变更时出现 `wxml` 未转义而 `js/wxss` 已转义的链路不一致问题。
  - 补充 Vite bundle 回归测试，覆盖 script-only 连续变更与 `bg-[#0000]` 等 arbitrary value 场景，确保 `wxml/js/wxss` 增量输出始终一致。

- 🐛 **修复 webpack（Taro/uni）增量热更新下的类名转译一致性问题，并确保 JS 仅按最新 class set 精确匹配：** [`bac7fe4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bac7fe4831bb13ad4c663c0bf51ebf9832737850) by @sonofmagic
  - webpack 资产处理阶段每轮强制收集 runtime class set，避免 script-only 热更新时复用过期集合导致 `bg-[#xxxx]` 一类类名漏转译或截断。
  - webpack 模式下 `staleClassNameFallback` 回到默认关闭，保持 JS 转译“只命中 class set”的精确策略。
  - 增强 watch-hmr 回归：新增 `bg-[#hex]` 防截断断言（禁止出现 `bg- xxxx`），并纳入 `apps/taro-webpack-tailwindcss-v4` 的脚本热更新用例，确保 e2e:watch 覆盖该场景。
- 📦 **Dependencies** [`7824e01`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7824e010f8f7e4a7a9ae6eedd707ff4a329d991b)
  → `@weapp-tailwindcss/postcss@2.1.5`

## 4.10.0-beta.8

### Patch Changes

- 🐛 **修复 webpack（Taro/uni）增量热更新下的类名转译一致性问题，并确保 JS 仅按最新 class set 精确匹配：** [`bac7fe4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bac7fe4831bb13ad4c663c0bf51ebf9832737850) by @sonofmagic
  - webpack 资产处理阶段每轮强制收集 runtime class set，避免 script-only 热更新时复用过期集合导致 `bg-[#xxxx]` 一类类名漏转译或截断。
  - webpack 模式下 `staleClassNameFallback` 回到默认关闭，保持 JS 转译“只命中 class set”的精确策略。
  - 增强 watch-hmr 回归：新增 `bg-[#hex]` 防截断断言（禁止出现 `bg- xxxx`），并纳入 `apps/taro-webpack-tailwindcss-v4` 的脚本热更新用例，确保 e2e:watch 覆盖该场景。

## 4.10.0-beta.7

### Patch Changes

- 🐛 **修复 uni-app + Vite/HBuilderX 增量热更新中 template 转译退化导致 `wxml` 回退为未转义类名的问题：** [`76df4cf`](https://github.com/sonofmagic/weapp-tailwindcss/commit/76df4cfbc0ba1e8e2bcea7afd33a40060dae3580) by @sonofmagic
  - 调整 `generateBundle` 的 html 增量处理策略：非首轮也会将当前 bundle 内 html 资产纳入处理流程，确保每轮都能命中缓存并回填上次转译结果（`processCachedTask`）。
  - 避免仅 script 变更时出现 `wxml` 未转义而 `js/wxss` 已转义的链路不一致问题。
  - 补充 Vite bundle 回归测试，覆盖 script-only 连续变更与 `bg-[#0000]` 等 arbitrary value 场景，确保 `wxml/js/wxss` 增量输出始终一致。

## 4.10.0-beta.6

### Patch Changes

- 🐛 **修复 Vite + uni-app 在 HMR 增量阶段的样式回退问题，并增强 watch 热更新回归覆盖：** [`5dbec90`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5dbec90798221d9e941ecc44e2e7f00ecc2edc18) by @sonofmagic
  - 修复 `generateBundle` 的 CSS dirty 跳过逻辑：即使本轮 CSS 原文 hash 未变化，也会通过缓存回填已转译结果，避免 `app.wxss` 在 dev/watch 下回退到未转译内容并与同轮 JS/WXML class 改写失配。
  - 新增对应单元测试，覆盖“JS 变化但 CSS 原文不变”场景，确保缓存命中时仍应用 CSS 转译结果。
  - 增强 `e2e:watch` 的 same-class-literal HMR 校验：新增全局样式稳定性指标与断言，确保“源码变化但 class literal 不变”时仍能覆盖并检测样式稳定性。
  - 对 `mpx` 用例保留兼容策略：该场景仅放宽同字面量变更时的全局样式稳定断言，不影响其余项目的严格校验。

## 4.10.0-beta.5

### Patch Changes

- 🐛 **Fix css-macro conditional comment generation for logical platform expressions.** [`84e3395`](https://github.com/sonofmagic/weapp-tailwindcss/commit/84e33954cbca5ce565301471469f75cf44fdb1dc) by @sonofmagic
  - Normalize `ifdef/ifndef` conditions like `H5||APP` and `H5_||_APP` to the uni-app style `H5 || APP`.
  - Keep escaped expressions (such as `H5\\_||\\_MP-WEIXIN`) as literals.
  - Ensure emitted conditional comments are always valid paired blocks (`#ifdef/#endif` and `#ifndef/#endif`) without nested `#ifndef` expansion.
  - Restore stable CSS output generation in uni-app scenarios using `ifdef-[...]` class macros.

## 4.10.0-beta.4

### Patch Changes

- 🐛 **修复 Vite + uni-app 场景下的 HMR 类名漏转译问题，并增强 JS 转译鲁棒性：** [`be6f65d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/be6f65d4232621fedef617a00a2072bc02b89ec6) by @sonofmagic
  - 修复 `generateBundle` 阶段 runtime class set 失效策略：当 `html/js` 源码发生变化时强制刷新 runtimeSet，不再只依赖 `tailwind.config` 签名，避免新增 arbitrary value 在热更新后漏转义。
  - 为 Vite JS 处理链路补充 `staleClassNameFallback` 策略（`serve` 与 `build --watch` 默认开启），并新增 `UserDefinedOptions.staleClassNameFallback` 供用户显式配置。
  - 补充对应回归测试：覆盖“静态 class -> `:class` 常量字符串（包含新增 arbitrary value）”的热更新场景，并验证 `jsPreserveClass` 可避免业务字符串误转义。

## 4.10.0-beta.3

### Patch Changes

- 🐛 **适配 `tailwindcss-patch@8.7.x` 的选项结构升级，并补齐向后兼容与稳定性修复：** [`fe5ac5e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/fe5ac5e400609878d2ce2e91aede134cde0e1823) by @sonofmagic
  - 将 patch 选项统一迁移到新版字段（如 `tailwindcss` / `apply` / `extract` / `projectRoot`），同时兼容旧字段输入，降低升级成本。
  - 修复 v4 patcher 选项合并与基路径覆盖逻辑，确保 `cssEntries` 与 `tailwindcss` 相关配置在新旧格式下行为一致。
  - 更新 CLI 默认 patch 选项映射，`extendLengthUnits` 等能力迁移到 `apply` 分组，避免新版 `tailwindcss-patch` 下配置失效。
  - 补齐相关类型定义与测试，避免在 DTS 构建和 patch 选项推导中出现类型漂移。

## 4.10.0-beta.2

### Patch Changes

- 🐛 **扩展 watch 热更新回归矩阵与分项目报告能力，补齐重点 demo/apps 的可观测性：** [`a76b055`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a76b0557ae378cf149aa0df7ec213c9fd3eaeacc) by @sonofmagic
  - 将热更新用例按项目维度拆分执行，覆盖 apps 与 demos 的独立链路，报告按项目分别输出。
  - 新增并强制校验重点项目热更新报告覆盖：`demo/uni-app-vue3-vite`、`demo/uni-app-tailwindcss-v4`、`demo/taro-vite-tailwindcss-v4`、`demo/taro-app-vite`、`demo/taro-webpack-tailwindcss-v4`、`demo/taro-vue3-app`。
  - 在模板文件（wxml/vue/tsx 等）与 JS/TS 变更热更新验证之外，增加全局样式 `app.wxss` 转译类同步检查，确保新增类在全局产物可追踪。
  - 增强回归脚本稳定性与报告字段，补充按项目的热更新耗时与样式转译校验信息，便于横向对比与回归排查。

## 4.10.0-beta.1

### Minor Changes

- ✨ **增强 `weapp-tailwindcss` 在复杂 Tailwind 语法与热更新回归场景下的稳定性与可观测性：** [`b2aa840`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b2aa84042aa34fcd01e8667619d5d378b008c046) by @sonofmagic
  - 扩展 watch HMR 回归到双轮次对比（`baseline-arbitrary` 与 `complex-corpus`），并在报告中输出分轮次指标与差异对比，便于长期性能追踪。
  - 强化跨框架 watch 路径下的复杂类名热更新验证，覆盖更多任意值、复杂变体与组合语法。
  - 补充复杂语法语料与端到端样式产物回归测试，提升对 Tailwind 复杂写法转译行为的覆盖度与回归保障。

### Patch Changes

- 🐛 **提升热更新链路的稳定性与性能，并补齐真实 watch 回归保障：** [`7824e01`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7824e010f8f7e4a7a9ae6eedd707ff4a329d991b) by @sonofmagic
  - 优化运行时类名转译策略，修复 stale runtimeSet 场景下新增任意值类与小数类（如 `text-[23.43px]`、`space-y-2.5`）在 JS/WXML/Vue 中的漏转译问题。
  - 提炼并复用类名候选判定逻辑，减少重复实现，降低后续维护成本。
  - 增强 demo 级 watch 回归脚本（taro + uni-app），覆盖新增类热更新、输出变更检测与恢复校验。
  - 为 watch 回归增加本地构建预热与日志降噪能力（可选 `--quiet-sass`），减少无效噪音并提升排查效率。
  - 优化相关缓存与增量处理路径，缩短常见热更新阶段插件处理耗时。

- 🐛 **扩展热更新 e2e 回归覆盖面并提升跨框架 watch 稳定性：** [`7261ffa`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7261ffa6b6d8a7c262020123cceef39c827bf9e4) by @sonofmagic
  - watch 回归用例从 `taro/uni-app` 扩展到 `taro/uni-app/mpx/rax/mina/weapp-vite`，默认运行全量 `all`。
  - 新增 `e2e:watch:mpx`、`e2e:watch:rax`、`e2e:watch:mina`、`e2e:watch:weapp-vite` 便捷命令。
  - 加强 watch 预热与编译成功判定，降低误判和超时波动。
  - 优化子进程退出与清理策略，避免 watch 任务残留影响后续回归。
  - 强化复杂 Tailwind 类组合（含任意值、小数、calc、伪元素等）在热更新路径下的转译验证。

- 🐛 **修复 Tailwind v4 `space-x-*` 在小程序端生成不兼容方向伪类导致的构建产物报错问题：** [`515aa47`](https://github.com/sonofmagic/weapp-tailwindcss/commit/515aa473159218d67ba8bc461ae7c95d573d3f80) by @sonofmagic
  - 在选择器转换阶段清理 `:-webkit-any(...)`、`:-moz-any(...)`、`:lang(...)` 相关分支，避免输出微信开发者工具不支持的选择器。
  - 对 `:not(...)` 包裹的方向条件保留主体选择器并移除条件；对纯方向分支选择器直接移除，避免产生无效 CSS。
  - 补充 `selectorParser` 回归测试，覆盖上述 RTL/language 伪类清理逻辑。

- 🐛 **新增一条专门面向热更新的 e2e 回归链路（构建产物快照链路之外），用于真实验证 taro/uni-app 在 watch 模式下的 HMR 生效性与耗时：** [`d350d81`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d350d817b006f7727ad8a3ed3950ca9c700a78b6) by @sonofmagic
  - 新增 `e2e:watch` 系列命令与独立 vitest 配置，支持按 `taro` / `uni` / `both` 运行。
  - 强化 `test:watch-hmr` 回归脚本：输出结构化报告（含 hot update / rollback 延迟）、支持性能预算断言与日志降噪。
  - 在回归中注入更复杂的 Tailwind 类名组合（含任意值、小数、`calc()`、`grid-cols-[...]`、`/` 透明度、伪元素变体等），确保新增类在 JS/WXML 场景的转译结果可验证。
  - 增加“类名避撞”策略，避免测试注入类与 demo 现有类冲突导致误判，提升回归稳定性与可重复性。
  - 默认 watch e2e 启用 `--skip-build` 聚焦热更新链路，另提供完整预构建模式命令用于全链路对照。
- 📦 **Dependencies** [`7824e01`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7824e010f8f7e4a7a9ae6eedd707ff4a329d991b)
  → `@weapp-tailwindcss/postcss@2.1.5-beta.0`

## 4.9.9-beta.0

### Patch Changes

- 🐛 **优化 Vite 适配器的启动与增量构建性能（保持功能一致性）：** [`9fc32ff`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9fc32ff8d12430e7d8e207127e1130a16e13731d) by @sonofmagic
  - 运行时类集刷新改为按签名与配置变化触发，不再在每次 `generateBundle` 强制刷新。
  - `generateBundle` 支持基于 dirty entries 与 linked entries 的增量处理，减少全量遍历开销。
  - JS 转换新增轻量 precheck，无相关特征时跳过 Babel 解析与遍历。
  - 新增 Vite 性能基准与汇总脚本，支持 optimized/legacy 对照复现。

## 4.9.8

### Patch Changes

- 🐛 **新增 unitsToPx 配置，支持将多种长度单位转换为 px，并在 uni-app-x 预设中透出该选项。** [`d20c0b7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d20c0b7db503c0b8e022101908ff520dc00ed2df) by @sonofmagic

- 🐛 **chore: bump babel from 7.28.6 to 7.29.0** [`3d21a8c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3d21a8c849cabd2683a0e160be197c9970866b4e) by @sonofmagic
- 📦 **Dependencies** [`d20c0b7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d20c0b7db503c0b8e022101908ff520dc00ed2df)
  → `@weapp-tailwindcss/postcss@2.1.4`

## 4.9.8-alpha.0

### Patch Changes

- 🐛 **新增 unitsToPx 配置，支持将多种长度单位转换为 px，并在 uni-app-x 预设中透出该选项。** [`d20c0b7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d20c0b7db503c0b8e022101908ff520dc00ed2df) by @sonofmagic

- 🐛 **chore: bump babel from 7.28.6 to 7.29.0** [`3d21a8c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3d21a8c849cabd2683a0e160be197c9970866b4e) by @sonofmagic
- 📦 **Dependencies** [`d20c0b7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d20c0b7db503c0b8e022101908ff520dc00ed2df)
  → `@weapp-tailwindcss/postcss@2.1.4-alpha.0`

## 4.9.7

### Patch Changes

- 🐛 **添加 `wx-root-portal-content` 作为默认的 css var 根节点类名** [`a40a766`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a40a76679536a3c08177143081963e3e80d84eed) by @sonofmagic

## 4.9.6

### Patch Changes

- 🐛 **chore: 升级到 "@weapp-core/escape": "~7.0.0"** [`4bbda03`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4bbda03bc7f924bc7ef75291d27316309c827c58) by @sonofmagic
- 📦 **Dependencies** [`4bbda03`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4bbda03bc7f924bc7ef75291d27316309c827c58)
  → `@weapp-tailwindcss/postcss@2.1.3`

## 4.9.5

### Patch Changes

- 🐛 **修复导出的 UserDefinedOptions 类型合并，确保 matcher 回调参数能正确推断并提供智能提示。** [`2b7c018`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2b7c018c5131feb108bb227f71854ec62e4ec4d4) by @sonofmagic

- 🐛 **简化 UserDefinedOptions 类型结构，移除 typedoc 增强依赖并修复相关类型问题。** [`466e1a6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/466e1a6d3054938750559124e17bc11a577953a0) by @sonofmagic

## 4.9.4

### Patch Changes

- 📦 **Dependencies** [`becab46`](https://github.com/sonofmagic/weapp-tailwindcss/commit/becab46e7df4864feba2e708f67a3e3a08e341e0)
  → `@weapp-tailwindcss/postcss@2.1.2`

## 4.9.3

### Patch Changes

- 📦 **Dependencies** [`366027a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/366027a3a9831cbdcb609297c75596ade0f42ad5)
  → `@weapp-tailwindcss/postcss@2.1.1`, `@weapp-tailwindcss/shared@1.1.2`

## 4.9.2

### Patch Changes

- [`fb723b0`](https://github.com/sonofmagic/weapp-tailwindcss/commit/fb723b038bd94866118a56b74cd8b35a0e0c85cd) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复配置 cssEntries 时默认强制覆盖 tailwind v4 base 导致 @config 解析到错误目录的问题，保持用户自定义 base 并让入口目录成为默认解析基准，避免运行时类名收集为空。

- [`94b2c71`](https://github.com/sonofmagic/weapp-tailwindcss/commit/94b2c719ce916a1001070bda1bce30b04454080d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 tailwindcss v4 在自动收集 cssEntries 时丢失基准目录的问题：从上下文创建 patcher 时附带工作区 base，保留用户显式设置的 v4 base，并在多 patcher 聚合时沿用首个 patcher 的配置。

- [`acdfd59`](https://github.com/sonofmagic/weapp-tailwindcss/commit/acdfd5928c02343c78a8f4cdc3889f5b067533ea) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 v4 patcher 在提供 cssEntries 時錯誤覆寫 base 導致 @config 解析失效，補充回歸確保 runtime class set 正確收集並轉義，並依賴升級至修復版 tailwindcss-patch@8.6.1。

## 4.9.2-alpha.2

### Patch Changes

- [`acdfd59`](https://github.com/sonofmagic/weapp-tailwindcss/commit/acdfd5928c02343c78a8f4cdc3889f5b067533ea) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 v4 patcher 在提供 cssEntries 時錯誤覆寫 base 導致 @config 解析失效，補充回歸確保 runtime class set 正確收集並轉義，並依賴升級至修復版 tailwindcss-patch@8.6.1。

## 4.9.2-alpha.1

### Patch Changes

- [`94b2c71`](https://github.com/sonofmagic/weapp-tailwindcss/commit/94b2c719ce916a1001070bda1bce30b04454080d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 tailwindcss v4 在自动收集 cssEntries 时丢失基准目录的问题：从上下文创建 patcher 时附带工作区 base，保留用户显式设置的 v4 base，并在多 patcher 聚合时沿用首个 patcher 的配置。

## 4.9.2-alpha.0

### Patch Changes

- [`fb723b0`](https://github.com/sonofmagic/weapp-tailwindcss/commit/fb723b038bd94866118a56b74cd8b35a0e0c85cd) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复配置 cssEntries 时默认强制覆盖 tailwind v4 base 导致 @config 解析到错误目录的问题，保持用户自定义 base 并让入口目录成为默认解析基准，避免运行时类名收集为空。

## 4.9.1

### Patch Changes

- [`4961548`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4961548799c55bc3e07866e20354f69292d53345) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 仅在 iOS 编译场景跳过 uni-app-x 预处理样式的 pre 钩子，补充 UNI_UTS_PLATFORM 平台解析工具与相关测试。

## 4.9.0

### Minor Changes

- [`01c4f02`](https://github.com/sonofmagic/weapp-tailwindcss/commit/01c4f025272a6b6fbe4021a713dc838bb92fc625) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 默认 tailwindcss-patcher 的缓存策略从 文件缓存，变为内存缓存，可通过配置恢复

### Patch Changes

- [`914b61c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/914b61ca8995becda219d67ea98aa0ee6a2359a6) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 升级 tailwindcss-patch 优化 windows 系统下发生的 ERROR Unable to persist Tailwind class cache EPERM: operation not permitted, lstat '\\?\E:\workspace\uni-app-x-hbuilderx\node_modules\.cache\tailwindcss-patch\class-cache.json' 错误报告

## 4.9.0-alpha.0

### Minor Changes

- [`01c4f02`](https://github.com/sonofmagic/weapp-tailwindcss/commit/01c4f025272a6b6fbe4021a713dc838bb92fc625) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 默认 tailwindcss-patcher 的缓存策略从 文件缓存，变为内存缓存，可通过配置恢复

### Patch Changes

- [`914b61c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/914b61ca8995becda219d67ea98aa0ee6a2359a6) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 升级 tailwindcss-patch 优化 windows 系统下发生的 ERROR Unable to persist Tailwind class cache EPERM: operation not permitted, lstat '\\?\E:\workspace\uni-app-x-hbuilderx\node_modules\.cache\tailwindcss-patch\class-cache.json' 错误报告

## 4.8.15

### Patch Changes

- [`bb845b5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bb845b5ce3d01d19d04336c8fbf6fca47f6a3347) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 uni-app-x Vite 插件在 pre 钩子上解析 SCSS 导致 iOS 打包报错的问题，并补充 .uvue lang.scss 回归用例。

## 4.8.14

### Patch Changes

- [`cd3975d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/cd3975dfeefa5a1ba298b6724d2af681a26cd260) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 开启 css import 重写时，将 `@import "tailwindcss"` 映射到 `@import "weapp-tailwindcss/index.css"`。

- [`ade6fe0`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ade6fe02b994f08f8d4c422485a982b4aaad34b8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 为 `disabled` 增加细粒度配置，支持仅关闭主流程或仅关闭 `@import "tailwindcss"` 重写，方便多端场景按需禁用。

## 4.8.13

### Patch Changes

- [`644bc7f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/644bc7f23c7f46c9bfe28d19757bc8d530e67669) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 拆分 presets 到独立文件并补充 uni-app/Taro/HBuilderX 预设，uni-app 在 H5/App 目标默认禁用转换，同时完善相关测试。

- Updated dependencies [[`19e9417`](https://github.com/sonofmagic/weapp-tailwindcss/commit/19e94172cd2b79b28b863a15e477136f269bbc3b)]:
  - @weapp-tailwindcss/postcss@2.1.0

## 4.8.12

### Patch Changes

- [`077cca6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/077cca6ac83008fa619700e870532bc7f28038f0) Thanks [@sonofmagic](https://github.com/sonofmagic)! - weapp-tw CLI 对齐 tailwindcss-patch，内置 `status` 子命令并同步使用指南，方便在子包或 CI 查看补丁应用情况。

- Updated dependencies [[`07a0d5b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/07a0d5b8b27ebd52b4f9363f004f80d17c3d1f2e), [`8bd4842`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8bd4842871a96dadb2b85139ffded7f61c99ca01), [`74ed4a3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/74ed4a324e528d67d5f4fc22d4cf704b0c246cb8)]:
  - @weapp-tailwindcss/postcss@2.0.8

## 4.8.11

### Patch Changes

- [`ccaa9bd`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ccaa9bde3965c2d7bc918da346bd7e2b674aed7c) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 v4 补丁目标选择，只有显式使用 tailwindcss v4 时才会额外尝试为 @tailwindcss/postcss 打补丁，避免 v3 工程被误导到 v4 包后构建失败。

- [`65d5b12`](https://github.com/sonofmagic/weapp-tailwindcss/commit/65d5b129080331c43cc46979b28e732b87483e9e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 优化 `weapp-tw patch` 默认 cwd 选择逻辑，workspace 下优先定位到实际安装 tailwindcss 的包或根目录，避免 pnpm hoist 时 postinstall 误选路径导致补丁遗漏。

- [`66a2316`](https://github.com/sonofmagic/weapp-tailwindcss/commit/66a2316116e763069fce58f3afa9eee1981f11c9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 `weapp-tw patch` 默认工作目录解析，优先使用 WEAPP_TW_PATCH_CWD/INIT_CWD，避免 postinstall 未对真实子包打补丁导致运行时才补丁的问题。

- [`e7404e2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e7404e290e9cb3432f7b76cf58d463d055ab2fbe) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 默认在 CLI 与运行时补丁中启用 extendLengthUnits（含 rpx），让 postinstall 阶段即可补齐长度单位补丁并避免二次补丁日志。

## 4.8.10

### Patch Changes

- [`3ed3aa8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3ed3aa817a68dae544baf434316399cc78c15b99) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: upgrade "@weapp-core/escape": "~6.0.1"

- Updated dependencies [[`3ed3aa8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3ed3aa817a68dae544baf434316399cc78c15b99)]:
  - @weapp-tailwindcss/postcss@2.0.7

## 4.8.9

### Patch Changes

- [`ce046d2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ce046d24bb1c843eb4682667f5b2584c3b49bdb5) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 移除 MPX 专属的 tailwindcss-patch 缓存目录配置，改回复用默认路径，保持与其它应用类型一致。

- Updated dependencies [[`ce046d2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ce046d24bb1c843eb4682667f5b2584c3b49bdb5)]:
  - @weapp-tailwindcss/postcss@2.0.6

## 4.8.8

### Patch Changes

- [`1379d4b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1379d4b997084ddd42dd9a8c381507f46d1912ef) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 拆分运行时 Loader，新增仅 TailwindCSS v4 会启用的 CSS import 重写 Loader，并将 classSet 采集逻辑放入独立 Loader，便于在正确的 loader 顺序中执行。

- [`8c89cb2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8c89cb28ac21694433e9fe31e9b5d54e650ba673) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修正 runtime loader 的插入顺序，使 `runtimeCssImportRewriteLoader` 总是在 `postcss-loader` 之前执行，而 `runtimeClassSetLoader` 在其之后执行；同时新增调试日志和文档，方便排查 loader 链。

- [`e84e6b5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e84e6b5c8f9134201cc58e2e01ea2db902a5620c) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 统一 mpx 场景判断到共享 isMpx 辅助函数，并为 mpx 相关工具补充全覆盖单元测试（别名、resolve 重写与规则注入）。

- [`3a795ae`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3a795aeda3db4df12c666ba84783240db3a46ee1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 mpx 场景下的处理：
  - webpack runtime loader 锚点改为跟随 `@mpxjs/webpack-plugin/lib/style-compiler/index` 插入顺序。
  - rewrite css import 时 `@import "tailwindcss";` 改写为 `@import "weapp-tailwindcss/index.css";`。

- [`6e29641`](https://github.com/sonofmagic/weapp-tailwindcss/commit/6e296415cb354e96dfc63846f46fcb5d52945067) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 改进 mpx 默认的 `mainCssChunkMatcher`，凡是落在 `styles/` 目录下的 CSS/WXSS 产物都会被视为主样式包。这样像 `dist/wx/styles/app364cd4a4.wxss` 这种带 hash 的入口也能自动注入 Tailwind v4 变量与预设，不必再额外配置 matcher。

- [`0935ee0`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0935ee03de5dba28da6a4e3be1737423067c0978) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 优化 webpack 注入逻辑，确保 `weapp-tw-css-import-rewrite-loader` 在 Mpx 的 `@mpxjs/webpack-plugin/lib/style-compiler` 之前运行，避免重复注入导致的执行顺序混乱；同时在 Rax 场景下自动识别 `src/global.*` 作为 `cssEntries`，即使未显式配置 `appType` 也能正确收集 Tailwind 类，修复 demo `rax-app` 中 JS 类名无法转译的问题。

- Updated dependencies [[`c39cbfb`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c39cbfb1980befdaf3df250b2966794ddec01d1e)]:
  - @weapp-tailwindcss/postcss@2.0.5

## 4.8.7

### Patch Changes

- [`22b7af3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/22b7af321acfb58fba34a3e6dd935a5b8f23bd1f) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复运行时 loader 在某些构建链路中接管图片等二进制资源时会破坏文件内容的问题，确保仅在 postcss-loader 之后注入并跳过 Buffer 处理，避免 dist/assets/logo.png 等静态资产被损坏。

## 4.8.6

### Patch Changes

- [`9b5a820`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9b5a820b6c8b865c723b663f51c9558075488a48) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 统一 Vue 3 编译器依赖到 catalog，确保 weapp-tailwindcss 的构建环境与仓库其他包保持一致。

## 4.8.5

### Patch Changes

- [`4bfc52b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4bfc52b147d39c52a42c5eaf10179f90a849ab49) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 增强 `weapp-tw patch` 在 pnpm monorepo 下的体验：按子包 hash 隔离缓存记录，检测不一致时自动重打补丁并刷新元数据；支持 `--workspace` 扫描工作区逐包补丁，默认读取 `pnpm-lock.yaml`/workspaces；新增 `--cwd` 优先级、记录中包含补丁版本与路径信息，避免跨包污染与告警。\*\*\*

- [`f5fa2ca`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f5fa2ca71127c51c6e684310346192ff4053aaf1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 在 tailwindcss@4 未配置 cssEntries 时输出显眼警告，提示使用包含 tailwindcss 引用的 CSS 绝对路径。

- [`b0300a4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b0300a4c4c150b929a2f066ed7a1bc7c7f93aee4) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复当 `cssEntries` 指向子目录文件时强制重写 Tailwind v4 `base` 的问题，优先沿用工作区/用户指定根目录并在多包场景下智能分组；补充整合测试确保通过 `getCompilerContext` 仍能识别子目录样式并正确重写 `bg-[#00aa55]` 这类动态类名。

- [`2023d33`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2023d337102a413d8388ce4378528e9df62afe77) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 Vite 重写 `@import 'tailwindcss'` 的钩子顺序，确保 uni-app v4 构建时能提前改写为 `weapp-tailwindcss`。

## 4.8.5-alpha.0

### Patch Changes

- [`4bfc52b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4bfc52b147d39c52a42c5eaf10179f90a849ab49) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 增强 `weapp-tw patch` 在 pnpm monorepo 下的体验：按子包 hash 隔离缓存记录，检测不一致时自动重打补丁并刷新元数据；支持 `--workspace` 扫描工作区逐包补丁，默认读取 `pnpm-lock.yaml`/workspaces；新增 `--cwd` 优先级、记录中包含补丁版本与路径信息，避免跨包污染与告警。\*\*\*

- [`f5fa2ca`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f5fa2ca71127c51c6e684310346192ff4053aaf1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 在 tailwindcss@4 未配置 cssEntries 时输出显眼警告，提示使用包含 tailwindcss 引用的 CSS 绝对路径。

- [`b0300a4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b0300a4c4c150b929a2f066ed7a1bc7c7f93aee4) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复当 `cssEntries` 指向子目录文件时强制重写 Tailwind v4 `base` 的问题，优先沿用工作区/用户指定根目录并在多包场景下智能分组；补充整合测试确保通过 `getCompilerContext` 仍能识别子目录样式并正确重写 `bg-[#00aa55]` 这类动态类名。

- [`2023d33`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2023d337102a413d8388ce4378528e9df62afe77) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 Vite 重写 `@import 'tailwindcss'` 的钩子顺序，确保 uni-app v4 构建时能提前改写为 `weapp-tailwindcss`。

## 4.8.4

### Patch Changes

- [`68465d3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/68465d3b954ec2e658e9b139f50867a34460e853) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 对 CLI 接入 tailwindcss-patch 8.4 的挂载模型，统一错误处理并在补丁流程中支持清理缓存、记录目标版本，顺带同步类型与 ESLint 相关依赖到最新补丁。

- [`1788e26`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1788e26153bafc865776d5a761c2e28dafff6918) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 splitCode 在压缩模板字符串中保留转义空白导致类名匹配遗漏的问题，保证 mp-alipay 等产物的类名替换正常工作。

- Updated dependencies [[`1788e26`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1788e26153bafc865776d5a761c2e28dafff6918)]:
  - @weapp-tailwindcss/shared@1.1.1
  - @weapp-tailwindcss/postcss@2.0.4

## 4.8.3

### Patch Changes

- [`45aed93`](https://github.com/sonofmagic/weapp-tailwindcss/commit/45aed9338aae0181f873e7960b522a37b835af73) Thanks [@sonofmagic](https://github.com/sonofmagic)! - - 重构 tailwindcss 上下文，提炼出 workspace 工具模块，解决 `PNPM_PACKAGE_NAME` 场景下的 workspace 目录解析问题，并补充对应单测，确保 `rewriteCssImports` 能在过滤构建时正确生效。

- [`7a455f6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7a455f61a7f0bd8a08cf51fac00083a6daa99d12) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 webpack demos 在开启 `rewriteCssImports` 时未能把 `@import "tailwindcss"` 重写为 `weapp-tailwindcss` 的问题，确保运行时 loader 会在 PostCSS 之前插入并重写 CSS 导入。

## 4.8.2

### Patch Changes

- [`af1133d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/af1133df2377e729d8ca0980e854a4c0b81d3ef8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 完善默认 basedir 推断逻辑，让 monorepo 子包无需额外配置即可正确绑定 Tailwind，并恢复运行时类名集合。

- [`0872174`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0872174f3cbba12b69ace58e2192501e26ddd388) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 记录 weapp-tw patch 目标文件迁移到 node_modules 缓存并在损坏时给出修复提示，提升多包/hoist 下的 Tailwind 对齐体验。

## 4.8.1

### Patch Changes

- [`7da97f4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7da97f47623fb79e2a8b3bd612b618a8553460ad) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 提炼 Vite/webpack 共享的 `rewriteCssImports` 能力，只在 tailwindcss v4 且未关闭时生效：Vite 在 CSS transform 阶段重写 `@import 'tailwindcss'`，Webpack 则在模块解析阶段统一指向 `weapp-tailwindcss`，避免小程序产物残留 PC 预设或类型告警。

## 4.8.0

### Minor Changes

- [`445d0d5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/445d0d5353a1b98986bdf6c9064b1edfd7fab12c) Thanks [@sonofmagic](https://github.com/sonofmagic)! - - 新增 `rewriteCssImports`（默认开启），在 webpack/vite 处理 CSS 导入时把 `@import 'tailwindcss'` 透明映射到 `weapp-tailwindcss`（JS/TS 不受影响），也允许按需关闭。
  - 提供 `vscode-entry` CLI 生成 VS Code 专用的根 CSS 文件，并在官网文档中补充完整说明。

### Patch Changes

- [`fe2c6e8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/fe2c6e85dd84bcdb0094ee56bad36c29ff84a315) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 Taro 构建重复实例化 UnifiedWebpackPluginV5 时会创建多份 Tailwind 运行时的问题：
  新增编译上下文缓存、复用 tailwindcss patcher，并保证相同配置只初始化一次以降低内存占用。

## 4.7.10-alpha.0

### Patch Changes

- [`fe2c6e8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/fe2c6e85dd84bcdb0094ee56bad36c29ff84a315) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 Taro 构建重复实例化 UnifiedWebpackPluginV5 时会创建多份 Tailwind 运行时的问题：
  新增编译上下文缓存、复用 tailwindcss patcher，并保证相同配置只初始化一次以降低内存占用。

## 4.7.9

### Patch Changes

- [`06b189e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/06b189ec59ac0b6022466ae3cefcf81b77917698) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复仅有单个 CSS entry 时 v4 base 错指项目根目录，确保按 entry 所在目录生成 patcher 以避免 @config 解析错位。

## 4.7.8

### Patch Changes

- [`09dbf75`](https://github.com/sonofmagic/weapp-tailwindcss/commit/09dbf75f5e503d1a1a53ee0f320cabb4f802bcf0) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat(cli): `weapp-tw patch` 默认不再清理 `tailwindcss-patch` 缓存目录，新增 `--clear-cache` 选项用于按需清理

  变更说明
  - 以前：执行 `weapp-tw patch` 会在补丁前主动删除 `tailwindcss-patch` 的缓存目录（通常位于 `node_modules/.cache/tailwindcss-patch`），以避免缓存导致的补丁失效或读取旧产物。
  - 现在：默认不清理缓存，更加保守、稳定，减少不必要的 IO 和潜在的 CI 侧效应；如需要强制刷新缓存，请显式传入 `--clear-cache`。

  如何迁移
  - 原有脚本不需要修改即可继续使用；仅当你希望“每次 patch 都强制清缓存”时，将脚本由：
    - `weapp-tw patch`
      替换为：
    - `weapp-tw patch --clear-cache`

  建议
  - 推荐只在遇到疑似缓存导致的“补丁未生效/版本不一致”问题时，手动或临时在 CI 中加上 `--clear-cache`，其余情况下维持默认行为即可。\*\*\*

- [`b252207`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b252207f6d7c9cabaebbaa75e1763bf1d2c65a67) Thanks [@sonofmagic](https://github.com/sonofmagic)! - perf(js): 按需作用域与缓存优化，加速 JS 处理；修复 noScope 下 eval/require 遍历报错
  - 分析遍历默认启用 `noScope`，仅在配置了 `ignoreCallExpressionIdentifiers` 时才构建作用域
  - `eval` 处理：优先使用 `path.traverse`，若因缺少 `scope/parentPath` 报错则降级到参数级手工遍历，兼容测试桩与仅 AST 形态
  - `require` 收集：在 `noScope` 下放宽 `hasBinding` 判定，确保可正确采集 `require('...')` 字面量
  - `MagicString`：当没有任何 token 时跳过实例化与写入，减少不必要开销
  - 解析缓存：支持 `parserOptions.cacheKey` 并在默认项中注入；AST LRU 提升至 1024
  - 稳健性：`NodePathWalker`、`taggedTemplateIgnore` 访问 `.scope` 统一做空值保护

  fix(types/tests): 修复类型告警与单测不匹配
  - 扩展 `ParserOptions` 以支持 `cacheKey`
  - `TailwindcssPatcherLike` 去除对私有 `cacheStore` 的类型依赖
  - 调整部分测试桩签名与 `Node` 类型引用；`webpack.v5`、`evalTransforms`、`module-replacements` 等用例通过

- Updated dependencies [[`abcb4b5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/abcb4b5db5bf42b0363b6b318570cffe2991eb72)]:
  - @weapp-tailwindcss/postcss@2.0.3

## 4.7.7

### Patch Changes

- [`a70e54b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a70e54bc540b63d204a71ef7369d32ec5f022a34) Thanks [@sonofmagic](https://github.com/sonofmagic)! - `weapp-tw patch` 在执行前会自动删除 `tailwindcss-patch` 的缓存目录（通常为 `node_modules/.cache/tailwindcss-patch`），避免残留缓存导致补丁失效或读取到旧版本产物。

- [`f9a1b1e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f9a1b1ebd719a076499b369c386ea46b4b46a86f) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 `weapp-tailwindcss/escape` 在浏览器（含 Vite）环境中因 Node 专属 shims 注入 `fileURLToPath` 导致的构建报错，确保 weappTwIgnore 等运行时 API 可直接在前端打包器里使用；同时补充导出 `unescape`，方便运行时手动还原被 escape 过的类名。

- [`a70e54b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a70e54bc540b63d204a71ef7369d32ec5f022a34) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 JS handler 在标记 weappTwIgnore 模板后仍会误转译后续相同字面量的问题，确保仅跳过被 weappTwIgnore 包裹的模板，其它位置仍按运行时类集正常转译。

- [`0ceeef7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0ceeef7b0daf8be9f91eb5818cd6c013a669cfcc) Thanks [@sonofmagic](https://github.com/sonofmagic)! - CLI 与运行时新增中文提示的 Tailwind CSS 目标日志：`weapp-tw patch` 可通过 `--record-target` 生成 `node_modules/.cache/weapp-tailwindcss/tailwindcss-target.json`（旧版本保留 `.tw-patch` 兼容），运行时若检测到补丁目标与实际加载不一致会给出中文告警，方便定位多包场景下的 patch 对齐问题。

## 4.7.6

### Patch Changes

- [`8cb5087`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8cb508736daa02f232a546a7c5909a62830c6c9a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复运行时类名集合包含内容扫描候选导致 JS 普通字符串被误转译的问题，并去掉仓库里对 tailwindcss-patch 的 catalog 固定，确保依赖行为与独立仓库一致。

## 4.7.5

### Patch Changes

- [`d69bb5a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d69bb5a6e18ddbd99ec3e62ee9a398fa8f8bf19a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: uni-app-x hmr 0

- [`897c5e6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/897c5e653ddd4b1dceae4466cebc9d954ebd9f1a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 uni-app x 在 watch/hmr 场景下强制刷新 runtime class set 时仍沿用旧 Tailwind patcher 的问题，确保热更新能立即拾取新增的任意类名。

- [`770661f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/770661f7b4fcf71331d558e6ce194ebc82f62fed) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 抽取并复用 Tailwind 运行时刷新逻辑，避免重复 patch 调用并修复热更新测试。

## 4.7.5-alpha.1

### Patch Changes

- [`897c5e6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/897c5e653ddd4b1dceae4466cebc9d954ebd9f1a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 uni-app x 在 watch/hmr 场景下强制刷新 runtime class set 时仍沿用旧 Tailwind patcher 的问题，确保热更新能立即拾取新增的任意类名。

- [`770661f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/770661f7b4fcf71331d558e6ce194ebc82f62fed) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 抽取并复用 Tailwind 运行时刷新逻辑，避免重复 patch 调用并修复热更新测试。

## 4.7.5-alpha.0

### Patch Changes

- [`d69bb5a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d69bb5a6e18ddbd99ec3e62ee9a398fa8f8bf19a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: uni-app-x hmr 0

## 4.7.4

### Patch Changes

- [`ce5b4e6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ce5b4e65d3e8aa6eae437cdf804686162a093ca3) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 uni-app x 模板在处理空 `class` 或空 `:class` 属性时触发 MagicString “Cannot overwrite a zero-length range” 异常的问题。

  同时为 uni-app x 模板管线补齐 `customAttributes` 配置支持，可在 Vue 模板中自定义需要转译的属性规则，并兼容 `disabledDefaultTemplateHandler` 行为。

- [`040e6d6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/040e6d62dc7747b4cdf081ccf7e88c2a46248e51) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 确保 uni-app x 在 Vite 流程中等待运行时类名集合准备完成，修复频繁修改 `text-[#e73909]` 等类名时偶发的转译缺失问题。

  允许在 uni-app x / HBuilderX 预设外层直接配置 `customAttributes`，无需再通过 `rawOptions` 透传。

## 4.7.3

### Patch Changes

- [`905e4d6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/905e4d6def6d87763836309b9d85ab32487c618f) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复在 uni-app x 与其它 Vue 模板中，`:class` 使用对象、数组或三元表达式时，`border-[#ff0000] bg-blue-600/50` 这类带空格/特殊字符的类名无法被 weapp-tailwindcss 转译的问题。现在会自动在需要时以表达式模式解析并转义这些原子类。

- [`803fc79`](https://github.com/sonofmagic/weapp-tailwindcss/commit/803fc7979b5e42437ed701b9885afda02836677c) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 重构 CLI 结构并改用惰性加载方式获取 `@tailwindcss-mangle/config`，修复 ESLint/TS 报错，保证在 Node.js 18 下同样可用。

- Updated dependencies [[`aaff7b8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/aaff7b819b6aed74c473d677aeefcedd0fbd81be), [`ad1ee06`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ad1ee0642dd3bd22fffb2bc448b8850341729443)]:
  - @weapp-tailwindcss/postcss@2.0.2

## 4.7.2

### Patch Changes

- [`79a7041`](https://github.com/sonofmagic/weapp-tailwindcss/commit/79a70412d6d3992b6e82ee79703f8db2e1f8d0c8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - - 抽取 `tailwind` patch 与并发任务的公共工具，统一在各打包插件中复用，降低重复代码并简化后续维护。
  - 强制刷新运行时类集，修复多次构建时的缓存偏差，并确保 Vite 并发链式处理能正确落盘联动产物。

- [`a35766d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a35766dec66b8d078c5795cfcc262e5a9b21e4f2) Thanks [@sonofmagic](https://github.com/sonofmagic)! - - 彻底移除 `jsAstTool` 相关配置、类型与测试，正式结束对 `ast-grep` 解析器的兼容。
  - 移除 `customRuleCallback` 配置与对应类型、默认值和测试，内置 PostCSS 处理逻辑不再暴露该扩展点。

- [`69a8201`](https://github.com/sonofmagic/weapp-tailwindcss/commit/69a820120fbefb14afce653a9a5b3007414453d1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 收紧 JS 标记模板的忽略范围：默认仅认得 `weappTwIgnore` 及其导入别名，普通 `String.raw` 别名会继续转译。顺便把 `eval`、模块替换等逻辑拆分到独立模块，后续维护更清晰。

- Updated dependencies [[`a35766d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a35766dec66b8d078c5795cfcc262e5a9b21e4f2)]:
  - @weapp-tailwindcss/postcss@2.0.1

## 4.7.1

### Patch Changes

- [`27d198e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/27d198eb48b0080076a480a6ab39d3cb93ae14a0) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 `tailwindcss-patch` 默认缓存目录，确保其写入包级 `node_modules/.cache/tailwindcss-patch`。

## 4.7.0

### Minor Changes

- [`c5a834c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c5a834c1d535b378371a94cb860f46d838979e32) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 重构 `@weapp-tailwindcss/merge` 的安装后脚本，自动识别 Tailwind CSS 版本、支持环境变量强制切换并提供安全的回退流程。同时将 `postinstall` 作为构建入口确保脚本始终打包输出。默认配置包移除对 `twMerge` 等辅助函数的自动忽略，交由用户按需配置。

### Patch Changes

- [`6d4c0f2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/6d4c0f2b49ea6bf5d3c2507a3d9b9700ead81a89) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 对 core 相关用例的 WXML/JS 断言进行同步，适配升级后的 `@weapp-core/escape` 转义结果。

## 4.6.3

### Patch Changes

- [`c273d73`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c273d733c3aecc98ab600867e994fb48ef3e25d9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 去除 cssClac.includeCustomProperties 里面 --spacing 默认值，为了 tailwindcss@4 space-reverse 的场景

- Updated dependencies [[`dea2ecb`](https://github.com/sonofmagic/weapp-tailwindcss/commit/dea2ecba1a7232d10b60701664424dbde8a58141)]:
  - @weapp-tailwindcss/postcss@2.0.0

## 4.6.2

### Patch Changes

- [`9e08c57`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9e08c5718d707e06dbf25657fc20f7a8213ea7c8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 升级 tailwindcss-patch 允许 cjs 加载以兼容 hbuilderx

## 4.6.1

### Patch Changes

- Updated dependencies [[`cb7d4ed`](https://github.com/sonofmagic/weapp-tailwindcss/commit/cb7d4ed16826159bfaabbad1ae7571d94e9d5257)]:
  - @weapp-tailwindcss/postcss@1.3.4

## 4.6.0

### Minor Changes

- [`10fd23d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/10fd23de83adb895fc39907c9e159b2c62df56a6) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 异步化 tailwind patcher 的类名集合获取方法，并统一通过 extract 收集最新 runtime 集合，提升多构建器在缓存命中场景下的准确性

### Patch Changes

- [`54669fe`](https://github.com/sonofmagic/weapp-tailwindcss/commit/54669fef15f964756cb428bd566926d7ef9226cd) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 适配 `tailwindcss-patch@8` 新接口，补充解析路径与包名配置，保障 PostCSS7 兼容项目与各构建器在升级后仍可正确加载补丁；默认从当前子项目的 `node_modules` 中解析 Tailwind 依赖，并同步移除示例工程里冗余的 `tailwindcssBasedir` 设置

## 4.5.2

### Patch Changes

- [`2d7cab5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2d7cab5f496325c69977a0b8aa04f33a593f31e6) Thanks [@sonofmagic](https://github.com/sonofmagic)! - - 新增 `hbuilderx` 预设，默认补齐 `tailwindcss` 与 `tailwindcss-patch` 的 `basedir/cwd` 配置，简化 HBuilderX 场景下的使用。
  - 改进基础目录解析逻辑，优先读取 `UNI_INPUT_DIR` 等环境变量并回写 `tailwindcssBasedir`，避免 HBuilderX 修改 `process.cwd()` 导致的路径错误。

## 4.5.1

### Patch Changes

- [`a162bb9`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a162bb92f5bcb88307dbe6c3df0a6828159f6056) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复仅传入 `cssEntries` 时无法自动启用 Tailwind v4 补丁的问题，恢复与显式配置 `tailwindcss.v4.cssEntries` 的等价行为。

## 4.5.0

### Minor Changes

- [`1be5402`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1be5402e56f68cf024d0a3eee1a6fdfa827767c6) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 新增跨文件 JS 模块图，沿着 import 与 re-export 链路收集并转译类名，实现一次处理整条依赖链，同时允许调用方通过新增的 handler 选项主动开启。`tailwindcss-config` 也改为复用共享工具以保持一致。当本地未安装 `tailwindcss` 时，将提示一次警告并使用空实现兜底，避免直接抛错。

### Patch Changes

- [`b63ced9`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b63ced990c5e3aa8a20e79057391a3928b7e976c) Thanks [@sonofmagic](https://github.com/sonofmagic)! - Tailwind 模式下默认为 `@weapp-tailwindcss/postcss-calc` 注入 `includeCustomProperties: ['--spacing']`，确保间距变量自动参与计算。\*\*\*

- [`2c67b1d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2c67b1ded66992a3308baf0c37fd314bd582ca00) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 Gulp 打包流程在解析本地模块时漏掉目录形式的 `index.*` 文件，确保跨文件模块图能够正确跟进依赖，并补充对应单测验证行为。

- [`9291bad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9291bad1821c72f05e64b010ea3da94293a34d42) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 暴露用于 md5 哈希与拓展名裁剪的 Node 侧工具函数，并重构依赖这些能力的包以统一复用共享实现。

- Updated dependencies [[`9291bad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9291bad1821c72f05e64b010ea3da94293a34d42)]:
  - @weapp-tailwindcss/shared@1.1.0
  - @weapp-tailwindcss/mangle@1.0.6
  - @weapp-tailwindcss/postcss@1.3.3

## 4.5.0-alpha.1

### Patch Changes

- [`b63ced9`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b63ced990c5e3aa8a20e79057391a3928b7e976c) Thanks [@sonofmagic](https://github.com/sonofmagic)! - Tailwind 模式下默认为 `@weapp-tailwindcss/postcss-calc` 注入 `includeCustomProperties: ['--spacing']`，确保间距变量自动参与计算。\*\*\*

## 4.5.0-alpha.0

### Minor Changes

- [`1be5402`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1be5402e56f68cf024d0a3eee1a6fdfa827767c6) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 新增跨文件 JS 模块图，沿着 import 与 re-export 链路收集并转译类名，实现一次处理整条依赖链，同时允许调用方通过新增的 handler 选项主动开启。`tailwindcss-config` 也改为复用共享工具以保持一致。当本地未安装 `tailwindcss` 时，将提示一次警告并使用空实现兜底，避免直接抛错。

### Patch Changes

- [`2c67b1d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2c67b1ded66992a3308baf0c37fd314bd582ca00) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 修复 Gulp 打包流程在解析本地模块时漏掉目录形式的 `index.*` 文件，确保跨文件模块图能够正确跟进依赖，并补充对应单测验证行为。

- [`9291bad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9291bad1821c72f05e64b010ea3da94293a34d42) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 暴露用于 md5 哈希与拓展名裁剪的 Node 侧工具函数，并重构依赖这些能力的包以统一复用共享实现。

- Updated dependencies [[`9291bad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9291bad1821c72f05e64b010ea3da94293a34d42)]:
  - @weapp-tailwindcss/shared@1.1.0-alpha.0
  - @weapp-tailwindcss/mangle@1.0.6-alpha.0
  - @weapp-tailwindcss/postcss@1.3.3-alpha.0

## 4.4.0

### Minor Changes

- [`ebb1059`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ebb1059ff7c13fec90003e6c018bd229ad3c1db8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 重构缓存子系统与各 bundler 辅助逻辑：统一在缓存层处理哈希与写入流程，简化 `process` API，同时补充针对新行为的测试覆盖。

- [`d56fca5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d56fca539d7c964b558f0434f069674bc832ed2a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 重构编译上下文模块，将日志、Tailwind 补丁、模板属性转换、处理器构建拆分为独立单元并补充 100% 覆盖率的单元测试，确保模块化结构更清晰且行为可验证。新增 Lightning CSS 版本的样式处理器，覆盖类名转义、选择器兼容、`:hover` 清理与子选择器替换等关键能力，并提供针对性单测。同步优化工具方法：为文件分组逻辑提供固定分组输出，替换已废弃的 `unescape` Unicode 解码实现，并补充对应的单元测试。

### Patch Changes

- [`8dca274`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8dca274fc94abb7a094a0089ddee9aa0ea9073ca) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 优化 uni-app-x 模板遍历与 class 处理逻辑，抽离更新函数并补充静态/动态 class 的单元测试保障。

- [`f288e4d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f288e4d2432014d69dda03d2806c29381b2b82a0) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 优化 `replaceHandleValue` 的热路径，跳过无效拆分、复用正则与转义缓存，并在混淆流程中避免重复处理；同时改进 Unicode 解码与名称匹配工具的性能并补充单测验证。更新 `css-macro` 插件以兼容 Tailwind CSS v3/v4，并在文档中补充使用示例与平台条件写法说明。

- [`ff74426`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ff744264e95a1d32f8bcc64de864292ddc8ff432) Thanks [@sonofmagic](https://github.com/sonofmagic)! - - refactor: js ast 的转译处理
  - perf: 缓存 JS 类名替换时的正则与转义结果，避免重复计算
  - perf: WXML Tokenizer 采用字符码判断空白并复用 token 缓存，降低解析开销
  - perf: 自定义属性匹配按标签分类预处理，避免在解析阶段重复遍历与覆写
  - perf: WXML 片段空白检测改为轻量遍历，减少 `trim` 带来的额外字符串分配
  - perf: 提炼空白检测工具，供 Tokenizer 与模板处理器共享，减少重复逻辑

- [`8b20e71`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8b20e716da890c9709122f09810c9a9b51a705ae) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: remove @weapp-tailwindcss/init

- Updated dependencies [[`b766f00`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b766f007d65d3383530452c1860907fa3dcfb00e)]:
  - @weapp-tailwindcss/postcss@1.3.2

## 4.4.0-alpha.1

### Patch Changes

- [`f288e4d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f288e4d2432014d69dda03d2806c29381b2b82a0) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 优化 `replaceHandleValue` 的热路径，跳过无效拆分、复用正则与转义缓存，并在混淆流程中避免重复处理；同时改进 Unicode 解码与名称匹配工具的性能并补充单测验证。更新 `css-macro` 插件以兼容 Tailwind CSS v3/v4，并在文档中补充使用示例与平台条件写法说明。

## 4.4.0-alpha.0

### Minor Changes

- [`ebb1059`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ebb1059ff7c13fec90003e6c018bd229ad3c1db8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 重构缓存子系统与各 bundler 辅助逻辑：统一在缓存层处理哈希与写入流程，简化 `process` API，同时补充针对新行为的测试覆盖。

- [`d56fca5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d56fca539d7c964b558f0434f069674bc832ed2a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 重构编译上下文模块，将日志、Tailwind 补丁、模板属性转换、处理器构建拆分为独立单元并补充 100% 覆盖率的单元测试，确保模块化结构更清晰且行为可验证。新增 Lightning CSS 版本的样式处理器，覆盖类名转义、选择器兼容、`:hover` 清理与子选择器替换等关键能力，并提供针对性单测。同步优化工具方法：为文件分组逻辑提供固定分组输出，替换已废弃的 `unescape` Unicode 解码实现，并补充对应的单元测试。

### Patch Changes

- [`8dca274`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8dca274fc94abb7a094a0089ddee9aa0ea9073ca) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 优化 uni-app-x 模板遍历与 class 处理逻辑，抽离更新函数并补充静态/动态 class 的单元测试保障。

- [`ff74426`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ff744264e95a1d32f8bcc64de864292ddc8ff432) Thanks [@sonofmagic](https://github.com/sonofmagic)! - - refactor: js ast 的转译处理
  - perf: 缓存 JS 类名替换时的正则与转义结果，避免重复计算
  - perf: WXML Tokenizer 采用字符码判断空白并复用 token 缓存，降低解析开销
  - perf: 自定义属性匹配按标签分类预处理，避免在解析阶段重复遍历与覆写
  - perf: WXML 片段空白检测改为轻量遍历，减少 `trim` 带来的额外字符串分配
  - perf: 提炼空白检测工具，供 Tokenizer 与模板处理器共享，减少重复逻辑

- [`8b20e71`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8b20e716da890c9709122f09810c9a9b51a705ae) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: remove @weapp-tailwindcss/init

- Updated dependencies [[`b766f00`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b766f007d65d3383530452c1860907fa3dcfb00e)]:
  - @weapp-tailwindcss/postcss@1.3.2-alpha.0

## 4.3.3

### Patch Changes

- [`a247218`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a24721839b36531bc047b86165ecec1938fe0814) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: 升级 `tailwindcss-patch` 把 `@tailwindcss/node` 作为依赖，修复 [Bug]: Cannot find module '@tailwindcss/node'

- [`125d067`](https://github.com/sonofmagic/weapp-tailwindcss/commit/125d0678f701d5279cb1c86236420be9544ac53a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 优化 webpack 插件缓存 key 的计算方式

- Updated dependencies [[`d028fb3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d028fb33297cfac6f2f9c233510f84c7850a8ae9)]:
  - @weapp-tailwindcss/postcss@1.3.1

## 4.3.2

### Patch Changes

- Updated dependencies [[`4ffb90b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/4ffb90bc754459d93929d2de3a843d46edc48f53)]:
  - @weapp-tailwindcss/postcss@1.3.0
  - @weapp-tailwindcss/init@1.0.7

## 4.3.1

### Patch Changes

- Updated dependencies [[`d9db976`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d9db9766f428147b01ba4e381549c54083f4fd5a)]:
  - @weapp-tailwindcss/postcss@1.2.2

## 4.3.0

### Minor Changes

- [`a56705e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a56705e28b9d8a9ad00d28a4b23450000d7920ac) Thanks [@sonofmagic](https://github.com/sonofmagic)! - <br/>

  # 计算模式

  feat: 在 `tailwindcss@4` 下默认启用 `计算模式`

  在 `tailwindcss@4` 下，默认启用计算模式。`tailwindcss@3` 默认不启用。

  此模式下会去预编译所有的 `css` 变量和 `calc` 计算表达式。

  这个模式可以解决很多手机机型 `calc` `rpx` 单位的兼容问题

  可通过传入 `cssCalc` 配置项 `false` 来关闭这个功能

  详见: https://tw.icebreaker.top/docs/api/interfaces/UserDefinedOptions#csscalc

  ## 新增配置项

  feat: 添加 `px2rpx` 配置项， 用于控制是否将 `px` 单位转换为 `rpx` 单位， 默认为 `false`

  传入 `true` 则会将所有的 `px` 单位, `1:1` 转换为 `rpx` 单位

  假如需要更多的转化方式，可以传入一个 `object`, 配置项见 https://www.npmjs.com/package/postcss-pxtransform

  详见: https://tw.icebreaker.top/docs/api/interfaces/UserDefinedOptions#px2rpx

  ***

  feat: 添加 `logLevel` 配置项，用于控制日志输出级别， 默认为 `info`

### Patch Changes

- Updated dependencies [[`0d76388`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0d763881fad85d20a926db89bc29ec9113cfc0b3), [`6e9cbc4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/6e9cbc46cc954a02cb45542fbebf10d313fc16ea)]:
  - @weapp-tailwindcss/postcss@1.2.1
  - @weapp-tailwindcss/logger@1.1.0
  - @weapp-tailwindcss/init@1.0.6

## 4.3.0-alpha.0

### Minor Changes

- [`a56705e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a56705e28b9d8a9ad00d28a4b23450000d7920ac) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 在 tailwindcss@4 下默认启用计算模式

### Patch Changes

- Updated dependencies [[`0d76388`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0d763881fad85d20a926db89bc29ec9113cfc0b3), [`6e9cbc4`](https://github.com/sonofmagic/weapp-tailwindcss/commit/6e9cbc46cc954a02cb45542fbebf10d313fc16ea)]:
  - @weapp-tailwindcss/postcss@1.2.1-alpha.0
  - @weapp-tailwindcss/logger@1.1.0-alpha.0
  - @weapp-tailwindcss/init@1.0.6-alpha.0

## 4.2.9

### Patch Changes

- [`59bdd20`](https://github.com/sonofmagic/weapp-tailwindcss/commit/59bdd205dcfc2d30a097c63d9451d08a3cfb1e73) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 默认开启 cssRemoveProperty, 因为 `@property` 会导致支付宝小程序直接挂掉

- Updated dependencies [[`59bdd20`](https://github.com/sonofmagic/weapp-tailwindcss/commit/59bdd205dcfc2d30a097c63d9451d08a3cfb1e73), [`ce1150c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ce1150cd87f22736e59f17e5d8a7b61a1354d4cd)]:
  - @weapp-tailwindcss/postcss@1.2.0

## 4.2.8

### Patch Changes

- Updated dependencies [[`7a33c9a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7a33c9afc8dfe1c32c76d0598e30753970a57146)]:
  - @weapp-tailwindcss/postcss@1.1.1

## 4.2.7

### Patch Changes

- [`88e4b4d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/88e4b4def9025f50d262df35b8163cbaa73f4b36) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 设置 `cssRemoveProperty` 默认为 `false`

  这是因为在部分小程序的真机，还有微信开发者工具中 `@property` 已经生效

- [`88a1d3d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/88a1d3d4b2ede7b62801fde85186afbbd620f7f4) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: 跳过不正确的 `sourcemap` 处理覆盖

## 4.2.6

### Patch Changes

- [`a8857e6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a8857e6e8cf196c273e5e56e5745e2de97cd308a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 依赖更新

- [`39e8e57`](https://github.com/sonofmagic/weapp-tailwindcss/commit/39e8e57cf8d54a0f1662b016a7cdb260326985f6) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 添加 cssEntries 作为 tailwindcss@4 的入口 css 的位置

- [`7419618`](https://github.com/sonofmagic/weapp-tailwindcss/commit/741961839510edafc39f2cebf91b8e8dc1cd8bd3) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 对 postcss-html-transform 进行二次封装

- Updated dependencies [[`7419618`](https://github.com/sonofmagic/weapp-tailwindcss/commit/741961839510edafc39f2cebf91b8e8dc1cd8bd3), [`a5d198f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a5d198ff0e8af52f218df98f3ce76a5dbfd8c691)]:
  - @weapp-tailwindcss/postcss@1.1.0
  - @weapp-tailwindcss/init@1.0.5

## 4.2.6-alpha.2

### Patch Changes

- Updated dependencies [[`a5d198f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a5d198ff0e8af52f218df98f3ce76a5dbfd8c691)]:
  - @weapp-tailwindcss/postcss@1.1.0-alpha.1

## 4.2.6-alpha.1

### Patch Changes

- [`a8857e6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a8857e6e8cf196c273e5e56e5745e2de97cd308a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 依赖更新

## 4.2.6-alpha.0

### Patch Changes

- [`39e8e57`](https://github.com/sonofmagic/weapp-tailwindcss/commit/39e8e57cf8d54a0f1662b016a7cdb260326985f6) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 添加 cssEntries 作为 tailwindcss@4 的入口 css 的位置

- [`7419618`](https://github.com/sonofmagic/weapp-tailwindcss/commit/741961839510edafc39f2cebf91b8e8dc1cd8bd3) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 对 postcss-html-transform 进行二次封装

- Updated dependencies [[`7419618`](https://github.com/sonofmagic/weapp-tailwindcss/commit/741961839510edafc39f2cebf91b8e8dc1cd8bd3)]:
  - @weapp-tailwindcss/postcss@1.0.22-alpha.0
  - @weapp-tailwindcss/init@1.0.5-alpha.0

## 4.2.5

### Patch Changes

- [`c7892d6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c7892d699d798abe27c63d1345423a5ac147cc76) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 优化 css 生成

- Updated dependencies [[`c7892d6`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c7892d699d798abe27c63d1345423a5ac147cc76)]:
  - @weapp-tailwindcss/postcss@1.0.21
  - @weapp-tailwindcss/init@1.0.4

## 4.2.4

### Patch Changes

- Updated dependencies [[`6cae2c1`](https://github.com/sonofmagic/weapp-tailwindcss/commit/6cae2c1471bfb7fdc182815ba95b566ad6f51dfa)]:
  - @weapp-tailwindcss/postcss@1.0.20

## 4.2.3

### Patch Changes

- [`f0d225e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f0d225e95eb3c8e0c97af4abf9c32b4abb57cd72) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: 修复 uvue lang 设置为 uts 的解析问题

## 4.2.2

### Patch Changes

- [`e17ca06`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e17ca06eb46c5c877dc328ee3937705f8f86ab71) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 支持鸿蒙系统

- [`8e4f8ad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8e4f8ad3a5e7e5ba4fa4b0ef7d365e412d1d881e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: css sourcemap

- [`57527cf`](https://github.com/sonofmagic/weapp-tailwindcss/commit/57527cfb93f997fc6de4a168a8dfca70f1c94d0c) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 添加 UNI_PLATFORM harmony 的判断

- Updated dependencies [[`8e4f8ad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8e4f8ad3a5e7e5ba4fa4b0ef7d365e412d1d881e)]:
  - @weapp-tailwindcss/postcss@1.0.19

## 4.2.2-alpha.2

### Patch Changes

- [`8e4f8ad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8e4f8ad3a5e7e5ba4fa4b0ef7d365e412d1d881e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: css sourcemap

- Updated dependencies [[`8e4f8ad`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8e4f8ad3a5e7e5ba4fa4b0ef7d365e412d1d881e)]:
  - @weapp-tailwindcss/postcss@1.0.19-alpha.0

## 4.2.2-alpha.1

### Patch Changes

- [`57527cf`](https://github.com/sonofmagic/weapp-tailwindcss/commit/57527cfb93f997fc6de4a168a8dfca70f1c94d0c) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 添加 UNI_PLATFORM harmony 的判断

## 4.2.2-alpha.0

### Patch Changes

- [`e17ca06`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e17ca06eb46c5c877dc328ee3937705f8f86ab71) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 支持鸿蒙系统

## 4.2.1

### Patch Changes

- [`d5c892c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d5c892c66046b81ae22b1e37b5d59f4a549d61c9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: uni-app x sourcemap

- [`05d9725`](https://github.com/sonofmagic/weapp-tailwindcss/commit/05d9725fa83496e72ce5386230a344ac30aa41fa) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: uni-app x ios build

- [`7927bf2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7927bf25cfac2f8df90e91eaa2379ba45079499b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: css always generate map for uni-app x

- [`1c81e7b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1c81e7b21747494c61bae264fe4da7a9c2344435) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: add uni-app x css sourcemap

- Updated dependencies [[`7927bf2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7927bf25cfac2f8df90e91eaa2379ba45079499b)]:
  - @weapp-tailwindcss/postcss@1.0.18

## 4.2.1-alpha.3

### Patch Changes

- [`7927bf2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7927bf25cfac2f8df90e91eaa2379ba45079499b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: css always generate map for uni-app x

- Updated dependencies [[`7927bf2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/7927bf25cfac2f8df90e91eaa2379ba45079499b)]:
  - @weapp-tailwindcss/postcss@1.0.18-alpha.0

## 4.2.1-alpha.2

### Patch Changes

- [`1c81e7b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1c81e7b21747494c61bae264fe4da7a9c2344435) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: add uni-app x css sourcemap

## 4.2.1-alpha.1

### Patch Changes

- [`d5c892c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d5c892c66046b81ae22b1e37b5d59f4a549d61c9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: uni-app x sourcemap

## 4.2.1-alpha.0

### Patch Changes

- [`05d9725`](https://github.com/sonofmagic/weapp-tailwindcss/commit/05d9725fa83496e72ce5386230a344ac30aa41fa) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: uni-app x ios build

## 4.2.0

### Minor Changes

- [`c001984`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c001984ca82324f71353d8419f13e50c0e89f0e3) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 支持 uni-app-x 构建 app 原生的方式

### Patch Changes

- [`77c0a47`](https://github.com/sonofmagic/weapp-tailwindcss/commit/77c0a4743c778ad6bf8a1d046c9966a3e016c1b6) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: upgrade tailwindcss-patch

- [`3248d34`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3248d342d07372e0627e21dcdd528ad44d2b52be) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: 支持 `index.uvue?type=page` 路径的兼容匹配

- [`0d8d68a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0d8d68ad70b9c308ba5c3aa42db5d543246ee1c5) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: pkg resolve issue

- Updated dependencies [[`47f4813`](https://github.com/sonofmagic/weapp-tailwindcss/commit/47f4813c7f901e35d844f1935e14de89eeeb32a1)]:
  - @weapp-tailwindcss/init@1.0.3
  - @weapp-tailwindcss/logger@1.0.2
  - @weapp-tailwindcss/mangle@1.0.5
  - @weapp-tailwindcss/postcss@1.0.17
  - @weapp-tailwindcss/shared@1.0.3

## 4.2.0-alpha.4

### Patch Changes

- [`77c0a47`](https://github.com/sonofmagic/weapp-tailwindcss/commit/77c0a4743c778ad6bf8a1d046c9966a3e016c1b6) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: upgrade tailwindcss-patch

## 4.2.0-alpha.3

### Patch Changes

- [`3248d34`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3248d342d07372e0627e21dcdd528ad44d2b52be) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: 支持 `index.uvue?type=page` 路径的兼容匹配

## 4.2.0-alpha.2

### Patch Changes

- Updated dependencies [[`47f4813`](https://github.com/sonofmagic/weapp-tailwindcss/commit/47f4813c7f901e35d844f1935e14de89eeeb32a1)]:
  - @weapp-tailwindcss/init@1.0.3-alpha.0
  - @weapp-tailwindcss/logger@1.0.2-alpha.0
  - @weapp-tailwindcss/mangle@1.0.5-alpha.0
  - @weapp-tailwindcss/postcss@1.0.17-alpha.0
  - @weapp-tailwindcss/shared@1.0.3-alpha.0

## 4.2.0-alpha.1

### Patch Changes

- [`0d8d68a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0d8d68ad70b9c308ba5c3aa42db5d543246ee1c5) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: pkg resolve issue

## 4.2.0-alpha.0

### Minor Changes

- [`c001984`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c001984ca82324f71353d8419f13e50c0e89f0e3) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 支持 uni-app-x 构建 app 原生的方式

## 4.1.11

### Patch Changes

- Updated dependencies [[`f2c69d5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/f2c69d5bd8e1dc3d39eced8ff62b75e0c4ef3591)]:
  - @weapp-tailwindcss/postcss@1.0.16

## 4.1.10

### Patch Changes

- [`2b0a754`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2b0a75493506d219d1b49474f3ce684d107fcbd1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: [#655](https://github.com/sonofmagic/weapp-tailwindcss/issues/655) 默认自动去除 `@layer` 在 `postcss-env-preset` 处理之前

- Updated dependencies [[`2b0a754`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2b0a75493506d219d1b49474f3ce684d107fcbd1)]:
  - @weapp-tailwindcss/postcss@1.0.15

## 4.1.9

### Patch Changes

- [`b090e69`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b090e699d279bfba680ecf208772500ea3689122) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: 同步 uni-app 和 uni-app-vite 的配置

- Updated dependencies [[`bf7e53c`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bf7e53cfcd69c49c5cd99f7bf21ad0999a31b1d6)]:
  - @weapp-tailwindcss/postcss@1.0.14

## 4.1.8

### Patch Changes

- [`5d89878`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5d89878854e1b707ed4afafffee096ec19976bae) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: default remove postcss-html-transform

- [`32f3b12`](https://github.com/sonofmagic/weapp-tailwindcss/commit/32f3b12eac220094e8cdcc5eba2a7dc0469a3e22) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: add postcss-html-transform plugin

- [`ddae06d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ddae06d0c3004234526c2b98f092d76f76c829df) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: injectAdditionalCssVarScope for tailwindcss@4

- Updated dependencies [[`32f3b12`](https://github.com/sonofmagic/weapp-tailwindcss/commit/32f3b12eac220094e8cdcc5eba2a7dc0469a3e22), [`ddae06d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ddae06d0c3004234526c2b98f092d76f76c829df)]:
  - @weapp-tailwindcss/postcss@1.0.13

## 4.1.8-beta.2

### Patch Changes

- [`5d89878`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5d89878854e1b707ed4afafffee096ec19976bae) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: default remove postcss-html-transform

## 4.1.8-beta.1

### Patch Changes

- [`32f3b12`](https://github.com/sonofmagic/weapp-tailwindcss/commit/32f3b12eac220094e8cdcc5eba2a7dc0469a3e22) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: add postcss-html-transform plugin

- Updated dependencies [[`32f3b12`](https://github.com/sonofmagic/weapp-tailwindcss/commit/32f3b12eac220094e8cdcc5eba2a7dc0469a3e22)]:
  - @weapp-tailwindcss/postcss@1.0.13-beta.1

## 4.1.8-beta.0

### Patch Changes

- [`ddae06d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ddae06d0c3004234526c2b98f092d76f76c829df) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: injectAdditionalCssVarScope for tailwindcss@4

- Updated dependencies [[`ddae06d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ddae06d0c3004234526c2b98f092d76f76c829df)]:
  - @weapp-tailwindcss/postcss@1.0.13-beta.0

## 4.1.7

### Patch Changes

- Updated dependencies [[`5d27de5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5d27de5a509da6984e77036da8a176e0570ba5c1)]:
  - @weapp-tailwindcss/postcss@1.0.12

## 4.1.6

### Patch Changes

- [`23d35ac`](https://github.com/sonofmagic/weapp-tailwindcss/commit/23d35aceddb9924d60a7afc5459f518b2e356f30) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: taro vue3 的上下文获取

## 4.1.6-alpha.0

### Patch Changes

- [`23d35ac`](https://github.com/sonofmagic/weapp-tailwindcss/commit/23d35aceddb9924d60a7afc5459f518b2e356f30) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: taro vue3 的上下文获取

## 4.1.5

### Patch Changes

- [`3cecfdc`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3cecfdccfcdfacd262fee571b0209e095b33838e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - 移除带有 `@supports` `color-mix` 的 css 节点, 修复
  - [#632](https://github.com/sonofmagic/weapp-tailwindcss/issues/632)
  - [#631](https://github.com/sonofmagic/weapp-tailwindcss/issues/631)

  > 但是这种行为会导致使用透明度 + css 变量的时候，被回滚到固定的颜色值，因为微信小程序不支持 `color-mix`，同时 `tailwindcss` 依赖 `color-mix` + `css var` 来进行颜色变量的计算。

- Updated dependencies [[`3cecfdc`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3cecfdccfcdfacd262fee571b0209e095b33838e)]:
  - @weapp-tailwindcss/postcss@1.0.11

## 4.1.4

### Patch Changes

- [`10aebb1`](https://github.com/sonofmagic/weapp-tailwindcss/commit/10aebb1a5ed73bac76c1370e44ea93cd820ed60c) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: add minify css

- [`1140b23`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1140b23dd3475b5654576ff262b6f9b7de23b60d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: support `tailwindcss@4.1.2`

- [`899226d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/899226d71c5fd022e0f374192766a5ed4e9fa5d4) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: build resolved css

- [`865d8c2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/865d8c2a1bcb56765cf06d9a918c88e16051f17c) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: minify exports css

- Updated dependencies [[`8b45542`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8b4554295e9671fd740fa18a9f9a25a17613597b), [`1140b23`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1140b23dd3475b5654576ff262b6f9b7de23b60d), [`0d6564a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0d6564aaaea588289dac5b1b784b1902105b297a), [`23c08c7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/23c08c7d7ad276035ffa3ef78d0fb00e1c717ddf)]:
  - @weapp-tailwindcss/postcss@1.0.10

## 4.1.4-alpha.5

### Patch Changes

- [`865d8c2`](https://github.com/sonofmagic/weapp-tailwindcss/commit/865d8c2a1bcb56765cf06d9a918c88e16051f17c) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: minify exports css

## 4.1.4-alpha.4

### Patch Changes

- Updated dependencies [[`8b45542`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8b4554295e9671fd740fa18a9f9a25a17613597b)]:
  - @weapp-tailwindcss/postcss@1.0.10-alpha.3

## 4.1.4-alpha.3

### Patch Changes

- [`1140b23`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1140b23dd3475b5654576ff262b6f9b7de23b60d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: support `tailwindcss@4.1.2`

- Updated dependencies [[`1140b23`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1140b23dd3475b5654576ff262b6f9b7de23b60d)]:
  - @weapp-tailwindcss/postcss@1.0.10-alpha.2

## 4.1.4-alpha.2

### Patch Changes

- Updated dependencies [[`23c08c7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/23c08c7d7ad276035ffa3ef78d0fb00e1c717ddf)]:
  - @weapp-tailwindcss/postcss@1.0.10-alpha.1

## 4.1.4-alpha.1

### Patch Changes

- Updated dependencies [[`0d6564a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0d6564aaaea588289dac5b1b784b1902105b297a)]:
  - @weapp-tailwindcss/postcss@1.0.10-alpha.0

## 4.1.4-alpha.0

### Patch Changes

- [`10aebb1`](https://github.com/sonofmagic/weapp-tailwindcss/commit/10aebb1a5ed73bac76c1370e44ea93cd820ed60c) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: add minify css

- [`899226d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/899226d71c5fd022e0f374192766a5ed4e9fa5d4) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: build resolved css

## 4.1.3

### Patch Changes

- [`3113053`](https://github.com/sonofmagic/weapp-tailwindcss/commit/31130538a13098e2a1d29bbd331dc67a195689cf) Thanks [@sonofmagic](https://github.com/sonofmagic)! - Fix: Support `Tailwindcss@4.1.1` and fix [#619](https://github.com/sonofmagic/weapp-tailwindcss/issues/619)

- Updated dependencies [[`3113053`](https://github.com/sonofmagic/weapp-tailwindcss/commit/31130538a13098e2a1d29bbd331dc67a195689cf)]:
  - @weapp-tailwindcss/postcss@1.0.9
  - @weapp-tailwindcss/mangle@1.0.4

## 4.1.2

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

- [`0b0bc70`](https://github.com/sonofmagic/weapp-tailwindcss/commit/0b0bc70f4773f2225eb48d9956cbe63d0858ca48) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: 修复在 tailwindcss@4 中由于 @layer 导致选择器优先级升高,高于就近编写的样式的问题

  更改 `weapp-tailwindcss/index.css` 的默认行为，以后小程序默认引入 `weapp-tailwindcss` 就不会产生 `@layer` ，假如开发者在小程序中使用 `@layer` 会导致当前文件的样式层级整体提升 `(n,0,0)`

  添加 `weapp-tailwindcss/with-layer.css` 用来和 `tailwindcss@4` 保持一致

- Updated dependencies [[`e8c4534`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e8c4534ab588eae1115dac15b529b7a122141316)]:
  - @weapp-tailwindcss/postcss@1.0.8

## 4.1.1

### Patch Changes

- [`b6de60f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b6de60f2bb7eb752435e9f9ca2f074276f9d0467) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: webpack4 插件编译错误问题

## 4.1.0

### Minor Changes

- [`3cc8835`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3cc88359d6ff68f7234b9316b9df554d188474df) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: support js ast cache

### Patch Changes

- [`d52a324`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d52a32406ff3945c5b0a11cc0131baf6b99aee5a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: improve NodePathWalker

- [`e0c37f5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e0c37f5f546b143341a75701a1907f876df38fa9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

- [`a6ebf16`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a6ebf16d67a23c8c919f2742d836bd50976171a7) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: NodePathWalker walkNode impl

- Updated dependencies [[`e0c37f5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e0c37f5f546b143341a75701a1907f876df38fa9)]:
  - @weapp-tailwindcss/init@1.0.2
  - @weapp-tailwindcss/logger@1.0.1
  - @weapp-tailwindcss/mangle@1.0.3
  - @weapp-tailwindcss/postcss@1.0.7
  - @weapp-tailwindcss/shared@1.0.2

## 4.1.0-alpha.3

### Patch Changes

- [`e0c37f5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e0c37f5f546b143341a75701a1907f876df38fa9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

- Updated dependencies [[`e0c37f5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e0c37f5f546b143341a75701a1907f876df38fa9)]:
  - @weapp-tailwindcss/init@1.0.2-alpha.0
  - @weapp-tailwindcss/logger@1.0.1-alpha.0
  - @weapp-tailwindcss/mangle@1.0.3-alpha.0
  - @weapp-tailwindcss/postcss@1.0.7-alpha.0
  - @weapp-tailwindcss/shared@1.0.2-alpha.0

## 4.1.0-alpha.2

### Patch Changes

- [`a6ebf16`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a6ebf16d67a23c8c919f2742d836bd50976171a7) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: NodePathWalker walkNode impl

## 4.1.0-alpha.1

### Patch Changes

- [`d52a324`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d52a32406ff3945c5b0a11cc0131baf6b99aee5a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: improve NodePathWalker

## 4.1.0-alpha.0

### Minor Changes

- [`3cc8835`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3cc88359d6ff68f7234b9316b9df554d188474df) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: support js ast cache

## 4.0.11

### Patch Changes

- [`ffa5bb0`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ffa5bb0b5d349e5985aec36996a43bbbe9f0eae0) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: node walk improve

- Updated dependencies [[`ff9933a`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ff9933ad06de7bf3333c1c63016920639a56b87a)]:
  - @weapp-tailwindcss/postcss@1.0.6

## 4.0.10

### Patch Changes

- [`5618019`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5618019c36bfabdef0cd4512f779127b83273db9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: 添加 TailwindcssPatcherOptions 给更高程度的自定义策略

## 4.0.9

### Patch Changes

- [`a6765b3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a6765b38addd14eaa346a76069cc7c7ba2143a8e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: upgrade to tailwindcss-patch and support rpx unit

## 4.0.8

### Patch Changes

- [`a4532ab`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a4532ab34de62556e57ed350e15ca14e602b7f93) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: 使用space-y-2后编译报错 #595

- Updated dependencies [[`a4532ab`](https://github.com/sonofmagic/weapp-tailwindcss/commit/a4532ab34de62556e57ed350e15ca14e602b7f93)]:
  - @weapp-tailwindcss/postcss@1.0.5

## 4.0.7

### Patch Changes

- Updated dependencies [[`9e65534`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9e65534f035ee4e17a2dc0b891278cacb92d5a0b)]:
  - @weapp-tailwindcss/postcss@1.0.4

## 4.0.6

### Patch Changes

- [`d856f81`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d856f81dbe1de4e67feba4f8e76d0a5275e007f1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - perf: add patcher default filter

## 4.0.6-alpha.0

### Patch Changes

- [`d856f81`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d856f81dbe1de4e67feba4f8e76d0a5275e007f1) Thanks [@sonofmagic](https://github.com/sonofmagic)! - perf: add patcher default filter

## 4.0.5

### Patch Changes

- [`11bae23`](https://github.com/sonofmagic/weapp-tailwindcss/commit/11bae23fd3de7332fd06a980b6a418f4795f6bc9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump deps

- Updated dependencies [[`11bae23`](https://github.com/sonofmagic/weapp-tailwindcss/commit/11bae23fd3de7332fd06a980b6a418f4795f6bc9)]:
  - @weapp-tailwindcss/mangle@1.0.2
  - @weapp-tailwindcss/postcss@1.0.3

## 4.0.4

### Patch Changes

- [`bdbca26`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bdbca268738ef033a5789e8a6713608c4d599b61) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 去除 ast-grep 支持，添加字符串字面量和模板字符串作用域扫描功能

- Updated dependencies [[`bdbca26`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bdbca268738ef033a5789e8a6713608c4d599b61)]:
  - @weapp-tailwindcss/shared@1.0.1
  - @weapp-tailwindcss/init@1.0.1
  - @weapp-tailwindcss/mangle@1.0.1
  - @weapp-tailwindcss/postcss@1.0.3

## 4.0.4-alpha.0

### Patch Changes

- [`bdbca26`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bdbca268738ef033a5789e8a6713608c4d599b61) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 去除 ast-grep 支持，添加字符串字面量和模板字符串作用域扫描功能

- Updated dependencies [[`bdbca26`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bdbca268738ef033a5789e8a6713608c4d599b61)]:
  - @weapp-tailwindcss/shared@1.0.1-alpha.0
  - @weapp-tailwindcss/init@1.0.1-alpha.0
  - @weapp-tailwindcss/mangle@1.0.1-alpha.0
  - @weapp-tailwindcss/postcss@1.0.3-alpha.0

## 4.0.3

### Patch Changes

- [`5b4f9cd`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5b4f9cdcfc3a6b0d5e9fdf8eb6e7ac27f3cb1cc9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

- [`ffbf93d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ffbf93d0897a0921f8085c2c14621d706e92989a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: release

- [`c647204`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c6472045bcdbbaa84c85be642c1f42ab53b11486) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

- [`6a2f78d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/6a2f78d72d795d578cdcb1876310eef57fe463ca) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: get class set error

## 4.0.3-alpha.3

### Patch Changes

- [`c647204`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c6472045bcdbbaa84c85be642c1f42ab53b11486) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

## 4.0.3-alpha.2

### Patch Changes

- [`5b4f9cd`](https://github.com/sonofmagic/weapp-tailwindcss/commit/5b4f9cdcfc3a6b0d5e9fdf8eb6e7ac27f3cb1cc9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

## 4.0.3-alpha.1

### Patch Changes

- [`ffbf93d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ffbf93d0897a0921f8085c2c14621d706e92989a) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: release

## 4.0.3-alpha.0

### Patch Changes

- [`6a2f78d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/6a2f78d72d795d578cdcb1876310eef57fe463ca) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: get class set error

## 4.0.2

### Patch Changes

- [`64c0189`](https://github.com/sonofmagic/weapp-tailwindcss/commit/64c018935732481ebe2f366e4136b4d3574dde57) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: improve `isAllowedClassName` preflight

- [`13b72d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/13b72d8fbd3aad6fb49a772fd09c36c70e5eda56) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: add `resolve` option

- Updated dependencies [[`64c0189`](https://github.com/sonofmagic/weapp-tailwindcss/commit/64c018935732481ebe2f366e4136b4d3574dde57)]:
  - @weapp-tailwindcss/postcss@1.0.2

## 4.0.1

### Patch Changes

- [`41d7049`](https://github.com/sonofmagic/weapp-tailwindcss/commit/41d7049654f7d1fa1c52b3ae845e30e5fa994880) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: upgrade tailwindcss patch and set tailwindcss options

- Updated dependencies [[`ee34fb3`](https://github.com/sonofmagic/weapp-tailwindcss/commit/ee34fb34688a2bd11018ce5e4ea6d07a062b0b55)]:
  - @weapp-tailwindcss/postcss@1.0.1

## 4.0.0

### Major Changes

- [`bafd149`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bafd149f0510b30cbf95711223583055023e7875) Thanks [@sonofmagic](https://github.com/sonofmagic)! - ## Feature

  增加 `@weapp-tailwindcss/merge` 支持，这是 `weapp-tailwindcss` 版本的 `tailwindcss-merge` 和 `cva` 方法

  ## Breaking Changes
  1. 去除 `weapp-tailwindcss/postcss` (可直接安装使用 `@weapp-tailwindcss/postcss`)
  2. 增加 `weapp-tailwindcss/escape` 来取代 `weapp-tailwindcss/replace`
  3. 项目 monorepo 区分包

### Minor Changes

- [`de0e4d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/de0e4d8f38477e806df74b24926d280319ac8419) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: add `ignoreTaggedTemplateExpressionIdentifiers` and `ignoreCallExpressionIdentifiers` options

### Patch Changes

- [`3da8643`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3da864338de73a304346fd47b4a91fa18d9f3163) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: loaderUtils.getOptions

- [`43f7ab8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/43f7ab82b047a067bf7d37d88ed861be7b0609d4) Thanks [@sonofmagic](https://github.com/sonofmagic)! - refactor: remove @babel/generator

- [`21dc7a0`](https://github.com/sonofmagic/weapp-tailwindcss/commit/21dc7a079c02e011961a0c9375d096432ee44768) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: add @weapp-tailwindcss/merge as default ignoreCallExpressionIdentifiers options dep

- [`2c51531`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2c515310f1fdfd15d11e2e35213c7e6bfcb55c3d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

- [`d7fa028`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d7fa02877ce74792687765766ff94ae3e30edf3b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: rename export function

- [`1d689ef`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1d689efca6cf0de7e476b03b2be8d09284beae68) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: change postcssPresetEnv default value

- [`e745ba5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e745ba5cd9e232c0b5b7053538beb0772240eab8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

- [`06921c8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/06921c86fc10f4649818e4dafb2597114cb4204c) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 更改 cssChildCombinatorReplaceValue 默认值从 ['view'] -> ['view', 'text'] 为了更好的小程序开发体验

- Updated dependencies [[`d4bfcc7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d4bfcc7a25776eb9869bd934c05e3b49a3f4cc8b), [`bafd149`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bafd149f0510b30cbf95711223583055023e7875), [`2c51531`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2c515310f1fdfd15d11e2e35213c7e6bfcb55c3d), [`d7fa028`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d7fa02877ce74792687765766ff94ae3e30edf3b), [`1d689ef`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1d689efca6cf0de7e476b03b2be8d09284beae68), [`1df699b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1df699bf82d66847cbc64cc8f294ef237e0470c5), [`6d20f1f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/6d20f1f9a799cf350dcbbd861907f0ff70a68dfd), [`de0e4d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/de0e4d8f38477e806df74b24926d280319ac8419), [`d50d95d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d50d95d04e1c6b7c3ff32acc0d9894d3c0f06d22), [`e745ba5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e745ba5cd9e232c0b5b7053538beb0772240eab8)]:
  - @weapp-tailwindcss/postcss@1.0.0
  - @weapp-tailwindcss/init@1.0.0
  - @weapp-tailwindcss/logger@1.0.0
  - @weapp-tailwindcss/mangle@1.0.0
  - @weapp-tailwindcss/shared@1.0.0

## 4.0.0-alpha.13

### Patch Changes

- [`1d689ef`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1d689efca6cf0de7e476b03b2be8d09284beae68) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: change postcssPresetEnv default value

- Updated dependencies [[`1d689ef`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1d689efca6cf0de7e476b03b2be8d09284beae68)]:
  - @weapp-tailwindcss/postcss@1.0.0-alpha.8

## 4.0.0-alpha.12

### Patch Changes

- Updated dependencies [[`d4bfcc7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d4bfcc7a25776eb9869bd934c05e3b49a3f4cc8b)]:
  - @weapp-tailwindcss/postcss@1.0.0-alpha.7

## 4.0.0-alpha.11

### Patch Changes

- [`3da8643`](https://github.com/sonofmagic/weapp-tailwindcss/commit/3da864338de73a304346fd47b4a91fa18d9f3163) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: loaderUtils.getOptions

## 4.0.0-alpha.10

### Patch Changes

- [`e745ba5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e745ba5cd9e232c0b5b7053538beb0772240eab8) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: bump version

- Updated dependencies [[`e745ba5`](https://github.com/sonofmagic/weapp-tailwindcss/commit/e745ba5cd9e232c0b5b7053538beb0772240eab8)]:
  - @weapp-tailwindcss/init@1.0.0-alpha.5
  - @weapp-tailwindcss/logger@1.0.0-alpha.3
  - @weapp-tailwindcss/mangle@1.0.0-alpha.5
  - @weapp-tailwindcss/postcss@1.0.0-alpha.6
  - @weapp-tailwindcss/shared@1.0.0-alpha.4

## 4.0.0-alpha.9

### Patch Changes

- Updated dependencies [[`6d20f1f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/6d20f1f9a799cf350dcbbd861907f0ff70a68dfd)]:
  - @weapp-tailwindcss/postcss@1.0.0-alpha.5

## 4.0.0-alpha.8

### Patch Changes

- [`d7fa028`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d7fa02877ce74792687765766ff94ae3e30edf3b) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: rename export function

- Updated dependencies [[`d7fa028`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d7fa02877ce74792687765766ff94ae3e30edf3b)]:
  - @weapp-tailwindcss/init@1.0.0-alpha.4
  - @weapp-tailwindcss/logger@1.0.0-alpha.2
  - @weapp-tailwindcss/mangle@1.0.0-alpha.4
  - @weapp-tailwindcss/postcss@1.0.0-alpha.4
  - @weapp-tailwindcss/shared@1.0.0-alpha.3

## 4.0.0-alpha.7

### Patch Changes

- [`2c51531`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2c515310f1fdfd15d11e2e35213c7e6bfcb55c3d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

- Updated dependencies [[`2c51531`](https://github.com/sonofmagic/weapp-tailwindcss/commit/2c515310f1fdfd15d11e2e35213c7e6bfcb55c3d)]:
  - @weapp-tailwindcss/postcss@1.0.0-alpha.3
  - @weapp-tailwindcss/mangle@1.0.0-alpha.3
  - @weapp-tailwindcss/shared@1.0.0-alpha.2
  - @weapp-tailwindcss/init@1.0.0-alpha.3
  - @weapp-tailwindcss/logger@1.0.0-alpha.1

## 4.0.0-alpha.6

### Patch Changes

- [`06921c8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/06921c86fc10f4649818e4dafb2597114cb4204c) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: 更改 cssChildCombinatorReplaceValue 默认值从 ['view'] -> ['view', 'text'] 为了更好的小程序开发体验

## 4.0.0-alpha.5

### Patch Changes

- [`43f7ab8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/43f7ab82b047a067bf7d37d88ed861be7b0609d4) Thanks [@sonofmagic](https://github.com/sonofmagic)! - refactor: remove @babel/generator

## 4.0.0-alpha.4

### Patch Changes

- Updated dependencies [[`1df699b`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1df699bf82d66847cbc64cc8f294ef237e0470c5)]:
  - @weapp-tailwindcss/postcss@1.0.0-alpha.2
  - @weapp-tailwindcss/mangle@1.0.0-alpha.2

## 4.0.0-alpha.3

### Major Changes

- [`bafd149`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bafd149f0510b30cbf95711223583055023e7875) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore: monorepo changes

### Patch Changes

- Updated dependencies [[`bafd149`](https://github.com/sonofmagic/weapp-tailwindcss/commit/bafd149f0510b30cbf95711223583055023e7875)]:
  - @weapp-tailwindcss/init@1.0.0-alpha.2
  - @weapp-tailwindcss/logger@1.0.0-alpha.0
  - @weapp-tailwindcss/mangle@1.0.0-alpha.1
  - @weapp-tailwindcss/postcss@1.0.0-alpha.1
  - @weapp-tailwindcss/shared@1.0.0-alpha.1

## 3.8.0-alpha.2

### Patch Changes

- Updated dependencies [[`d50d95d`](https://github.com/sonofmagic/weapp-tailwindcss/commit/d50d95d04e1c6b7c3ff32acc0d9894d3c0f06d22)]:
  - @weapp-tailwindcss/shared@0.0.1-alpha.0
  - @weapp-tailwindcss/init@0.0.1-alpha.1
  - @weapp-tailwindcss/mangle@0.0.1-alpha.0
  - @weapp-tailwindcss/postcss@0.0.1-alpha.0

## 3.8.0-alpha.1

### Patch Changes

- [`21dc7a0`](https://github.com/sonofmagic/weapp-tailwindcss/commit/21dc7a079c02e011961a0c9375d096432ee44768) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: add @weapp-tailwindcss/merge as default ignoreCallExpressionIdentifiers options dep

## 3.8.0-alpha.0

### Minor Changes

- [`de0e4d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/de0e4d8f38477e806df74b24926d280319ac8419) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: add `ignoreTaggedTemplateExpressionIdentifiers` and `ignoreCallExpressionIdentifiers` options

### Patch Changes

- Updated dependencies [[`de0e4d8`](https://github.com/sonofmagic/weapp-tailwindcss/commit/de0e4d8f38477e806df74b24926d280319ac8419)]:
  - @weapp-tailwindcss/init@0.0.1-alpha.0

## 3.7.0

### Minor Changes

- [`9e3891e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9e3891ec6b18519b75d850d9637f2ea57e3bab91) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: upgrade to tailwindcss-patch@5.x

### Patch Changes

- [`1c37dab`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1c37dab354da866565ee843419e3fdbef187630e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

- [`b55f4d7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b55f4d75962031d26f665f60106ea2ed52e162bb) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 支持使用 weappTwIgnore 在js中标识无需转译的字面量

## 3.7.0-alpha.2

### Patch Changes

- [`b55f4d7`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b55f4d75962031d26f665f60106ea2ed52e162bb) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 支持使用 weappTwIgnore 在js中标识无需转译的字面量

## 3.7.0-alpha.1

### Patch Changes

- [`1c37dab`](https://github.com/sonofmagic/weapp-tailwindcss/commit/1c37dab354da866565ee843419e3fdbef187630e) Thanks [@sonofmagic](https://github.com/sonofmagic)! - chore(deps): upgrade

## 3.7.0-alpha.0

### Minor Changes

- [`9e3891e`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9e3891ec6b18519b75d850d9637f2ea57e3bab91) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: upgrade to tailwindcss-patch@5.x

## 3.6.2

### Patch Changes

- [`8423d35`](https://github.com/sonofmagic/weapp-tailwindcss/commit/8423d35c775c250730fc84b869cabe2525a01178) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: [Bug]: 将tailwind.config中的important选项设置为一个class选择器时，编译到微信小程序后wxss会报编译错误 #473

## 3.6.1

### Patch Changes

- [#471](https://github.com/sonofmagic/weapp-tailwindcss/pull/471) [`b60fe7f`](https://github.com/sonofmagic/weapp-tailwindcss/commit/b60fe7f338df7db87ab1c8fb705f1659d9df6afd) Thanks [@sonofmagic](https://github.com/sonofmagic)! - fix: [#470](https://github.com/sonofmagic/weapp-tailwindcss/issues/470)

## 3.6.0

### Minor Changes

- [`0955492`](https://github.com/sonofmagic/weapp-tailwindcss/commit/095549299cefce15559578f28a6b1624b43fb1c9) Thanks [@sonofmagic](https://github.com/sonofmagic)! - <br/>
  - feat: 升级依赖项，去除了 `nodejs@16` 的支持，需求的 `nodejs` 版本，升级到了 `^18.17.0 || >=20.5.0`
  - feat: 从 `weapp-tailwindcss@3.6.0` 版本开始移除 `@weapp-tailwindcss/cli` ，原先 `@weapp-tailwindcss/cli` 的项目，可以几乎 **0成本** 的迁移到 `weapp-vite`

## 3.5.3

### Patch Changes

- [`fef8375`](https://github.com/sonofmagic/weapp-tailwindcss/commit/fef8375ab825842b3beb5d30170891eb400da79d) Thanks [@sonofmagic](https://github.com/sonofmagic)! - feat: 添加小红书 `xhsml` 支持
  feat: 添加 `weapp-tw init` 一键式初始化脚本

## 3.5.1

### Patch Changes

- [`9890f09`](https://github.com/sonofmagic/weapp-tailwindcss/commit/9890f09a990682e10aabab7b8dc685a58d977fca) Thanks [@sonofmagic](https://github.com/sonofmagic)! - Date: 2024-09-01
  - 重构 `wxml` 模板替换相关的实现

## 3.4.1-alpha.0

### Patch Changes

- 792f50c: chore: compact for `weapp-vite`
