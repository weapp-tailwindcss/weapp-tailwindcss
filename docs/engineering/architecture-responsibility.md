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
| framework-policies | 将框架配置与环境事实解析为生成、平台、样式与 preflight 策略 | 构建器类型、生成会话或 CSS AST 转换 |
| bundlers 中的 frameworks | 框架插件顺序、来源识别、资源任务、loader 扩展与样式注入选择 | 复制候选扫描、生成、缓存或其他框架实现 |
| CLI | 参数、输入输出、watch、优化、source map | 预编译一次以重复获取扫描范围 |

依赖方向为适配器到核心，再到基础包。主包的 generation 拥有通用生成编排，project-sources/candidates 拥有候选集合与扫描缓存；旧 bundlers/shared 的对应路径只保留兼容重导出。PostCSS 根导出继续兼容，内部消费者改用独立子路径。weapp-style-injector/types 提供与适配实现解耦的类型入口。

## 框架隔离与兼容组装

公开入口继续统一发布，保持现有配置与导入路径。框架事实由 env 提供，兼容入口将这些事实与用户配置解析为 compiler 中的只读策略契约；生成核心消费已解析的策略。context、generator 配置归一化和 runtime branch 保留原调用方式，在明确的解析入口完成兼容。框架策略不持有编译会话，每次解析返回独立快照；公共 normalizer 的返回形状不扩张。

Vite 契约按来源、生成、样式组织和产物处理分组，静态选择用策略值表达。框架只取得只读配置、候选快照和绑定到会话的生成、转换、诊断操作，不能直接取得原始 handler、核心状态容器或其他所有者的 dispose。只读资产视图与受限的替换、生成、删除操作由适配层实现。某轮构建的后续收尾数据通过该轮闭包传递，不存到模块级变量。Webpack 保留独立的 loader/compiler 扩展契约，不与 Vite 合并成通用 hooks 系统。

Vite 框架维护静态插件描述，公开入口在 configResolved 时选择和创建活动实例。dispatcher 与内置 injector 共用逐插件代理，保留 hook 元数据、this、结果、sourcemap 和每轮 buildStart；实际插件与描述不一致时直接报错。配置前置行为不创建编译会话。

Vite 永久关闭先由明确登记的前置串行屏障排空钩子任务，各扩展随后沿宿主原有顺序与各自上下文清理，唯一协调者使用末尾串行钩子释放核心。协调者不能等待尚未被 Rollup 调度的终止钩子。初始化失败时，已收到钩子的扩展使用自身已捕获的宿主上下文；工厂已创建但尚未收到任何钩子的扩展以 `undefined` 上下文清理自有资源，不借用其他插件的 `this`，依赖缺失上下文的清理失败会明确报告插件名称并继续释放剩余资源。永久关闭后清空捕获上下文与扩展清理任务引用，重复关闭仍返回既有结果。同步工厂失败只抛出待收尾的内部错误载体，由配置初始化的唯一协调者等待回滚；框架服务的异步任务也由资源事务登记，先排空已接收任务，再释放扩展、图关系和核心。

内嵌 injector 代理没有第二个核心关闭协调者。父级在排空后通过私有弱引用登记的清理桥收束内层自有扩展，内层按组保留幂等完成结果；绑定失败的真实插件也必须可达，不能让缓存的初始化错误挡住释放入口。诊断边界物化原始错误的延迟栈，避免长期缓存的失败关闭结果继续保留宿主 `this`，不替换错误身份、cause 或聚合关系。

永久关闭同时解除真实 delegate、resolved config 和 handler 引用，宿主继续持有静态插件不能保留已结束的编译会话。独立 injector 的公开工厂继续遵循自身现有生命周期；主包的关闭保证来自父级代理所有权，不为独立工厂增加未声明的永久关闭语义。

样式注入的通用生命周期包装、类型和框架工厂分开。共享流程只能消费包装与类型，框架组装入口选择工厂。uni-app 与 uni-app-x 的相同协议可放入明确的家族共享模块；框架不能直接引用另一个框架的实现。旧内部路径保留的重导出也参与依赖闭包检查，不能作为共享代码的绕行入口。

支持组合保持现状：Vite 分派 generic、uni-app、uni-app-x、Taro 和 weapp-vite；Webpack 分派 generic、Mpx、Taro、uni-app 和 weapp-vite；Rspack 继续复用 Webpack，Gulp 继续使用 native。uni-app-vite 别名、Webpack 的 uniAppX 兼容映射和其他 appType 的既有 fallback 保持原语义；目录隔离不代表新增组合支持。

## 客户端与状态生命周期

客户端值依赖检查覆盖 runtime、cn、merge（含 slim/lite）、cva、variants、theme-transition 根入口、UI 的 variants/components/utils/hooks/adapters 和主包 escape。类型引用不视为运行时加载；typography、theme-transition/tailwindcss 和 UI preset 是构建时入口，UI 根入口是 CSS。包名、公开子路径和发布形式保持兼容。

Vite 的来源发现、候选刷新、CSS 资产和生成队列各自持有状态，组装层只连接依赖与生命周期。会话状态只能从 active 经 closing 到 closed，关闭后不能隐式重建。构建器只有一个关闭协调者：停止接收外部任务，等待已接收的完整任务（包括扫描、生成和产物提交），释放框架扩展及图关系，然后关闭核心。重复关闭返回同一完成结果；清理部分失败仍释放剩余资源并聚合错误。watch 的可恢复错误只结束本轮，永久关闭或致命初始化失败才完整释放。跨实例共享的解析缓存保持有界：design system/模块 64、CSS 入口 128、PostCSS 选项 256、管线/处理器各 64。无 watcher 的程序化入口继续校验依赖内容，不以容量优化取消失效检查。

配置相同不代表编译实例相同。每个 Core、构建器实例拥有独立 runtime、候选、revision、处理器与缓存；同一 watch 实例复用自己的会话，插件配置用于后续独立 build 时创建新会话。共享缓存只能保存无可变会话状态的准备结果，函数按身份参与缓存键，不能用函数源码代替闭包身份。实例捕获环境事实；兼容入口把用户选项解析为深复制、只读的 ResolvedCompilationProfile，不冻结用户对象。配置更新增加 revision，异步请求固定使用开始时的快照，旧版本不能覆盖新状态。

shadow 请求在 legacy 与 graph 都完成后、发布对照报告前重新检查配置版本；服务返回前统一检查，报告回调同步更新配置也不能使旧 CSS 进入后续产物提交。显式请求中的编译模式仍优先于 profile 默认值。

兼容配置中的显式外部 cache 保留调用者身份和所有权，适配器不能在关闭或局部修剪时清空整个外部缓存。可复用源配置只记录用户配置，不复制内部 context 的 handler、runtime 或实例自建缓存。Gulp 的完整活动从文件写入被接受时开始，受管 pipe 的同一 Vinyl 转发属于已接受任务；用户回调重入是新外部任务。具体关闭回归与证据范围见[关闭所有权记录](lessons/framework-shutdown-ownership.md)。

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

框架身份、别名、支持组合和模块归属集中在声明数据中，各构建器保留自己的类型化注册表。新增框架扩展登记数据与实现，不修改检查算法或共享构建流程；测试专用框架通过现有能力验证这一约束。主包与独立 style injector 的实现、子目录和聚合导出均需有唯一归属，未知或冲突归属直接失败。

框架边界复用同一 AST 依赖图，递归检查共享流程到具体框架、框架之间的引用，包含类型引用和聚合导出。同时检查共享文件中的框架名比较、switch 与列表匹配，阻止逻辑重新内联。核心输入检查追踪类型别名、命名空间导入和重导出，拒绝原始用户配置、环境解析入口及公共兼容 facade 重新进入核心内部。公开分派入口允许选择框架，但共享模块不能经该入口回到具体实现。兼容例外按具体依赖边登记原因与替代入口，并在报告中列出；不豁免整个文件，普通框架扩展也不能增加例外。

检查器回归见 `packages/weapp-tailwindcss/test/ci/framework-boundaries.test.ts` 与 `packages/weapp-tailwindcss/test/ci/framework-core-inputs.test.ts`，Architecture 工作流显式执行这两组回归；发布入口兼容回归见 `packages/weapp-tailwindcss/test/ci/framework-public-entries.test.ts`。

检查器同时阻止 env、source-scan、engine 向上层包的类型或值引用，并拒绝通过生产源码范围之外的本地模块绕过检查。动态路径常量按词法作用域解析；运行时才能确定的模块请求不属于静态图。
