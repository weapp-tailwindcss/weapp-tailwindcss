---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: f9f0cd0aad68f3e0774790d15b87fc443c7ef4e8
regressions:
  - packages/postcss/test/loaded-plugin-contract.test.ts
  - packages/postcss/test/framework-pipeline.test.ts
  - packages/postcss/test/user-framework-plugin-boundary.test.ts
  - packages/postcss/test/handler-gradient-fallback.test.ts
  - packages/postcss/test/pipeline.test.ts
---

# 作者 PostCSS 配置与已加载插件的类型域

## 症状

原严格检查把 handler 的 `plugins.autoprefixer` 映射分支排为 never。原公开类型直接复用 postcss-load-config 的已加载 Result 数组，而实际作者配置归一化还接收映射值、模块字符串、嵌套 default、工厂 tuple、禁用标记、Processor 与旧 transformer。删除映射分支会改变现有配置语义，用强转也不能补上错误的接收契约。

## 根因与纠正

独立纯类型模块定义完整 LoadedPostcssOptions，保留 Result 中的处理选项，替换 plugins 的输入域；原 types 入口按原名导入并重新导出。映射的值是插件条目，键不是 postcss-load-config.Config 的“模块名到选项”约定，不能复用后者。handler 保留 autoprefixer 键的既有身份语义与字面量键访问，真实插件身份探测则在 unknown 边界检查对象或函数及实际名称。

默认模块只递归包裹各阶段实际支持的引用。tuple 仅在顶层识别，工厂可异步返回真实插件或插件默认模块；不声明工厂字符串、false 或默认模块内部 Promise 为合法结果。异构工厂用 never 参数保存引用，接受 string、具体选项对象和零参工厂的方差；它不是可直接调用的通用工厂接口，实际执行仍由既有 unknown 归一化边界处理。私有工厂 options 保留 unknown，没有把整个 plugins 放宽成 unknown 或引入 any、断言来跳过检查。

## 验证

- 首次测试的追加型 Declaration visitor 不幂等，测试未收敛；中断本任务的明确进程并核无剩余 vitest，再改为一次性 Once 批处理。中断日志保留，不能将其记为产品失败。
- 原类型域在新真实编译夹具上报告12条错误。模块/工厂运行控制原本可通过；初次 false 前缀器控制错误地观察小程序最终过滤后的 CSS，改为检查实际 pipeline 中默认前缀器节点，保留原失败日志。
- 初次夹具消费 dist 声明虽通过，但新增了包测试的隐含构建依赖，且 lint 明确禁止从 dist 导入；改为消费同一公开类型的独立源码定义，不在测试内构建产物或使用放宽的 compilerHost。此前生成声明的验证记录仍保留。
- 严格夹具开启 strict、exactOptionalPropertyTypes、noCheck:false、noEmit，正例覆盖数组/映射/具体参数/零参/异步/default/Processor/旧函数，负例通过 expect-error 固定非法引用与非法工厂结果。相同定义由原公开 types 入口重新导出，不复刻简化的假接口。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/loaded-plugin-contract.test.ts test/framework-pipeline.test.ts test/user-framework-plugin-boundary.test.ts test/handler-gradient-fallback.test.ts test/pipeline.test.ts --update=none --coverage.enabled=false`：五文件41项通过；原归一化算法及正常测试快照未改。
- 原 scripts 严格入口还保留其他错误，不将包内既有 noCheck 构建称为严格验收。

## 适用边界

本次修正已有输入域，不新增解析算法。同步 getPipeline/createStylePipeline 只接收已解析的原生插件引用；阶段迁移后返回 flat／phased 联合并通过 Promise 入口执行，字符串和 tuple 的异步归一化仍由 processUserCss 路径完成。同步组装没有变为异步配置加载器。此前将 Loaded.plugins 无条件当作数组使用的 TypeScript 调用方，应按真实联合域收窄或显式归一化。

## 规则评估

不新增 AGENTS 条目。保留现有数据流、补正公共接收契约和使用真实编译/运行回归已经覆盖本问题；不能因两个不同 API 都接受对象映射就认定它们的键和值语义相同。
