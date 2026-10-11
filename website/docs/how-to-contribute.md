---
title: 如何贡献
audience: maintainer
description: 其实非常简单，你不一定需要贡献代码，你提一个 issue，回答一个问题，写一篇相关的文章，这些都是为项目做贡献，无需拘泥于具体的形式。
keywords:
  - 如何贡献
  - how to contribute
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - uni-app
  - taro
  - mpx
---
# 如何贡献

> 推荐阅读 [如何为开源做贡献?](https://opensource.guide/zh-hans/how-to-contribute/)

## 如何本项目做贡献？

其实非常简单，你不一定需要贡献代码，你提一个 `issue`，回答一个问题，写一篇相关的文章，这些都是为项目做贡献，无需拘泥于具体的形式。

无论你做什么，只要你对这个项目的发展，起到正向的帮助的，我们对你表示感谢 🙏！

## 贡献指南

首先，你必须 `fork` [`weapp-tailwindcss`](https://github.com/weapp-tailwindcss/weapp-tailwindcss) 这个项目到你自己的账号下，然后你再把它 `git clone` 到你的本地。

### 文档贡献

目前本网站所有的文档都在 [weapp-tailwindcss/website](https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/website) 目录下，

你可以在里面任意添加文章，修改文章，删除文章，然后提交到你 `fork` 的分支，然后在 `pr` 到 `weapp-tailwindcss` 的 `main` 分支。

`website` 这个项目会被部署到 `https://tw.weapp.dev` 这个域名下，作为 [`weapp-tailwindcss`](https://github.com/weapp-tailwindcss/weapp-tailwindcss) 的文档展示。

就项目而言，这是一个 `docusaurus@2` 的项目，和 `vuepress`/`vitepress` 类似，它也是一个开源的文档生成工具，不过它是 `react` 写的。

> `docusaurus` 相关的文档见 [docusaurus.io](https://docusaurus.io/)

#### 目录介绍

- `docs`: `md`,`mdx` 文档所在位置
- `src`: 源代码，你可以在这里写 `jsx`,`tsx`
- `static`: 静态资源所在位置
- `docusaurus.config.js`: `docusaurus` 配置，可在此处调配 `navbar`
- `sidebars.js`: 调整所有 `sidebar` 的配置文件，当你添加一篇文档，你需要在这里声明它的位置

### 代码贡献

#### 根目录介绍

- `assets`: 存放所有静态资源的地方，包括 `weapp-tailwindcss` 所有的 `logo`，还有对应的 `figma` 文件可以做二次设计开发
- `bin`: `cli` 入口文件
- `demo`: 存放所有 `demo` 的地方，里面包含各个框架的各种使用方式
- `demo-linked`: 存放部分 `demo` 的地方，不同的是，这里 `weapp-tailwindcss` 的注册方式都是本地 `linked`
- `e2e`: 存放 `e2e` 测试的地方，测试对象就是 `demo` 下的那些项目
- `plugins`: 存放一些从 `web` 迁移到小程序的 `tailwindcss` 插件，目前包含 `@weapp-tailwindcss/typography`
- `scripts`: 存放一些常用脚本的位置，比如 `readme.md` 生成脚本等等
- `src`: 源代码目录，待会细讲
- `test`: 单元测试和测试快照位置，一般出现一个 `bug`，我们都需要设计 1 到多个测试用例，测试通过后才能发布
- `website`: 文档网站

#### 使用技术介绍

- 单元测试和 `e2e` 测试现在完全使用了 `vitest` 过去曾经是 `jest`
- 打包使用的是 `rollup`

### src 源代码介绍

目前 `weapp-tailwindcss` 使用:

- `babel` 来处理 `js`/`wxs`
- `htmlparser2` 来处理 `wxml`
- `postcss` 来处理 `wxss`

Why？

#### wxml htmlparser2

使用 `htmlparser2` 已经是 `v2` 版本后期的事情了

一开始使用的是 `@vivaxy/wxml` 这是一个 `wxml` 的 `ast` 工具

但是它已经很久没有更新了，在遇到内联的 `wxs` 的时候，会直接挂掉，另外还有各种问题。

后续使用正则来处理 `wxml`，但是正则同样是有问题的，比如这样一个 `case`:

`<view class="{{2>1?'xxx':'yyy'}}"></view>`

由于 `2>1`的存在，它会提前匹配并进行返回，所以还是要使用 `ast` 工具才能做到精确。

而 `parse5` 对 `html5` 是严格的匹配，不怎么适用于 `wxml`

所以最终选择 `htmlparser2` 来处理 `wxml`

#### js/wxs babel

这里主要有1个演进原先是

`@babel/parser`->`@babel/traverse`->`@babel/generator`

但是这样，相当于重新生成了一遍用户的 js，同时 sourcemap 也会错乱

所以后续改成了 `@babel/parser`->`@babel/traverse`->`magic-string#replace` 的方式，做精确匹配

#### postcss

这里的演进比较多，也就是相当于加入了多个 postcss 插件进行转换。

### src 目录介绍

- `babel`: `babel` 工具类
- `bundlers`: 存放使用方式，目前提供 `webpack`,`vite`,`gulp` 插件的使用方式
- `cache`: 缓存策略，用于解决在项目比较大时，热更新的速度问题，本质上是通过计算文件内容的 `hash` 值，如果没有发生改变就跳过 `ast` 的解析，直接返回结果的策略
- `css-macro`: 旧版 `uni-app` 样式条件编译入口，新文档优先使用 Tailwind CSS v4 `@custom-variant`
- `debug`: `debug` 调试用
- `extractors`: 提取器，用于分割字符串
- `js`: 用于处理转译 `js` 结果的地方
- `postcss`: 和 `postcss` 相关，用于处理所有 `wxss` 结果的地方
- `tailwindcss`: 用于 `hack` `tailwindcss`，给它打补丁，强制让它支持小程序的一些特性
- `wxml`: 处理 `wxml` 的地方
- `*`: `src` 其他一些文件，大多是一些导出文件

想了解当前 Tailwind 生成、设计 token 与组件封装边界，参阅 [Tailwind 设计理念](./tailwindcss/tailwind-core)。

:::warning 仅供仓库维护者
本页的本地调试、构建和测试说明只适用于贡献仓库代码或文档的维护者，不是业务项目接入步骤。
:::

## 如何本地调试

你是否对我这种类型项目的本地调试感到棘手？

其实本地调试很简单，你怎么调试 `webpack`/`vite`/`gulp`/`postcss`插件，同样可以用这些的经验来调试这个项目。

### 单元测试调试

目前这个项目里有大量的单元测试，来对各个模块进行测试。

目前我使用的使用 `vitest` 来进行进行单元测试 (之前使用 `jest` + `ts-jest` 但是它对 `esm`+`cjs`的混合引用的模式，支持不算很好)

所以你可以安装 `vscode` 的 `vitest` 插件，安装完成之后，在 `vscode` 左侧的测试管理器会看到大量的测试用例，这些都是它感应到了 `test` 项目里的单元测试。

此时，你可以选中一个，你就可以进行 `运行`，或者 `调试` ，或者 `打开测试文件` 的操作。

当然你也可以直接打开 `*.test.ts` 测试文件，此时，在 `describe`/`test`/`it` 在前面会出现一个运行的绿色 `icon`，直接点是 `运行`，右键选择 `调试测试` 即可

比如你要调试我的 `postcss` 插件，你就可以引用我的相关代码，在 `test` 文件里写一个用例：

比如 `console.log` 一下 `postcss([plugin]).process(rawSource).css` 结果 ，然后在我的 `postcss` 源代码里面打上断点，这时候再去进行 `调试` 操作，就能命中源码里面的断点了。

调试 `webpack`/`vite` 等等插件同理，你需要准备 `webpack`/`vite` 对应的配置,比如 `webpack/vite` 的 `api` 去引入插件，来进行构建，这样才能命中插件里的断点。

## 源码映射调试

这里的核心是 `sourcemap`，你需要在本地构建的时候，把 `sourcemap` 打出来，然后把所有产物被对应的 `app` 应用（`uni-app`/`taro`）引入并注册

这样你在使用 `javascript` 调试终端，进行运行的时候，就能命中 `dist` 产物里的 `js`，然后再根据 `sourcemap` 命中到你的 `ts` 源码里去了。

当然，假如你生成的 `sourcemap` 不对，或者不生成，你也可以直接在 `dist` 产物里的 `js` 直接打断点进行调试，不过这需要你对源代码比较了解。

当然，每次都使用 `javascript` 调试终端太过于麻烦，为此我准备了 `.vscode/launch.json` 文件，帮助我们快速进行框架产物调试，这样才能获取第一手的 `uni-app` / `taro` 产物。
