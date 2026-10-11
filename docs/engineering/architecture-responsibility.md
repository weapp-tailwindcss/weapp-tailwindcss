# 架构职责与依赖契约

## 层级

| 所有者 | 职责 | 不应承担 |
| --- | --- | --- |
| env | 框架、环境、HBuilderX 与平台事实识别 | 构建器选择、生成器 target、样式策略、Vite package boundary |
| source-scan | 路径身份、glob、匹配排除、来源分组、扫描策略 | CSS 解析、文件枚举、Tailwind 生成、构建器接入 |
| engine | Oxide 文件枚举、候选提取与验证、Tailwind 编译会话、依赖失效与释放 | 平台 CSS 兼容、主包或构建器实现 |
| tailwindcss-config | 配置搜索、模块加载与最新配置读取 | 扫描策略、生成或产物提交 |
| postcss/syntax | CSS/SCSS 语法、来源指令解析 | 插件生命周期 |
| postcss/transform | CSS AST、平台兼容与纯转换能力 | 构建器生命周期 |
| postcss/plugin | PostCSS 适配编排、依赖消息、生成会话释放 | 单独维护路径或 glob 算法 |
| 主包 project-sources、compiler、core、generator、generation | 入口发现、扫描缓存、候选集合、revision、失效、生成与平台转换协作 | bundler 类型、模块图猜测、输出目录写入 |
| bundlers | 模块图投影、构建事件、bundle/loader/stream 产物提交 | 核心会话与扫描基础算法 |
| CLI | 参数、输入输出、watch、优化、source map | 预编译一次以重复获取扫描范围 |

依赖方向为适配器到核心，再到基础包。主包的 generation 拥有通用生成编排，project-sources/candidates 拥有候选集合与扫描缓存；旧 bundlers/shared 的对应路径只保留兼容重导出。PostCSS 根导出继续兼容，内部消费者改用独立子路径。weapp-style-injector/types 提供与适配实现解耦的类型入口。

## 客户端与状态生命周期

客户端值依赖检查覆盖 runtime、cn、merge（含 slim/lite）、cva、variants、theme-transition 根入口、UI 的 variants/components/utils/hooks/adapters 和主包 escape。类型引用不视为运行时加载；typography、theme-transition/tailwindcss 和 UI preset 是构建时入口，UI 根入口是 CSS。包名、公开子路径和发布形式保持兼容。

Vite 的来源发现、候选刷新、CSS 资产和生成队列各自持有状态，组装层只连接依赖与生命周期。普通构建结束和 watcher 关闭时先排空生成任务，再释放来源与资产；watch 中间轮次不清空。跨实例共享的解析缓存保持有界：design system/模块 64、CSS 入口 128、PostCSS 选项 256、管线/处理器各 64。无 watcher 的程序化入口继续校验依赖内容，不以容量优化取消失效检查。

## 扫描语义

共享描述是 base、pattern、negated。默认扩展名包含 qxml，绝对 glob 拆成静态根和相对模式，Windows 盘符、UNC 与反斜杠在共享边界处理。

扫描策略区分自动来源、显式来源、source(none) 和纯排除列表。禁用自动来源不删除显式来源；各公开 matcher 保留原有“空列表”和“纯排除列表”的不同约定。需要比较的请求必须具有相同策略，不能仅因为输入数组相同就假定请求等价。

PostCSS 的 describeCssSources 从 AST 提取来源，resolveCssScanSources 通过配置包读取 content，并调用 source-scan 的统一计划。主包兼容扫描使用 fallback（没有正向来源才扫描默认根），PostCSS 兼容自动扫描使用 auto，局部收集使用 disabled；这些选择在入口显式传入。配置组保留独立排除语义，CSS 注释中的 source(none) 不作为指令。默认忽略规则由 source-scan 的策略数据维护。

CLI 使用 scanMode: compiled，在生成会话内复用 Tailwind 已编译的来源信息，并排除输出文件。默认主包扫描保留原调用语义；配置 content 通过配置包加载。编译会话负责移除候选后重建、模块缓存失效和资源释放，PostCSS 在成功及失败路径均释放会话。

## 自动检查

`pnpm architecture:check` 遍历 packages 与 packages-runtime 的生产源码和声明。TypeScript AST 提取 import、re-export、import type、require 和可静态求值的动态 import，模块解析支持 tsconfig paths、扩展名和 workspace 发布入口。值循环忽略纯类型边；层级检查包含类型和聚合导出的可达关系。未解析本地或 workspace 引用会报错。

包级图包含 dependencies、optionalDependencies、peerDependencies 以及源码中的跨包值引用。检查器报告完整违规链，没有既有循环豁免。PR 工作流运行该检查和检查器回归；仓库管理员仍需在 GitHub 分支保护中将 Architecture Contract 设为 required。

共享测试位于 packages/test-helper/src 的 source-scan-contract.ts、source-files-contract.ts 与 source-generation-contract.ts。engine、主包、PostCSS、CLI、Vite 扫描适配器复用这些契约，覆盖路径、qxml、显式来源、配置变更、符号链接及文件增删重建。Webpack、Rspack、Gulp 另通过真实 compiler、CSS loader 和 Vinyl 流消费相同生成契约；同一案例保留实例并验证增量更新，结束后释放实例。发布契约另检查 ESM/CJS 入口和产物依赖声明。

generation-ownership 回归保证旧生成与候选目录仅含重导出，避免通用实现重新流回构建器层。构建器负责把源码与目录变化传入核心，Webpack/Rspack 注册扫描目录及配置依赖，Gulp 的 watchChange 同时失效扫描缓存与运行时候选集合。

检查器同时阻止 env、source-scan、engine 向上层包的类型或值引用，并拒绝通过生产源码范围之外的本地模块绕过检查。动态路径常量按词法作用域解析；运行时才能确定的模块请求不属于静态图。
