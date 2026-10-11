---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1159
baseline: e8da4351f9580910945e2a2e66a375f7a87e8e0d
regressions:
  - packages/weapp-tailwindcss/test/tailwindcss/v4-import-paths.test.ts
  - packages/weapp-tailwindcss/test/bundlers/css-imports.test.ts
  - packages/weapp-tailwindcss/test/bundlers/runtime-classset-loader.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-css-output-imports.test.ts
  - packages/weapp-style-injector/test/index.test.ts
  - scripts/ci/demo-matrix/matrix.test.mjs
  - packages/weapp-tailwindcss/test/bundlers/vite-plugin.template-delete-watch.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-serve-mini-target.integration.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/source-scan-path-identity.test.ts
  - scripts/ci/demo-matrix/browser.test.mjs
  - packages/weapp-tailwindcss/test/bundlers/webpack-discarded-css.integration.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-watch-output.test.ts
  - scripts/ci/demo-matrix/output.test.mjs
  - scripts/ci/demo-matrix/watch.test.mjs
  - packages/weapp-tailwindcss/test/bundlers/webpack-watch-dependencies.test.ts
  - scripts/ci/demo-matrix/source-file.test.mjs
  - packages/postcss/test/css-rule-matcher.test.ts
  - packages/weapp-tailwindcss/test/bundlers/framework-css-composition.test.ts
  - scripts/ci/demo-matrix/rollup-watch.test.mjs
---

# Windows 标准 utility 缺失与 demo 跨系统验收

## 症状

用户在 Windows、weapp-tailwindcss 5.5.0/5.5.1 默认配置下发现标准 utility 与 `--spacing` 消失，任意值和透明色仍存在。恢复相同模板、pnpm 11.25.0 与冻结锁文件仍复现。扩展其他 demo 后，又观察到百度小程序样式重放失败、独立生成样式未被入口引用、Web CSS 加载与更新失败，以及 RN CLI 返回成功但只有空模块的 bundle。

## 根因与纠正

最初缺陷在 weapp-tailwindcss 本地 v4 engine：CSS import 序列化转义了 Windows 反斜杠，扫描器在未解码 CSS 字符串时判断入口，关闭默认扫描。Webpack 特殊候选补充解释了任意值和透明色为何仍生成。修复使用 CSS tokenizer，并只在写 CSS 的边界转换路径。没有证据表明该缺陷属于上游 tailwindcss-mangle/engine，因此没有为此创建上游修复 PR。

扩展验收将源码候选、CSS 与 JS loader 输出、模块来源、bundle 文件身份和页面消费逐层关联。Webpack 不再把 css-loader 或 extraction 生成的 JS 注册为 CSS；Rspack 保留静态 loader 的生成选项；Vite 根据产物身份保留框架重命名和重放关系，并从入口 chunk 的 modules 关联独立样式，检测重复引用和循环；uni 样式注入缓存按构建轮次刷新。

RN 的“非空 bundle”判断不充分，9 KB 的 Metro 启动代码也会通过。默认 Metro 配置覆盖 Taro transformer 后，入口占位文件没有生成应用。修正合并顺序后还发现空 blockList 被 Metro 编译为匹配所有文件的正则，共享空入口的转换缓存还会跨 demo 复用其他项目的页面清单。修复配置顺序、空过滤器与项目缓存身份，并按现有 catalog 补齐分包 RN demo 缺失的运行时依赖后，验收要求实际应用注册和原生页面探针进入同一 bundle。此前仅凭非空产物得到的 RN 成功结论作废，不作为交付证据。

样式注入 Taro demo 的子包路由修正为实际文件位置，补齐 Web HTML 启动模板。没有用手写 spacing、safelist 或官方 Tailwind 插件掩盖生成问题。

扩展 CI 暴露了 main 中删除模板测试的假通过：重建将 `app.css` 的旧规则移到 `app.wxss`，原测试仅检查前者。保留真实产物后缀后，测试揭示 watch 首轮结束过早释放源码归属、源码键与产物键混用，以及符号链接目录下文件删除前后的 realpath 身份变化。现在产物候选同时保存输出键和源码归属，显式删除只清除对应产物；watch 关系存活到 watcher 关闭；不存在的路径沿现存父目录解析。运行时集合也在移除旧候选前剔除上轮来源，避免把删除的候选重新当作基线。回归同时检查全部样式产物与模板实际类名，覆盖默认扫描和显式 source、axml 和 qxml。

Generic Vite 的小程序目标在 serve 时没有 generateBundle 收尾，不能推迟 CSS 适配；新增任意值的 JS 也必须使用当前模块经生成器验证的集合。真实服务回归确认首编译和新增后的 CSS/JS 一致，并保留业务字符串不被转译的断言。quickapp 的 qxml 补入模板、扫描和候选识别。SSR 探针等待首屏依赖请求结束后才修改源码，避免依赖预构建尚未完成时就把传输连接成功当作可更新状态。

浏览器启动验收把导航和探针等待放在同一重试循环，会每隔五秒重启尚未完成初始化的页面；带 hash 的重复导航还可能返回空响应。现在成功导航后只轮询探针与网络就绪，用延迟六秒初始化的真实 Vite 页面验证不会再次导航。失败时同时保存 DOM、浏览器事件和截图，后续 Windows 运行继续验证这一改动对实际 Taro demo 的效果。

Linux 干净安装发现上游 UTS 原生包将 libc 标记为 `gnu`，pnpm 11 按 `glibc` 筛选而跳过该可选依赖。仓库 pnpm readPackage 钩子仅纠正此包的错误元数据，锁文件记录 glibc 与钩子校验值，不改变包版本或完整性。uni-app x 的诊断包同时加入 CI 构建入口，避免本机已有 dist 掩盖干净构建缺失。Windows 的 Taro Harmony hybrid 基线发现 demo 的 designWidth 路径正则只匹配双反斜杠，导致同一页面使用不同设计尺寸；改用 path API 比较目录身份。

Release Gate 的 Docusaurus SSR 构建还暴露了无 PostCSS loader 的 SCSS 链路：生成 loader 被放到 Sass 编译之前，CSS parser 遇到 `//` 注释报错。插入位置现在优先使用 PostCSS/css-loader 的 CSS 消费边界，否则使用 Sass/Less/Stylus 的输出边界。真实 Webpack 回归必须加载已构建插件，因为直接导入源码时相邻 loader 产物不存在，可能未注入 loader 而假通过。回归同时覆盖 CSS 正常输出与 SSR 丢弃输出，修复前已复现同一解析错误，修复后 170 项 Webpack 回归及 Docusaurus 英文生产构建通过。

## 验证

扩展矩阵提交 `59e552e01` 的 Windows 分包 Taro H5 在初始样式通过后停于替换轮次，浏览器报 HMR `apply() is only allowed in ready status (state: prepare)`，日志持续重复编译。只读匹配实验发现输出目录忽略规则存在另一处边界错误：Watchpack 将待检查的 Windows 路径转为正斜杠，但插件把原始反斜杠路径传作 glob，因此输出文件匹配结果为 false；POSIX 路径含 `[]` 也被误解释。真实 Watchpack 回归在修复前有五项失败，修复后按字面目录包含关系排除产物，同时保留用户忽略规则、盘符大小写和 UNC 语义。此问题与最初 CSS import 缺陷不同，均属于本仓库路径边界。最终 Windows H5 连续更新证据仍须由后续提交验收确认，不能仅凭本地匹配测试宣布修复成功。

原始修复提交 `de58576bada6a50976883c173fec61c0a21dd911` 的 [Windows Node 22/24 与 Ubuntu 专项](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34023069668) 已通过；Windows 先复现发布版 5.5.1 缺失，再验证修复包恢复全部规则。该运行不代表扩展矩阵通过。

扩展前同步 main `4f914160e40df93900469f91a0c5ab1235c22b8d`，保留用户工作区。本地执行 `pnpm build:ci`，Vite/Rspack/loader/import 定向回归 279 项通过，样式注入 89 项通过。全部目标使用 [统一运行器](../../../scripts/ci/demo-matrix/README.md) 生成生产语义基线并验收正常 dev、替换、新增、删除、Web 刷新；原生与 WebView 按声明边界验收。当前文档保持 partial，待本次提交的三系统 CI 证据完成后更新。

扩展 CI 失败后的定向复验：六个 Vite/plugin/source 套件 255 项通过，源码候选 32 项通过，默认/显式扫描与 axml/qxml 删除模板 4 项通过，矩阵及真实浏览器等待 9 项通过。`pnpm build:ci`、`pnpm lint`、`pnpm agents:check` 和冻结安装通过。Taro React 两种构建器的对应基线已限定项目重新生成，无语义差异；随后正常模式复验微信、Harmony hybrid、React/Vue Vite 小程序与分包 Taro H5 全部通过，没有使用更新参数。

core smoke 的旧样式注入断言已按当前源码同步：检查 SCSS/Less 的实际颜色与 Taro 的页面路由，Mpx/uni 和 Taro 相关目标分别定向复验通过。Vite 增量单测的空 CSS mock 改为有效声明，避免正常 CSS 优化删除空规则导致假失败，29 项回归通过。

## 适用边界

提交 `7a6f922e5` 的 Windows 分包 Taro H5 完整轮次通过，但后续 `4e2ae96ab` 再次出现替换后重复编译，不能据一次通过认定 HMR 问题解决。Watchpack 字面路径错误有独立失败回归，仍保留该修复；新增 watchRun 依赖变更诊断与 Windows 连续三轮定向工作流，继续定位剩余触发源。该定向流程只用于诊断，不能替代全量 PR Gate。

`7a6f922e5` 的 macOS issue-1144 uni-app x 生产基线只有一个差异：探针规则均为相同内联值，但 CSS 额外保留了未引用的 `--spacing: .25rem`。原比较器收集全部主题变量，将与探针无关的声明当成语义差异。修正后只在探针引用 `var(--spacing)` 时记录并强制要求定义；内联规则继续逐项检查存在性、属性值和间距倍数。回归先复现旧比较器误报，再同时证明缺失变量、缺失 utility 和错误内联倍数仍失败。完整产物保留原始声明，语义基线不再依赖优化器是否清理未使用的主题元数据。

28 个 demo 登记 107 个 CLI 组合。Node 24 全量覆盖 Windows/macOS/Linux，Node 22 覆盖关键集成。保持 RN/native disabled 边界；构建证据不能替代设备、原生桥接和 HBuilderX IDE。uni-app-x-vapor 没有可移植 CLI，仅列出限制，不伪造通过。

## 规则评估

Windows 定向日志进一步确认，每轮循环的变更文件都是 Taro 虚拟入口 `app.boot.js`。监听注册层用 Node 磁盘 `statSync` 判断依赖是否存在，虚拟模块只存在于 Webpack 输入文件系统，被误标为 missing dependency。修复改用 loader 的 `fs.stat`，并等待异步注册完成后结束 loader。真实 webpack-virtual-modules 回归证实错误分类，但 `4a13f660f` 的三轮 Windows 专项在第二轮仍失败，第一轮通过时也持续空转编译；此前把分类错误直接认定为循环根因的结论不成立。

继续沿 watcher 事件定位，发现矩阵运行器强加 `WATCHPACK_POLLING=50`。Watchpack 的目录轮询持续更新扫描完成时间，虚拟文件在磁盘上始终不存在；只要编译耗时跨过轮询间隔，下一次挂载就再次发出 `watch (missing on attach)`，循环重建。没有 weapp-tailwindcss 插件的真实 Webpack + Taro 所用 webpack-virtual-modules 最小场景即可复现：100ms 编译配合 50ms 轮询，8 秒产生 36 次构建；默认 watcher 首轮处理一次缺失通知后稳定。矩阵回归在修复前因空闲期间 6 次重建失败。运行器移除强制 Watchpack/Chokidar polling，验收 demo 默认开发配置；回归还验证真正修改虚拟模块会触发重建并再次稳定。Windows 专项保留事件来源和 watcher 身份日志，连续三轮验收与完整 Gate 仍须通过，不用单次页面成功替代稳定性证据。

不新增 AGENTS 规则。现有路径边界、构建图、真实消费和连续更新要求已覆盖本问题，新增可执行门禁保证清单完整、阶段执行与提交身份，防止日志退出码或旧产物再次形成错误结论。

默认 watcher 的补充验收发现 Mpx 在样式检查通过后开始下一轮清理，归档复制 `project.config.json` 时出现 ENOENT。现在非 Web 每轮先重新复制产物，再对副本验收实际类名、当前标识和样式引用图，复制或语义未就绪时保持原有有界等待；最终报告与归档来自同一副本，避免实时目录变化造成错配。Windows 的浏览器等待回归还触发 libuv 文件监听路径断言，临时 Vite 根目录改为 realpath 后，同一 Windows 套件 13 项全部通过。专项 checkout 显式使用 PR head，使报告与最终提交身份一致。

`028c6530d` 的 Linux Taro Vite Vue 支付宝在 restore 阶段读取到被异步 writeFile 截断、尚未写完的 Vue 文件，报错“至少需要 template 或 script”。矩阵源码更新改为同目录临时文件写完后原子替换，保留权限；真实目录 watcher 连续观察五个大文件版本，只允许完整内容。原子替换后，本地 Taro Vue Webpack 微信、Vite 支付宝、React Vite/webpack 微信和 Gulp 完整阶段通过。该提交的 Windows Vue 恢复阶段也失败，但没有同样的解析报错，不能直接归为同一原因；Windows 连续专项增加该目标和每轮时间戳，继续验收。

同一提交的 macOS 分包 H5 已渲染初始探针并收到开发通道握手，却持续等待全页面 networkidle。截图保留了 Webpack 上游依赖警告遮罩；全页面网络静默不能作为应用启动完成的必要条件。浏览器改为等待探针、本地 script/stylesheet 请求完成和开发通道握手，随后仍逐轮检查真实 CSS 与计算样式。真实 Vite 回归同时保留一个持续后台请求和一个延迟脚本，要求前者不阻塞、后者必须加载完毕。本地分包 H5 与 uni SSR 全部阶段复验通过，未更新基线。

性能门禁连续报告 Vite HMR 回退，不能当作单次计时噪声忽略。分阶段计时发现 CSS 清理对同一份主样式逐个比较候选时重复规范化和解析。改为在单次清理内复用不可变主样式的惰性索引；候选 AST 中规则文本已不存在时，直接排除不可能的结构键匹配。无全局缓存，不跨 HMR 保留旧内容。回归覆盖大样式批量比较、条件规则、important、变量回退及不同版本隔离。相同本机和参数的两轮采样中，稳态清理从 371–388ms 降至 192–220ms，插件 HMR 从 1670–1774ms 降至 1409–1531ms；这是本地优化前后证据，不替代远端 main 对照门禁。

`382614d56` 的两组 Windows 专项各完成三次全流程，[运行记录](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34053170103)均成功。但同一提交的完整矩阵仍失败，性能门禁也报告 Taro Vite 回退。只复用比较索引不足以解决根因：重新展开的 NutUI CSS 仍是 px，框架 bundle 中的同源 CSS 已转换成 rpx，生成阶段比较后将其当成缺失样式再次追加，约 299 KB 主样式膨胀到 507 KB。

修正内部输入契约，将原始用户样式和框架已处理的 bundle CSS 分开传递；生成样式完成框架重放后，再将 bundle 样式完成小程序清理并合并。避免重复执行框架插件，保持源顺序，同时清理经过选择器转换后才可识别的旧主题块。最小真实生成回归在 legacy/graph 两条管线均复现重复的 16rpx 声明；修复后只保留一次，并保留后续 32rpx 覆盖、未参与原始生成的用户规则、原始样式的框架转换和单次插件执行语义。本地 Taro React 微信、Vue 京东全流程通过原语义基线，未通过修改基线接受错误主题值。

同一提交的 Vite H5 在预构建触发整页重载后保留了旧 document 的待加载请求，探针已渲染仍永远等不到请求集合清空。请求和传输状态现在随主 document 重置，旧 WebSocket 消息不参与新页面的就绪判断；真实 Vite 回归覆盖旧请求挂起、页面重载和新页面延迟脚本。Windows Vue H5 还记录到本地模块请求 ERR_NO_BUFFER_SPACE，启动检查先等待 HTTP 服务可用，并仅对明确的瞬时模块传输错误进行一次带日志的重载；重复失败仍失败，正常慢初始化不重载。

Windows Vue 京东的 add 轮次已输出新增类名，但 Vite 在写出 app-origin.jxss 时出现 EBUSY，验收程序同时在复制正在写入的目录。分包 Webpack 抖音也在新一轮 sealing 阶段停滞。Taro 的非 Web 验收现在等待本轮构建完成、恢复监听后，再归档和检查；旧轮次完成日志、正在构建和失败日志都不能放行。新增三项 Windows 三次连续专项验收 Vue H5、京东与分包抖音，完整矩阵和性能门禁仍须由最终提交完成，以上本地结果不代表全量 CI 已通过。

同一轮 Linux uni 在替换完成后未对 add 产生新的编译日志。增加 uni 编译完成与首轮 watcher ready 检查，并在三次连续专项中加入 Ubuntu。真实 Rollup 文件 watcher 连续替换回归在本机通过，因此暂不将 Linux 失联归因于原子替换；该回归和真实 uni 的 Linux 结果仍需远端确认。最后一次本地 main 对照的临时副本缺失 Taro CLI 文件，基线行失败，该次计时不作为性能通过证据。

`f79e6d8a2` 的 Ubuntu uni 专项仍在第二次修改后不再编译。Linux 容器中的真实 Rollup 4.63.0 对照明确缩小了条件：单纯文件监听能连续更新，但文件同时被普通模块和虚拟模块的 transform dependency 引用时，第二次原子替换不再触发构建，且无需加载 weapp-tailwindcss。旧测试只覆盖单一 watcher，本机模拟 os.platform 也不能替代 Linux inode 事件。Rollup 的 FileWatcher 为两种依赖创建独立 Chokidar watcher，底层共享句柄仍指向被替换的 inode。依赖补丁让同一构建任务共用 watcher，同时按依赖集合保持 transform cache 失效；CJS/ESM 真实回归在未修复版本均因第二次修改超时失败，补丁后直接导入、虚拟模块更新及删除重建全部通过。该补丁属于仓库构建依赖，不属于最初 Windows utility 缺陷，也不随本库 npm 包自动应用。

同一提交的 Windows Vue Vite H5 和分包 Webpack H5 已收到连接握手，却仍被判断为传输未就绪。Playwright 的 framenavigated 也包含 hash/history 路由跳转，旧实现因此清空仍在使用的文档连接。真实 Vite 页面先握手再切换两种路由，在修复前稳定超时；改为只在新主文档响应时重置后通过，已有整页重载回归继续通过。两个真实 H5 demo 的生产、连续修改和刷新本地复验通过原基线。

`f79e6d8a2` 的五类性能门禁最终通过；Taro Webpack 首次构建峰值曾单独越界 16.89%，同次稳态内存、HMR 内存和处理时长没有同步回退，同提交复测通过。保留首次失败，不将一次峰值差异归因为已证实的产品回归。后续新增依赖补丁和浏览器修复仍须使用新提交重新验收完整三系统矩阵。

补丁后真实 uni 微信在 Linux 容器中完成生产、开发首编译、replace、add、restore，均通过原语义基线。容器复用相同版本的 JavaScript 依赖并补齐 Linux 原生模块，只作为本地定位证据，不冒充冻结安装成功；最初容器全量冻结安装因网络失败，最终干净安装仍交由 Ubuntu/Windows/macOS CI 验收。Rollup 补充目录型 transform dependency 回归，要求子文件变化正确使目录消费方失效，避免合并 watcher 改变原有语义。

`194915f27` 的 Ubuntu 连续专项完成冻结安装、26 项回归以及三次真实 uni 全流程。Windows 新增目录依赖测试读取到上一轮值或空模块：目录事件可排队触发多次构建，构建计数增加后立即读取可能撞上下一轮写入。回归改为有界等待本轮直接值与派生值同时正确，每次使用新模块 URL 避免缓存半成品；仍保留编译计数与超时要求，原版失联不能因此通过。

`66a36ae11` 的四项 Rollup 回归已在 Windows 通过，六组连续专项中的五组完成三次全流程。剩余分包 H5 在启动浏览器回归时超过五秒总预算，尚未进入 demo 构建；该期限从浏览器冷启动前开始计算，不代表路由语义失败。测试预算调整为二十秒并保留三十秒外层期限、路由切换及连接握手断言，继续以最终提交的完整 CI 验收。

`ab5e1283f` 的 159 个 demo job 和性能门禁全部成功，但最终报告 gate 比较 SHA 失败，连带阻断 PR Gate。GitHub API 确认 `dbfc7dc` 是该 head 的临时合并提交，并非排队导致的旧 head；先前“事件 head 变化”的判断不成立。GitHub 保留变量 `GITHUB_SHA` 不能通过 step env 覆盖，日志虽显示声明的 head，Node 进程仍读取合并 SHA。checkout 继续使用 PR head，gate 改用独立 `DEMO_MATRIX_SHA` 严格核对报告。真实 CLI 回归在不同 merge/head 环境下检查完整报告成功、错提交失败及缺少验收 SHA 失败，不通过接受任意报告身份绕过门禁。

`15da14fea` 的 Windows Gulp 抖音首次修改没有收到事件；同提交独立复验在 add 阶段再次失败，这次日志明确记录归档期间 Gulp 打开输出模板遭遇 EBUSY，不能归为偶发计时或只凭重跑通过关闭。运行器仅在首轮产物验收后等待 watcher ready，后续轮次没有等待 Gulp 完成所有模板与样式 stream，可能在写出其他页面时就开始复制整个目录。现在和 Taro/uni 一样，首轮先等监听就绪，后续先等本轮 build complete，再归档、验收和修改源码；旧完成日志、尚未完成的变更、失败日志均不能放行。增加失败日志回归与 Windows Gulp 三次连续专项。首次无事件现象未能独立复现，不将 EBUSY 直接当成其已证实根因，最终仍需真实 Windows 连续验收确认。

`204d89649` 的 Windows Gulp 抖音连续三次完整通过。另一台 Windows runner 在 demo 执行前，被新增 CLI 回归的默认五秒期限中断：该测试写入 159 份报告并启动三个 Node 进程校验正确、错误和缺少 SHA，不属于纯内存单测。为其显式设置三十秒期限，保留完整文件与进程边界、全部失败断言；不改变 demo 编译期限或语义验收。
