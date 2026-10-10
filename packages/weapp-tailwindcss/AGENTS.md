# Package Guidelines (`packages/weapp-tailwindcss`)

## 适用范围

- 本文件仅适用于 `packages/weapp-tailwindcss`。
- 本文件补充根规则；发现冲突时按根规则的冲突处理流程执行，不削弱上级安全边界。

## 包定位与目录

- 该包是核心转译与多构建器适配入口，涵盖 `vite/webpack/gulp`、`wxml`、`js`、`postcss` 协作链路。
- 关键目录：
  - `src/bundlers/`：各构建工具集成层。
  - `src/wxml/`：模板类名处理链路。
  - `src/js/`：JS AST 与模块图相关转译。
  - `src/context/`：上下文、缓存与配置汇总。
  - `src/project-sources/`：与构建器无关的入口发现、配置来源、扫描缓存与候选状态。
  - `src/generation/`：来源准备、生成会话协调、revision 与 CSS 结果组装；旧构建器内部路径仅保留兼容重导出。
  - `test/`：单测、集成、回归、性能相关用例。

## 样式处理边界

- 已提取的框架无关 layer 内核由 `@weapp-tailwindcss/css-compat` 拥有；除 `packages/engine` 的 Tailwind CSS 4 生成专用处理外，其余 CSS 语法解析、tokenize、selector/value parser、AST 变换和 PostCSS 管线由 `@weapp-tailwindcss/postcss` 拥有。
- 本包只消费 `@weapp-tailwindcss/postcss` 的导出；禁止直接依赖 `postcss-scss`、`@csstools/css-tokenizer`、`postcss-selector-parser`、`postcss-value-parser`、`lightningcss` 或 `postcss`。
- 允许通过 `@weapp-tailwindcss/postcss` 的 `postcss` re-export 做编排级 `parse` + walk（读 `@import`、组装 artifact、决定注入位置）。
- 禁止在本包新增 CSS parser/tokenizer 或 compat 变换实现；新增变换由相应 CSS 所有者实现，经 PostCSS facade 从本包调用。
- `builtin:lightningcss-loader` 只是 Rspack loader 名称匹配，不构成引入 `lightningcss` 依赖的理由。

## JS 转译硬性规则

- JS 相关转译必须遵循 `classNameSet` 精确命中原则：仅转译来自 Tailwind 生成引擎与运行时刷新链路确认的类名集合。
- 禁止在 JS 转译链路中对普通字符串执行启发式兜底转译（例如基于 token 形态猜测 class）。
- 若需降低误伤风险，优先改进类名集合获取与刷新时机，不通过放宽候选匹配规则实现。

## 开发与变更要求

- 核心不得通过值引用、类型引用或聚合导出反向引用构建器实现；改动依赖关系后执行仓库根的 architecture:check 脚本。
- 路径身份、glob 与来源匹配复用 `@weapp-tailwindcss/source-scan`；扫描入口复用测试辅助层的共享契约。

- 修改 `src/js/**`、`src/wxml/**`、`src/context/**` 时，必须补对应回归测试。
- 涉及 bundler 行为差异时，优先在 `test/bundlers/**` 增加最小复现用例。
- 不要在单个 handler 内同时引入解析、匹配、替换三类职责；优先拆分为可测试小模块。
- Vite/Webpack/Gulp 等插件链路禁止通过 `fs` 直接写入或改写输出目录；需要新增或改写产物时，必须使用 bundler 提供的 bundle asset、`emitFile`、loader result、Vinyl file/stream 等插件 API。
- `src/bundlers/**` 中还原源码、样式来源或输出文件关系时，禁止硬编码 `path.join(rootDir, 'src')`、`src/`、`pages/` 等项目目录假设；必须优先使用 Vite/Rollup 的 `facadeModuleId`、`moduleIds`、`modules`、`this.getModuleInfo`，Webpack 的 compilation/module graph，或 Gulp/Vinyl 的 `cwd`、`base`、`path` 等 bundler 上下文。
- 不得在 `generateBundle`、`closeBundle` 等后置阶段新增临时 `readFile` 兜底来补缺失的源码状态；需要源码内容时，应在 `load`、`transform`、`watchChange`、`handleHotUpdate`、loader 执行阶段或 source-candidates 扫描层建立缓存。
- 若确实必须从文件系统读取源码用于入口发现或候选扫描，读取逻辑必须集中在专门扫描层，说明为什么无法从 bundler 上下文取得，并补 `test/bundlers/**` 回归测试。
- 多小程序样式输出不能把微信作为默认特例：禁止在 bundler 适配层硬编码 `.wxss` 兜底，也禁止维护平台名到样式后缀的映射表；样式后缀必须优先来自当前 bundle/loader/Vinyl 产物的真实文件名或框架已经给出的输出文件关系，推断不到时保持通用 `.css`。
- 不要用 `app`、`main`、`app-origin` 等文件名作为 Tailwind 入口或主样式的硬编码语义特例；需要判断主样式时必须走构建图、用户 matcher 或已有产物关系，并用非微信小程序后缀回归测试覆盖。
- 样式注入、preflight 保留/注入、Tailwind 入口选择、分包样式隔离等行为禁止依赖硬编码文件名或输出路径片段（例如固定判断 `app.wxss`、`index.wxss`、`sub-normal/pages/index.wxss`、`sub-independent/pages/index.wxss`）。这类语义必须来自 CSS 内容（如 `@import`/`@config`/`@source`）、用户显式配置、loader/transform 阶段缓存的源码关系、bundler 模块图或已注册的 source-candidates 元数据，并补不依赖固定文件名的回归测试。

## 推荐验证命令

- `pnpm --filter weapp-tailwindcss test`
- `pnpm --filter weapp-tailwindcss test:dev`
- 针对单文件回归：`pnpm --filter weapp-tailwindcss exec vitest run test/js/<case>.test.ts`
- 架构边界：`pnpm --filter weapp-tailwindcss exec vitest run test/ci/architecture-contract.test.ts`

## 提交前检查

- 至少运行与改动面对应的子集测试（JS/WXML/Bundlers）。
- 若输出快照或 fixtures 变化，提交中需包含变更原因说明。
