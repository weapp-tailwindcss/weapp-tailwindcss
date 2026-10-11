# 样式注入与分包隔离

## 优先入口

`weapp-tailwindcss` 内置 `styleInjector` 选项，常规项目优先使用它：

```ts
WeappTailwindcss({
  styleInjector: {
    imports: ['./styles/shared.wxss'],
  },
})
```

只有独立使用或高级适配才直接安装 `weapp-style-injector`。

## 独立 API

- Core：`createStyleInjector()` 处理传入文件名和内容。
- Vite：`weappStyleInjector()`。
- Webpack：`weappStyleInjectorWebpack()` 或框架入口。
- 框架入口：Taro、uni-app、Mpx 的 Vite/Webpack helper。

默认识别 `.wxss`、`.acss`、`.css`、`.qss`、`.ttss`、`.jxss`，但实际平台后缀仍应来自构建图。

## 注入原则

- imports 是构建产物中的相对引用，不是源码绝对路径。
- 保持幂等，重复 transform 不重复插入。
- 通过 asset/source 对象修改内容，不直接写输出目录。
- 使用 bundler 提供的 file name、source map 和模块关系，不猜固定主样式名。

## 分包

普通分包可以引用主包允许共享的样式；独立分包必须拥有自己的 Tailwind 入口和样式资产。为每个 scope 明确：

- framework 与 bundler。
- source root 和 output root。
- 普通/独立分包标记。
- 入口 CSS、目标样式 asset 和实际扩展名。
- 允许注入的 import 路径。

使用主插件公开的 `styleInjector.rules` 或对应框架 resolver 建模映射，不按输出路径片段猜所属分包。直接使用底层包时，`normalizeSubpackageStyleRules()` 只是规范化 helper，不是主插件配置字段。

每个 scope 的生成回调都应从 `SubpackageStyleGenerateContext` 读取 `sourcePath`、`sourceFiles`、`pageStyleFiles`、`outputFileName`、`styleExt`、framework 和 bundler，再将该 scope 对应 Tailwind 入口生成的 CSS 交给 `transformWxss()`。不要复用另一个分包的 CSS 文本或 runtime set。

## 验证

1. 主包、普通分包、独立分包各有一条唯一 class。
2. 检查每个 class 只出现在允许的 style scope。
3. 连续构建两次，import 不重复。
4. watch 中修改分包 class，不污染主包或其他独立分包。
5. 覆盖 Vite/Webpack 及真实平台后缀。

框架 preset 的入口解析与分包归属应复用 `weapp-style-injector` 的共享 resolution 层。Vite、Webpack、Taro、uni-app 与 Mpx adapter 只负责把各自构建图信息交给该层，不各自复制路径猜测。
