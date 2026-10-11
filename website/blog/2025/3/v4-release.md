---
title: "4.0.0 \U0001F680"
date: 2025-03-01T00:00:00.000Z
authors: sonofmagic
description: weapp-tailwindcss v4.0 正式发布，核心亮点是兼容 tailwindcss@4 并引入 tailwind-merge 运行时整合能力。文章总结了升级背后的思路，并提供 uni-app 示例帮助你快速落地。
keywords:
  - v4 release
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - uni-app
  - taro
  - mpx
---

weapp-tailwindcss v4.0 正式发布，核心亮点是兼容 `tailwindcss@4` 并引入 `tailwind-merge` 运行时整合能力。文章总结了升级背后的思路，并提供 uni-app 示例帮助你快速落地。

<!-- truncate -->

![4.0 release](https://cdn.jsdelivr.net/gh/sonofmagic/static/mbpv4-release.png)

# weapp-tailwindcss v4.0 发布了！

## **总结**

经历了一番自虐式开发后，`weapp-tailwindcss` **v4.0** 终于发布了！

在清理了一些自己当初写的屎山代码后，我终于实现了心心念念的两个大功能：

1. **支持 `tailwindcss@4.x` 版本**
2. **支持 `tailwind-merge`**

> 因为 `tailwindcss@4` 直接变成了一个样式预处理器，定位上类似 `Sass` / `Less`，所以相关的改动还是挺大的。当前文档站以 Tailwind CSS 4 为主线。

想快速上手集成？欢迎访问 [weapp-tailwindcss 官网](https://tw.weapp.dev/)！
如果你想进一步了解细节，下面有个示例，看看就懂了。

---

## **uni-app 快速集成示例**

这里我们以 **`uni-app`（Vue3 + Vite）** 为例。

### **1. 安装依赖**

```bash npm2yarn
npm install -D tailwindcss @tailwindcss/vite weapp-tailwindcss
```

然后，把下面这段脚本加入 `package.json` 的 `scripts` 字段里：

```json title="package.json"
{
  "scripts": {
    // highlight-next-line
    "postinstall": "weapp-tw patch"
  }
}
```

> 这个补丁是为了让 `tailwindcss@4` 认识 `rpx` 单位，否则它会以为 `rpx` 是个颜色单位，导致 `text-[40rpx]` 这样的样式翻车。

---

### **2. 配置 `vite.config.ts`**

```ts title="vite.config.ts"
import uni from '@dcloudio/vite-plugin-uni'
import { defineConfig } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

export default defineConfig(async () => {
  // 这里必须这样引用，因为 uni 只提供 cjs 版本，而 @tailwindcss/vite 只提供 esm 版本
  const { default: tailwindcss } = await import('@tailwindcss/vite')
  return {
    plugins: [
      uni(),
      tailwindcss(),
      WeappTailwindcss({ rem2rpx: true })
    ],
  }
})
```

---

### **3. 添加样式**

在项目目录下创建 `main.css`，然后添加以下内容：

```css title="main.css"
@import 'tailwindcss';
```

> **注意**：在 `tailwindcss@4` + `weapp-tailwindcss@5` 中，实际运行时入口推荐直接写 `@import 'tailwindcss'`。构建器会在小程序生成链路里解析到 `weapp-tailwindcss` 的目标 CSS，用户代码里不需要改成 `@import 'weapp-tailwindcss/index.css'`。

接着在 `main.js` 里引用这个文件作为全局样式，然后直接运行：

```bash npm2yarn
npm run dev:mp-weixin
```

在微信开发者工具中导入这个项目，在项目中使用 `tailwindcss` 原子类，即可看到效果。

---

## **遇到的问题以及解决方案**

### **1. `tailwindcss@4` 的样式兼容性问题**

`tailwindcss@4` 生成的样式广泛使用了 `@layer`、`color-mix`、`oklch` 等新特性，现代浏览器兼容性都不咋地，更别说小程序了。

所以无论是 H5 还是小程序，都需要 `postcss-preset-env` 来降级这些样式的生成结果。降级的程度取决于你的 `browserslist` 配置。

---

### **2. `tailwind-merge` 样式合并问题**

`tailwind-merge` 是一个 `tailwindcss` 运行时样式合并工具，它能自动合并重复的样式。不过，小程序端用 `tailwind-merge` 有点挑战，因为：

- `weapp-tailwindcss` **在编译时** 对 `tailwindcss` 样式做转义。
- `tailwind-merge` **在运行时** 处理样式合并。

这导致 `tailwind-merge` 处理已转义的 `class` 时，误以为它们是普通 `class`，而不是 `tailwindcss` 的原子类。

### **解决方案：编译时感应 + 运行时合并转义**

我研究了一下 `tailwind-merge` 的源码，尝试写一个 `plugin` 来解决这个问题，结果发现路走不通，因为：

- `tailwind-merge` 内部有一些硬编码规则，比如 `!` 代表 `!important`，无法通过 `plugin` 自定义。

于是，我换了个思路，**采用编译时感应、忽略转义，运行时合并转义的方式** 解决了这个问题，这就是 **`@weapp-tailwindcss/merge`** 诞生的原因。

#### **编译时感应的原理**

我利用 `babel` 的 `scope`（作用域） 和 `binding`（绑定） 增强了识别能力

`scope` 简而言之就是 `js` 基础里的大括号, `binding` 就是一个变量真正的绑定

比如：

```js
const b = 'after:xx'
const a = `${b} text-[#123456]`
cn(a, 'xx', 'yy')
```

这段代码的作用域是全局，然后 `cn` 中 `a` 的绑定是一个 `VariableDeclaration` 它的 `init` 中，又引用了 `b` ，它的绑定也是一个 `VariableDeclaration` 初始化是一个 `StringLiteral`

于是，在编译时，我们可以从 `cn` 递归向上找到 `a` 和 `b`，识别出完整的样式链。

当然，另一种方式是 **自上而下查找**，通过 `import` 语句分析模块依赖关系，甚至可以利用打包工具的模块分析图进行静态分析。

当然这块的实现被用在了 **`@weapp-tailwindcss/merge`** 中，详见 [tailwind-merge 快速开始](https://tw.weapp.dev/docs/community/merge)。

---

## **开发心得**

在开发的时候，一定要把可能影响结果的方式，拆成多多阶段运行，比如在修改 `js ast` 的时候，不应该一边 `traverse` ，一边再用 `MagicString` 去修改，而是应该把需要修改的地方，先全部收集出来，然后在一个阶段统一去修改。

另外鉴别一个 `ast` 工具的成熟度，也应该考虑一下，作用域和绑定的关系，能否被解析出来。比如我们都知道 `js` 里面大概有 `5` 种行为会产生作用域:

- **Program**：全局作用域，整个文件的顶层作用域。
- **FunctionDeclaration / FunctionExpression / ArrowFunctionExpression**：函数作用域（包括箭头函数）。
- **BlockStatement**：块级作用域（由 `{}` 包裹，例如 if、for、while 中的块，在 ES6 中支持 let 和 const）。
- **ClassDeclaration / ClassExpression**：类作用域（类的主体和方法会引入作用域）。
- **CatchClause**：try-catch 中 catch 块的作用域。

而绑定本身也是通过 `scope` 和它的 `parent` 依次向上去找的。

## 最后一点碎碎念

转眼我也到了而立之年，在这个行情下，毕业（失业）随时可能发生，当然也不敢毕业，毕竟上有老下有小，还有各种贷款。

技术学得越多，越觉得是个无底洞。而且掌握的东西多了，好像也没什么收益。更何况前端技术和那种 AI 技术相比，就像是过家家一样的。

开源呢？搞了半天也没啥产出，想成为开源明星，但自己技术水平也没到那个级别。

最近，我开始深入学习 **云原生**，因为我意识到，国内这种国情下 **"技术是工具，业务才是目的"**。

这导致我们技术人员的地位是非常低的，这点只要还在国内混就无法改变。

所以我们自己也不要对自己或者团队写的东西，搞得有多好多完美的似的。够用就行，多尝试，先快速搞他个 100 个应用，然后挑没死的去进行进一步的开发。

举个例子，现在让我从 0 到 1 搭建一个完整的业务系统，我可以全程自主搞定：

- **前端**：`Vue` / `React`
- **后端**：`Node.js`（任意框架）
- **数据库**：`MongoDB` / `PostgreSQL`
- **运维**：`Docker` / `Serverless`

但问题是——**开发成本和时间成本太高了！**

这种情况，我要自己去设计数据库，写 `openapi.yml` ，然后实现接口，还要自己写前端，和自己对接。写的差不多了还要测试，又是一堆 `bug`。

而且还可能遇到技术难点，之前我在 `Node.js` 中实现 `PostgreSQL` 的 `GraphQL` 方案，就折腾了好久。这种情况，为什么不直接上 `pg_graphql` 这种成熟的中间件呢？

所以，从商业角度来看：

1. **写尽可能少的代码**，尽量利用成熟方案快速搭建业务。
2. **赚钱才是第一要务**，哪里有问题，先堆机器解决，实在搞不定了，再招专业人才处理。
3. **多利用AI来降本增效**，AI 成本比人低，所以招个高级，不如招个初级的，会用 AI 的，学习能力好的程序员，毕竟前端静态页面，AI 生成可快了

所以，从一个程序员的视角出发:

**这是最好的时代，也是最坏的时代。**

---

## **参考链接**

- [weapp-tailwindcss 迁移文档](https://tw.weapp.dev/docs/migrations/v5)
- [Tailwindcss@4 各个框架集成方式](https://tw.weapp.dev/docs/tailwindcss/v4-reference)
- [Tailwindcss@4 升级指南](https://tailwindcss.com/docs/upgrade-guide)
- [uni-app-tailwindcss-v4 参考模板](https://github.com/icebreaker-template/uni-app-tailwindcss-v4)

> 补充：classic `uni-app vue2 / webpack` 路线已经不再推荐，新项目请优先选择 `uni-app vue3 vite`。
