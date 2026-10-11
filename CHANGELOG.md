# Changelog

## 0.0.0

### Patch Changes

- deps upgrade

- 补充跨平台 Dev、Build 与 HMR 覆盖契约，统一开发服务启动 smoke 与 coverage 报告中的 dev 生命周期验证。

## 0.0.0

### Patch Changes

- upgrade deps

## Unreleased

## 目前项目已经启用了 changeset 生成日志，对应的日志见：

- [`weapp-tailwindcss`](./packages/weapp-tailwindcss/CHANGELOG.md)
- [`weapp-vite`](./packages/weapp-vite/CHANGELOG.md)

## 3.5.0 (2024-8-15)

### Feature

- [#355](https://github.com/sonofmagic/weapp-tailwindcss/issues/355) 将 js 和 css 相关结果全部由 core 抛出，会影响 api 的返回值

## 3.4.0

### Feature

- 升级到 `tailwindcss-patch@4.0.0` ，采用新的内置补丁配置

## 3.3.7

### Fixed

- 使用新的 `Tokenizer` 来对 `wxml`  进行词法分析获取最精确的结果, 完成 [#319](https://github.com/sonofmagic/weapp-tailwindcss/issues/319)

## 3.3.5-3.3.6 (2023-7-11)

### Fixed

- [#316](https://github.com/sonofmagic/weapp-tailwindcss/issues/316)
- 修复原生小程序在一个 `class` 中使用 {{x}}-{{y}} 写法造成重复转译问题。

## 3.3.4 (2023-7-6)

### Fixed

- [#314](https://github.com/sonofmagic/weapp-tailwindcss/issues/314)
- [#310](https://github.com/sonofmagic/weapp-tailwindcss/issues/310)

## 3.3.2 - 3.3.3 (2024-6-25)

### Features

- 升级 [`tailwindcss-mangle`](https://github.com/sonofmagic/tailwindcss-mangle) 相关依赖包到 `3.0`

### Fixed

- 修复 `dts` 类型问题 [#308](https://github.com/sonofmagic/weapp-tailwindcss/issues/308)

## 3.3.1 (2024-6-9)

### Features

- 支持涂鸦小程序

### Fixed

- 修复 [#304](https://github.com/sonofmagic/weapp-tailwindcss/issues/304)

## 3.3.0 (2024-6-5)

### Features

- 升级到 `tailwindcss-patch@3` ，支持 `tailwindcss postcss7 compat` 的 `jit` 模式

## 3.2.1 (2024-5-10)

### Features

- 添加 `cssRemoveHoverPseudoClass` 配置，默认在小程序平台去除 `:hover` 元素

## 3.2.0 (2024-5-1)

### Features

- 添加对原生微信小程序的支持，添加 `@weapp-tailwindcss/cli`

### Chore

- 整个项目变为 `monorepo`

## 3.1.1 (2024-3-30)

### Chore

- 去除 `package.json` 里的 `optionalDependencies` 以减小安装依赖的大小，此时启用 `jsAstTool`: `ast-grep` 需要用户自己手动安装 `@ast-grep/napi`

## 3.1.0 (2024-3-22)

### Features

- 使用 `htmlparser` 的 `xml` 模式来解析 `wxml`
- 增加 `jsAstTool` 配置项，可选使用 `@ast-grep/napi` 来解析 `js ast`，速度可提升 `1.5`- `2` 倍多左右

## 3.0.5 (2024-1-7)

### Fixed

- Lock htmlparser2 version [#268](https://github.com/sonofmagic/weapp-tailwindcss/issues/268)

## 3.0.4-3.0.0

<https://github.com/sonofmagic/weapp-tailwindcss/issues/259>

<https://tw.icebreaker.top/docs/migrations/v2>

## 2.11.0 (2023-11-13)

## Features

- 添加单独的 Nodejs API [#255](https://github.com/sonofmagic/weapp-tailwindcss/issues/255), [相关文档](https://tw.icebreaker.top/docs/quick-start/frameworks/api)

## 2.10.1 (2023-10-17)

## Fix

- 修复样式条件编译语法糖，uni-app 会在某些版本中破坏条件编译的注释，这时候需要这个插件去修复一下。

## 2.10.0 (2023-10-16)

## Features

- 添加 [uni-app-css-macro](https://tw.icebreaker.top/docs/quick-start/uni-app-css-macro) 样式条件编译语法糖相关功能

## Chore

- 升级 `rollup` 相关依赖到 `4.x`

## 2.9.3 (2023-09-28)

## Features

- 添加 `tailwindcssBasedir` 配置项
- 异步化 `postcss` 以及缓存还有所有的插件

## 2.9.2 ~ 2.9.1 (2023-09-19)

## Features

- 建立缓存机制，大幅增加 `vite` 插件的热更新速度

## Fixed

- mpx编译wxml属性值单引号问题 [#241](https://github.com/sonofmagic/weapp-tailwindcss/issues/241)

## 2.9.0 (2023-09-18)

## Features

- 建立缓存机制，大幅增加 `webpack` 插件的热更新速度

## 2.8.4 (2023-09-08)

## Fixed

- 修复由于使用 `eval` 导致 `jsHandler` 递归处理时的 `ast` 解析错误问题。

## 2.8.3 (2023-09-08)

- 添加 `mergeVirtualHostAttributes` 的 `virtualHost` 虚拟节点支持

## 2.8.0 (2023-08-15)

## Features

- 默认使用 `jsEscapeStrategy` 的 `replace` 模式
- 重写了 `wxml` 解析器以代替正则匹配替换的方式，以做到更加精确的匹配
- 更加精准的 `customAttributes` 配置项，现在配置项中，使用字符串代表着，精确匹配标签或者属性，可以使用正则来匹配多个。

## Chore

- 升级 `tailwindcss-patch` 相关的依赖到 `^2.1.0`

## 2.7.0

## Features

- 添加 `jsEscapeStrategy` 配置项，用于切换所有的 `js`字符串中，处理字符串和模板字面量的替换模式。
- 详细配置见 <https://tw.icebreaker.top/docs/api/interfaces/UserDefinedOptions#jsescapestrategy>

## Chore

- 升级 `tailwindcss-patch` 和 `@tailwindcss-mangle` 相关依赖到 `2.x` 版本

## 2.6.3 (2023-07-27)

## Fixed

- 修复直接引用 `npm` 包时，不出现智能提示的问题

## Chore

- 拆分 `@weapp-core` 相关的包引用
- 去除无用依赖，升级相关包到 `esm` 格式

## 2.6.2 (2023-07-17)

## Features

- 添加 `disabledDefaultTemplateHandler` 配置项，可以禁用默认的模板标签匹配转化器

## Fixed

- 修复部分错误的 `injectAdditionalCssVarScope` 注入样式
- 修复因为英语水平差，造成长久以来的拼写问题：`templete -> template`

## Chore

- 升级 `tailwindcss-patcher` 到 `1.2.7`

## 2.6.1 (2023-07-17)

### Features

- 添加 `jsPreserveClass` 配置项，用于处理 `tailwindcss` 和 `js` 转义字面量撞车的情况。
- 现在所有的默认值可以通过 `weapp-tailwindcss/defaults` 获取到了，

### Fixed

- 修复带 `*` 的 `js` 字面量，由于和 `tailwindcss` 运行时冲突，导致错误转义的问题。

## 2.6.0 (2023-07-11)

### Features

- 添加 `injectAdditionalCssVarScope` 配置项，用于 `tailwindcss` 变量区域的重新注入

### Chore

- 升级 `@csstools` 到最新版本，使用 `MIT-0` 协议
- 升级 `babel` 相关的依赖

## 2.5.0~2.5.2 (2023-06-19)

### Features

- 添加 `wxs` 支持，包含内联使用和引入的转义，并添加对应的配置项
- 添加多 `tailwindcss` 上下文的支持，用户可以在一个项目里，创建多个 `tailwindcss`上下文，使得不同的目录，应用不同的 `tailwindcss` 策略

## 2.4.4 (2023-06-14)

### Features

- 添加 `cssChildCombinatorReplaceValue` 配置项，允许用户自定义直接子代选择器行为
- 更精细化的处理了 css 选择器的转义逻辑

## 2.4.3 (2023-06-10)

### Fixed

- 修复class name 第一个css selector 为数字，导致的16进制选择器问题，导致小程序报错的问题，解决方案位添加首字母阻止\3转义

## 2.4.2 (2023-05-25)

- 仓库改名为 `weapp-tailwindcss`
- 添加 `arbitraryvalues` 配置项，允许用户切换分割模式
- 使用 `typedoc` 来生成 `options` 的文档
- 重构 `mangle` 功能代码，添加对应的单元测试用例，现在的单元测试代码覆盖率已经提升到了 `99%`

## 2.4.1 (2023-05-23)

修复了 tarojs vue3 框架下，由于vue3产生静态节点，产生静态的html字符串，导致js转义字符串时，没有匹配到相应字符串的问题。
不过这个这个改动也导致我们在写 tailwindcss class 的时候，使用任意值，无法在里面写双引号了。
什么意思呢？

```js
after:content-["你好啊，我很无聊"] ×
after:content-['你好啊，我很无聊'] √
```

所以接下来会开放配置项，允许用户自行开启关闭这个问题，毕竟目前只在 taro vue3 里面出现。

## 2.4.0 (2023-05-22)

- 最小支持 nodejs 版本为 16

## 2.3.1 (2023-05-18)

### Chore

- 增加 `./webpack` 路径下的导出和类型，现在都可以使用 `xxx/webpack`,`xxx/vite`,`xxx/gulp`,`xxx/postcss`,`xxx/replace` 这类的方式来处理了
- 更完善的 readme.md

### Fixed

- 修复ts直接引入 `./` 下的 `type`智能提示问题

## 2.3.0 (2023-05-16)

### Features

- 添加 `mangle` 配置项，可以对 `tailwindcss` 生成的类名进行缩短以及混淆
- 添加 `esm` 支持

### Chores

- 使用 `exports` 导出项目，去除根目录下的 `.d.ts`
- 升级 `pnpm` from v7 to v8
- 去除所有 `webpack4` 相关的依赖
- 使用 `jest` 测试 `cjs` , `vitest` 测试 `vite` 相关 `case`
- 采用 `Github Action` 进行正式发布以及自动生成 `github changelog`

## 2.2.0 (2023-05-07)

### Features

- class选择器支持 unicode
- 重写了转义核心方法，优化性能

### Fixed

- tarojs 在热更新时，保存非 `[jt]sx` 文件，比如 `tailwind.config.js` / `xx.scss` 文件，导致样式丢失的问题

### Breaking Changes

- 去除所有的 v1 版本的插件，重构代码和更改目录,如果你还是想用 v1 插件，请锁定你的版本在 `2.1.5` 以下。
- 去除了无用的配置项

## 2.1.5 (2023-05-04)

### Features

- `js` 文件进行转义时，自动判断格式是 `cjs` 还是 `esm`
- 现在能针对 `eval` 包裹的 `js`脚本进行转义了
- 去除所有 `mangle` 相关代码，相关功能现在到 [tailwindcss-mangle](https://github.com/sonofmagic/tailwindcss-mangle)

### Chores

- 给之前的 `v1` 版本的插件打上 `deprecated` 标记，添加对应的 `jsdoc`
- 整理目录去除 `v1` 版本的 `markdown` 文件目录，相关转移到了 `website` 中

## 2.1.4 (2023-04-30)

### Fixed

- 默认按照环境变量来决定是否压缩js代码，同时添加`minifiedJs`配置项手动进行指定 [[#164](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/164)]
- 修复 `webpack filesystem` 缓存，导致的二次编译结果错误问题。这是由于启用文件缓存后，`webpack`二次打包时候直接使用缓存，而不去触发`postcss`相关插件导致的。

## 2.1.3 (2023-04-28)

### Chores

- 升级 `tailwindcss-patch` 的最小版本，修复 `nodejs14` `npm preinstall hook` 报错的问题
- 把 `tailwindcss` 打补丁最低版本降到 `3.0.0`
- 默认 `jsMatcher` 现在会包括 `.cjs`/`.mjs` 这种文件后缀名了

## 2.1.2 (2023-04-22)

### Features

- 支持作为 `gulp` 插件使用 [#161](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/161)

## 2.1.1 (2023-04-17)

### Fixed

修复 `bg-[url('img_src')]` 写法失效的问题 [#158](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/158)

## 2.1.0 (2023-04-12)

### Features

- jsHandler 增强，添加了针对模板字符串的处理
- [tailwindcss-patch](https://www.npmjs.com/package/tailwindcss-patch) 如今作为一个独立的 `npm` 包来依赖了
- 增强了所有字面量分割的方式，增强了针对 `vue3` 静态模板字符串的处理方式。

## 2.0.2 - 2.0.4 (2023-04-07)

### Docs

- <https://tw.icebreaker.top/>

### Fixed

- 修复因 `typescript` 升级 `5.x` 导致的 `dts` 路径错误问题
- 展开 `:is()` [#153](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/153)

## 2.0.1 (2023-03-21)

### Fixed

- `rpx` 支持，在`patch`时，语法上统一转化为单引号字符串数组。

### Chore

- 大量的文档优化

## 1.12.8 (2022-12-17)

### Features

- 增加 `customReplaceDictionary` 的 `simple`/`complex`模式，`simple`为更简短的`className`
- `replace` 导出所有，用于自定义运行时对 `replace` 行为进行二次封装。

## 1.12.7 (2022-12-14)

### Fixed

- typescript dts fixed

### Chore

文档更新，添加 `customAttributes` 案例

## 1.12.6 (2022-12-06)

### Features

- 实现 `customAttributes` `*`全匹配的逻辑

## 1.12.4 (2022-11-25)

### Features

- 额外导出 `UniAppWeappTailwindcssWebpackPluginV5` 用于 `uni-app` 的 `vue/cli 5` 版本

### Chore

- 添加 `uni-app-webpack5` Demo 用于 `vue/cli 5` 版本
- uni-app Readme 完善

## 1.12.(0-3) (2022-11-20)

### Features

- 添加 `supportCustomLengthUnitsPatch` 配置项，默认开启。

自从`tailwindcss 3.2.0`对任意值添加了长度单位的校验后，小程序中的`rpx`这个`wxss`单位，由于不在长度合法名单中，于是被识别成了颜色，导致与预期不符，详见：[issues/110](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/110)。

所以这个选项是用来给`tailwindcss`运行时，自动打上一个支持`rpx`单位的补丁。默认开启，在绝大部分情况下，你都可以忽略这个配置项，除非你需要更高级的自定义。

比较和处理的策略详见 [patcher.ts](./src/tailwindcss/patcher.ts)

- 升级 `rollup` 主版本和相关包到 `3`, 优化 `rollup` 打包生成的 `chunk`
- 添加 `cli`, 目前添加了 `patch` 指令，可手动给 `tailwindcss` 打上 `patch`。具体执行 `npx weapp-tailwindcss patch` or `npx weapp-tw patch`
- 在安装这个包后，会自动检索 `tailwindcss` 运行时源码，打上支持 `rpx` 的 `patch`。不过这种自动检索存在一定的缺陷，比如在第一次运行的时候会不生效，第二次运行的时候才生效了。这是因为 nodejs 运行时先加载好了 `tailwindcss` ，然后再来运行插件，自动给 `tailwindcss` 运行时打上 `patch`。此时由于 `tailwindcss` 模块已经加载，所以 `patch` 在第一次运行时不生效，ctrl+c 关闭之后，再次运行才生效。这种情况可以使用:

```
 "scripts": {
+  "postinstall": "weapp-tw patch"
 }
```

这样的 `npm hook` 来自动打 `patch`

## 1.11.6 (2022-11-06)

### Fixed

- 使用 `utf-8` 中文字体进行`wxml`条件判断时，会默认进行`unicode`转义的bug.

## 1.11.5 (2022-10-31)

### Chore

- 去除 `vite` 插件使用 `windicss` 和 `unocss` 的命令行警告
- 添加 `unocss` 的使用文档和案例

## 1.11.3 (2022-10-20)

### Features

- `customAttributes` 现在允许使用 `Map` 类型了，可以自定义匹配标签正则。

### Chore

- `webpack jsx test case` 完善

## 1.11.3 (2022-10-17)

### Features

- 现在针对 `wxml` 的匹配默认会更加精准，同时也影响 `customAttributes` 配置,详见 [test/regexp-maker.test.ts](test/regexp-maker.test.ts)
- `customAttributes` 现在允许正则类型了。

## 1.11.(1-2) (2022-10-7)

### Chore

- 更改 `readme` `options` 的排版, 去除原先的 `md table`，让阅读体验好一些。
- 去除 `vite plugin` 的重复性创建 `function` 方法

## 1.11.0 (2022-10-6)

### Features

- 增加 `customAttributes` 配置，用于自定义wxml标签上的转化属性，默认转化所有的 `class` 和 `hover-class`。
- 增加 `customReplaceDictionary` 配置，自定义转化 `class`名称字典，你可以使用这个选项来简化生成的 `class`

## 1.10.0 (2022-10-2)

### Features

- 编写了第二版本的 `jsx` 处理方法，替换第一版本。
- 支持 `vue2/vue3` + `tsx` 开发 [#100](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/100)

## 1.9.3 (2022-09-22)

### Features

- 以模板为主的 `uni-app`,`mina`等等的 `wxml` 变量处理方式，当遇到二元运算符时，忽略运算符中，字符串字面量的转义。

## 1.9.2 (2022-09-10)

### Fixed

- `tailwindcss` 伪元素 `jit` 的自定义特殊字符。

### Chore

- 重构重命名核心方法，为 `v2` 做准备。

## 1.9.1 (2022-09-08)

### Features

- `vite` 插件，可以直接注册，不需要再引入 `postcss` 插件

### Chore

- 暂时去除 `mangle` 配置
- 去除 `lodash.groupby` 引用，减少包的体积

## 1.9.0 (2022-09-05)

### Features

- 添加 `mangle` 配置，用于压缩混淆 `className`，详见 [mangle.md](./docs/mangle.md)
- 重构 `transformSync`， 废弃 `mpRulePreflight`
- `weapp-tailwindcss-webpack-plugin/replacer` 额外暴露 `replaceEscapedCss`
- 暴露 `weapp-tailwindcss-webpack-plugin/mangle` 插件

## 1.8.1 (2022-08-22)

### Fixed

- [using-arbitrary-variants](https://tailwindcss.com/docs/hover-focus-and-other-states#using-arbitrary-variants) 自定义选择器类名支持与修复 [[#84](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/84)]

## 1.8.0 (2022-08-17)

### Features

- 添加 `tailwindcss` 默认伪元素的 `--tw-content` 变量初始值
- 依赖处理方式改变，`postcss` 和 `postcss-selector-parser` 从编译时打入，变为安装时连带
- 精细化的移除选择器，当发现不支持的伪类选择器时，原先的策略是把 `Rule` 整个移除，现在会遍历这个 `Rule` 的所有选择器，只把不支持的选择器的移除，当且仅当所有的选择器都被移除时，这个 `Rule` 才被整个移除

### Fixed

- 修复 `vite` 版本 `tailwindcss` 默认注入变量选择器 `undefined` 的问题

## 1.7.3 (2022-08-15)

### Features

- 允许用户使用 `replaceUniversalSelectorWith` 选项来自定义`css`全局选择器`*`的替换值 [issue[#81](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/81)]

## 1.7.2 (2022-08-15)

### Fixed

- 修复在伪元素中使用`*`自动被替换的问题 [#79](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/79)

### Chore

- 更改转义字典表，添加 `*`，`\\`和 `"` 的默认转义，规范化以前转义生成的`_[code]_`。

## 1.7.1 (2022-08-06)

### Chore

- 更新打包成`app`文档和模板选择文档
- 依赖更新

## 1.7.0 (2022-08-04)

### Features

- 支持 `taro 3.5`，用法如下：

简单修改 Taro 的编译配置即可切换使用 Webpack4 或 Webpack5 进行编译：

```js
/** config/index.js */
const config = {
  // 自定义编译工具，可选 'Webpack4' 或 'Webpack5'
  compiler: 'webpack5'
}
```

其中:

- `Webpack4` 使用 `TaroWeappTailwindcssWebpackPluginV4` 进行注册
- `Webpack5` 使用 `TaroWeappTailwindcssWebpackPluginV5` 进行注册

## 1.6.9 (2022-07-29)

### Features

- 添加 `disabled` 配置项，用来表示是否禁用该插件，默认为 `false`，一般用于多平台构建，有些平台比如 `h5` 不需要开启此插件，所以可以根据环境变量进行禁用。
- `onUpdate` 这个生命周期 `hook` 增加传入参数，即编译前的 `rawSource` 和 编译后的 `newSource` 作为第二和第三个参数，用于插件调试和文件内容比较。

### Docs & Demos

- 添加 `HBuilderX` 创建的项目的[使用方式](https://github.com/sonofmagic/uni-app-vue2-tailwind-hbuilder-template#readme) 和 [Demo 项目](https://github.com/sonofmagic/uni-app-vue2-tailwind-hbuilder-template)

## 1.6.8 (2022-07-01)

### Features

- 添加 `cssPreflightRange` 配置项 [pull/62](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/pull/62)，用来限制全局选择器影响的 `dom` 范围，从而增加或者减少 `cssPreflight` 注入的 `dom`，具体的使用方式见 `README.md`

## 1.6.7 (2022-06-22)

### Features

- 不再锁定 `@babel/*` 的具体版本

### Fixed

- 修复 `remax` 版本的 `hoverClassName` 不处理的问题。(`remax`命名比较特殊)

## 1.6.6 (2022-06-21)

### Features

- 添加 `tailwindcss` 的 `dark mode` (media) 支持。
- 现在 `uni-app` 和 `taro` 都会同时转义 `class` 和 `hover-class` 里的内容了 [uni-app-vite-vue3-tailwind-vscode-template/issues/3](https://github.com/sonofmagic/uni-app-vite-vue3-tailwind-vscode-template/issues/3)。

### Fixed

- 修复 `taro vue3` 版本 `babel` 处理导致打包失败的问题。

## 1.6.5 (2022-06-19)

### Improvement

- 优化 `ts` 生成的 `.d.ts` 文件的 `npm` 包索引。

## 1.6.4 (2022-06-11)

### Fixed

[issues/53](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/53) 在`BaseJsxWebpackPlugin`的新文件开始处理前强制重置`replacer`状态。(Thanks to [sandro-qiang](https://github.com/sandro-qiang))

## 1.6.2 (2022-06-10)

## Improvement

- 优化被分割的 `vite`,`postcss` 的 `d.ts` 智能提示

## 1.6.1 (2022-06-08)

## Improvement

- 优化 `Tree-shaking` ，减小`npm`包打包体积

## 1.6.0 (2022-06-08)

### Fixed

[issues/50](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/50) `vite` 插件依赖 `webpack` 问题

### Breaking change

`vite` 引入插件的方式，改为:

```js
import vwt from 'weapp-tailwindcss-webpack-plugin/vite'
import postcssWeappTailwindcssRename from 'weapp-tailwindcss-webpack-plugin/postcss'
```

详见 [vite.config.ts](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/blob/main/demo/uni-app-vue3-vite/vite.config.ts)

## 1.5.0 (2022-06-01)

### Fixed

[issues/48](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/48) Source map 指向错误问题.

### Breaking change

更改了兼容 `webpack 4/5` 的 `react` 版本插件的实现。原先是对 `webpack` `emit` 后的产物进行分析和替换，现在新的实现为: 动态创建一个新的 `jsx-rename-loader`，它运行在 `babel-loader` 之后，对 `babel-loader` 的产物进行替换。这样最终生成的 `Source map` 就不会存在指向错误问题了。

收到影响的 `Plugin`:

- **taro react** : `TaroWeappTailwindcssWebpackPluginV4`
- **rax react** : `RaxTailwindcssWebpackPluginV5`
- **remax react** : `RemaxWeappTailwindcssWebpackPluginV4`

## 1.4.4 (2022-05-19)

## 1.4.3 (2022-05-18)

## 1.4.0 (2022-05-15)

Breaking change: handle `wxml` with `regex` instead of `wxml-ast` [issues/38](https://github.com/sonofmagic/weapp-tailwindcss-webpack-plugin/issues/38).
