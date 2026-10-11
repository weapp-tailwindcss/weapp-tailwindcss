# @weapp-tailwindcss/engine

> [English](./README.md) | 简体中文

Tailwind CSS 4 的候选提取、文件扫描和样式生成引擎，可独立使用，也供 `weapp-tailwindcss`、PostCSS 包与 CLI 复用。

```ts
import { createTailwindV4Engine, resolveTailwindV4Source } from '@weapp-tailwindcss/engine'

const source = await resolveTailwindV4Source({
  projectRoot: process.cwd(),
  css: '@import "tailwindcss";',
})
const engine = createTailwindV4Engine(source)
const result = await engine.generate({ candidates: ['flex', 'text-red-500'] })
console.log(result.css)
```

包根导出候选提取、位置报告、扫描工具和 v4 API；`@weapp-tailwindcss/engine/v4` 导出 v4 API。两者均支持 ESM、CJS 和 TypeScript。候选提取包括模板、JS 字符串、SFC 和 CSS `@apply`，保留源码位置及有效候选集合。

支持 `@source`、多 CSS 来源、design system、裸任意值、增量生成会话与缓存释放。只支持 Tailwind CSS 4；不提供 v3、多版本分发、自定义生成器或 HTML parser 兼容入口。小程序平台兼容转换由 `@weapp-tailwindcss/postcss` 完成。

`createTailwindGenerationSession(source, options)` 和 `createTailwindV4Engine(source, options)` 可接收可选的 `prepareSource(source, designSystem)` 回调。回调接收当前扫描模式的实际 CSS，返回准备后的 CSS，并与候选校验共享 design system。该步骤仅用于生成规则排序或非语义标记清理，不得修改主题、utility、variant、配置、插件、导入或来源指令。会话保留来源元数据，失效后重新准备；候选删除只重建编译器并复用已准备的 CSS。会话存活期间，回调及其闭包配置必须保持不变。

## 来源

源码及对应 v4、提取测试迁自 MIT 项目 [tailwindcss-mangle](https://github.com/sonofmagic/tailwindcss-mangle/tree/6bf58cebe073a06dfeac7ed44f55ecff50deb763/packages/engine)，对应 npm `@tailwindcss-mangle/engine@0.2.0` 的发布证明。保留原始 [MIT 许可证](./LICENSE)。本包独立维护，不在运行时依赖旧 engine 或本地 submodule。
