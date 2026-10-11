---
title: How to contribute
audience: maintainer
description: >-
  It's actually very simple. You don't necessarily need to contribute code. You raise an issue, answer a question, and
  write a related article. These are all contributions to the project, and there is no need to stick to specific forms.
keywords:
  - How to contribute
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
  - mpx
  - How
  - to
  - contribute
  - Tailwind CSS 4
  - cross-platform
  - mini app
  - React Native
  - Lynx
---

# How to contribute

> Recommended reading [How to contribute to open source?](https://opensource.guide/zh-hans/how-to-contribute/)

## How to contribute to this project?

It's actually very simple. You don't necessarily need to contribute code. You can mention `issue`, answer a question, and write a related article. These are all contributions to the project, and there is no need to stick to specific forms.

No matter what you do, as long as you play a positive role in helping the development of this project, we are grateful to you 🙏!

## Contribution Guidelines

First, you must `fork` [`weapp-tailwindcss`](https://github.com/weapp-tailwindcss/weapp-tailwindcss) this project to your own account, and then you `git clone` it to your local.

### Documentation contribution

Currently, all documents on this website are in the [weapp-tailwindcss/website](https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/website) directory.

You can add articles, modify articles, delete articles in it, and then submit them to your `fork` branch, and then from `pr` to the `weapp-tailwindcss` branch of `main`.

The `website` project will be deployed under the domain name `https://tw.weapp.dev` and displayed as the document of [`weapp-tailwindcss`](https://github.com/weapp-tailwindcss/weapp-tailwindcss).

As far as the project is concerned, this is a project of `docusaurus@2`. Similar to `vuepress`/`vitepress`, it is also an open source document generation tool, but it is written by `react`.

> For `docusaurus` related documents, see [docusaurus.io](https://docusaurus.io/)

#### Directory introduction

- `docs`: `md`,`mdx` document location
- `src`: source code, you can write `jsx`,`tsx` here
- `static`: The location of static resources
- `docusaurus.config.js`: `docusaurus` configuration, `navbar` can be deployed here
- `sidebars.js`: Adjust all `sidebar` configuration files. When you add a document, you need to declare its location here.

### Code contribution

#### Root directory introduction

- `assets`: A place where all static resources are stored, including `weapp-tailwindcss`, all `logo`, and the corresponding `figma` files for secondary design and development.
- `bin`: `cli` entry file
- `demo`: The place where all `demo` is stored, including various usage methods of each framework.
- `demo-linked`: A place where part of `demo` is stored. The difference is that the registration method of `weapp-tailwindcss` here is local `linked`
- `e2e`: The place where `e2e` tests are stored. The test objects are those projects under `demo`
- `plugins`: Stores some `web` plug-ins migrated from `tailwindcss` to mini programs, currently including `@weapp-tailwindcss/typography`
- `scripts`: The location where some commonly used scripts are stored, such as `readme.md` generation scripts, etc.
- `src`: Source code directory, more details later
- `test`: Unit test and test snapshot location. Generally, an `bug` appears. We all need to design one or more test cases. Only after the test passes can it be released.
- `website`: Documentation website

#### Technical introduction

- Unit tests and `e2e` tests now fully use `vitest` which used to be `jest`
- Packaged using `rollup`

### src source code introduction

Currently `weapp-tailwindcss` uses:

- `babel` to handle `js`/`wxs`
- `htmlparser2` to handle `wxml`
- `postcss` to handle `wxss`

Why?

#### wxml htmlparser2

Using `htmlparser2` is already a later version of `v2`

Initially I used `@vivaxy/wxml` which is an `wxml` tool for `ast`

But it has not been updated for a long time. When it encounters inline `wxs`, it will hang directly. There are also various problems.

Subsequent regular expressions are used to process `wxml`, but regular expressions are also problematic, such as this `case`:

`<view class="{{2>1?'xxx':'yyy'}}"></view>`

Due to the existence of `2>1`, it will match and return in advance, so you still need to use the `ast` tool to achieve accuracy.

And `parse5` is a strict match for `html5` and is not very applicable to `wxml`

So `htmlparser2` was finally chosen to handle `wxml`

#### js/wxs babel

There is mainly 1 evolution here. It was originally

`@babel/parser`->`@babel/traverse`->`@babel/generator`

But this is equivalent to regenerating the user's js, and the sourcemap will also be messed up.

Therefore, it was later changed to the method of `@babel/parser`->`@babel/traverse`->`magic-string#replace` for exact matching.

#### postcss

There are more evolutions here, which is equivalent to adding multiple postcss plug-ins for conversion.

### src directory introduction

- `babel`: `babel` tool class
- `bundlers`: storage usage method, currently provides `webpack`, `vite`, `gulp` plug-in usage methods
- `cache`: Caching strategy, used to solve the problem of hot update speed when the project is relatively large. Essentially, it calculates the `hash` value of the file content. If there is no change, it skips the parsing of `ast` and returns the result directly.
- `css-macro`: The old version of `uni-app` style conditional compilation entry, new documents give priority to Tailwind CSS v4 `@custom-variant`
- `debug`: `debug` for debugging
- `extractors`: Extractor, used to split strings
- `js`: A place for processing the results of translating `js`
- `postcss`: related to `postcss`, where all `wxss` results are processed
- `tailwindcss`: Used for `hack` `tailwindcss`, patch it and force it to support some features of the mini program
- `wxml`: Where to handle `wxml`
- `*`: `src` Some other files, mostly export files

For the current Tailwind generation, design-token, and component-boundary model, see [Tailwind design principles](./tailwindcss/tailwind-core).

:::warning Maintainers only
The local debugging, build, and test instructions on this page are for repository contributors and maintainers, not for application integration.
:::

## How to debug locally

Are you having trouble debugging locally on a project like mine?

In fact, local debugging is very simple. How do you debug the `webpack`/`vite`/`gulp`/`postcss` plug-in? You can also use these experiences to debug this project.

### Unit test debugging

There are currently a large number of unit tests in this project to test each module.

Currently I use `vitest` for unit testing (previously I used `jest` + `ts-jest` but its support for the mixed reference mode of `esm` + `cjs` is not very good)

So you can install the `vscode` plugin of

At this time, you can select one and you can perform the operation of `run`, or `debug`, or `Open test file`.

Of course, you can also directly open the `*.test.ts` test file. At this time, a running green `describe` will appear in front of `test`/`it`/`icon`. Just click on `run` and right-click to select `Debugging test`.

For example, if you want to debug my `postcss` plug-in, you can quote my relevant code and write a use case in the `test` file:

For example, run `console.log` on the `postcss([plugin]).process(rawSource).css` result, and then put a breakpoint in my `postcss` source code. At this time, if you perform the `debug` operation, you can hit the breakpoint in the source code.

The same goes for debugging plug-ins such as `webpack`/`vite`. You need to prepare the corresponding configuration for `webpack`/`vite`, such as `webpack/vite` and `api` to introduce the plug-in and build it so that the breakpoint in the plug-in can be hit.

## Source code mapping debugging

The core here is `sourcemap`. You need to type out `sourcemap` when building locally, and then import and register all products into the corresponding `app` application (`uni-app`/`taro`).

In this way, when you use the `javascript` debugging terminal to run, you can hit `dist` in the `js` product, and then hit it into your `sourcemap` source code based on `ts`.

Of course, if the `sourcemap` you generate is incorrect or not generated, you can also debug it directly at the `dist` breakpoint in the `js` product, but this requires you to have a good understanding of the source code.

Of course, it is too troublesome to use the `javascript` debugging terminal every time. For this reason, I prepared the `.vscode/launch.json` file to help us quickly debug the framework product, so as to obtain first-hand `uni-app` / `taro` products.
