---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1254
baseline: ad6e09cbc95bb6094d63ce2d616733cbf0e85cd0
regressions:
  - benchmark/performance/demo/test/evidence.test.mjs
  - benchmark/performance/demo/test/style-evidence.test.mjs
  - benchmark/performance/demo/test/process.test.mjs
  - benchmark/performance/demo/test/prepare-process.test.mjs
  - benchmark/performance/demo/test/prepare-environment.test.mjs
  - benchmark/performance/demo/test/css-values.test.mjs
  - benchmark/performance/demo/test/authored.test.mjs
  - benchmark/performance/demo/test/runtime-dependency.test.mjs
  - benchmark/performance/demo/test/install-consumers.test.mjs
  - benchmark/performance/demo/test/browser-state.test.mjs
  - benchmark/version-compare/test/pr-baseline.test.mjs
  - benchmark/performance/demo/test/watch-lifetime.test.mjs
  - benchmark/performance/demo/test/process-group.test.mjs
  - benchmark/performance/demo/test/precompile-script.test.mjs
  - benchmark/performance/demo/test/component-ready.test.mjs
  - benchmark/performance/demo/test/semantic-css.test.mjs
---

# 发布版性能对照的隔离与失败证据

## 症状

构建命令成功不代表静态组与接入组等价。首轮 React Vite Web 对照遇到计算颜色不同；SFC 处理曾把嵌套模板和构建缓存当成源码。云端长安装任务中断后，日志已包含多轮测量，但报告仍停留在零样本的初始状态。

## 根因与纠正

- 独立消费项目不能照搬 workspace peer 快照，否则无关框架的可选 peer 会进入安装成本。固定共有直接依赖后独立解析，保存每组完整锁文件；发布包必须在消费目录内真实解析，校验版本及 integrity。
- 静态 CSS 必须使用被测发布版的 Web 兼容转换；仅使用生成器 CSS 会遗漏接入链路的转换。修正后重新生成全部操作状态，再执行计时验证。
- SFC 使用真实解析器定位模板、脚本和样式边界。静态扫描排除捕获构建生成的缓存，不能将缓存重放到其他对照组。
- Gulp 的真实捕获构建发现 `.cost/module.cjs` 被识别为包名；相对导入必须使用 `./.cost/module.cjs`。补充 POSIX、Windows 盘符和跨根目录回归，不能仅按字符串是否以点号开头判断。
- SCSS 中的 `@reference`／`@apply` 需要先通过消费项目的 Sass，再交给被测发布版生成器；静态输出仍需通过框架预处理器的语法验证。
- 保存到页面就绪必须同时核对本轮 marker、实际消费类名和计算样式；HMR 握手与文档重载单独记录。修改计划在计时前准备，实际原子保存仍计时。
- 每个样本在计时结束后保存报告，使用原子替换防止中断留下截断 JSON。合并明确标记中断；语义不稳定或版本错误的行显示 N/A，不进入开销排名。
- npm 解析失败或计划丢失时仍生成预期清单与失败报告，不重新解析 latest 冒充同一次实验。
- Windows 云端分片在删除消费项目时遇到已加载的 `lightningcss.node` 文件锁。准备阶段改为独立 Node 进程，序列化源码状态后等待进程退出，再进行安装与构建测量；`dispose()` 无法替代原生模块卸载，增加删除重试也不能修复进程边界。
- Taro CLI 动态设置 `TARO_ENV=h5`，缺少这个平台环境的预生成会采用不同的 `rpx` 兼容处理。捕获器仅保存平台变量白名单，静态生成在独立进程中重放并恢复；不复制 CI 凭据与外部模块搜索路径。
- 产物比较先统一确切相同的 RGB/十六进制颜色与数值序列化，再比较规则；原始语义快照仍保留。不得裁剪色域、四舍五入透明度或放宽页面计算尺寸校验。
- `style-injector-mpx` 的 Babel 配置使用默认 transform-runtime，需要直接声明 `@babel/runtime`。原仓库从其他项目间接获得该包，独立安装暴露了缺失；三组共用这个框架依赖，不计为接入专属成本。
- Webpack 样式注入器读取原始内容并输出资产，没有按 `.scss`／`.less` 扩展名运行预处理器。静态准备必须遵守实际适配器行为，不能凭扩展名增加 Sass/Less 依赖；Vite 启用预处理的分支仍执行真实编译。
- Mpx 作用域只给出样式 sidecar 时，静态组必须在已发现且归属唯一的页面组件中显式导入它。单独修改没有消费方的 CSS 文件不能代替原插件的产物注入；连接源码之后重新生成每个操作状态并验证连续更新。
- Taro `plugin-html@4.2.1` 的 `patchMappingElements` 在构建中改写已安装的 `runtime.js`，通过硬链接使准备 store 的对应内容失效。Linux 云端完成三组各 7 轮安装后，额外的离线恢复报 `ERR_PNPM_NO_OFFLINE_TARBALL`，继而让构建找不到 Taro。安装实验改为复制源码、manifest 与锁文件到独立目录，不复制 `node_modules`，不再删除和恢复用于构建的依赖；安装失败也不能污染后续阶段。
- Taro Vite 首次依赖预构建触发文档重载时，浏览器观察器不能继续等待旧文档的请求。成功的新主文档响应替换请求集合和 HMR 握手身份，失败导航及 hash/history 导航不重置；新文档请求、错误和握手仍必须逐项验证，超时原因记录实际请求 URL。
- PR Benchmark 运行 `36548103093` 的事件基准是 `887e16289`，实际 checkout 却是把 PR head 合入 `80b39395f` 的临时 merge。uni-app 的 RSS 回归经一次复测确认，但比较中包含其他 PR 的生产变化。基准改为经过 head 身份和祖先关系校验的实际 merge 第一父提交；直接 checkout head 时才使用事件基准。门槛不变，不能把错误比较对象导致的失败当成已排除的性能回归，仍需重新验收。
- Windows 增量安装的实际样本约 335–395 ms，逐次启动 PowerShell/WMI 查询会在任务退出后才返回，RSS 成为 null。Windows 改为在计时前初始化常驻采样器，通过系统进程快照按父子关系采集目标进程树；50 ms 采样间隔仍是峰值估计，不包含采样器自身。POSIX 继续使用 `ps`。每个系统在正式测量前执行短进程内存与超时清理回归；准备采样器的时间不计入安装或 dev 启动时间。
- 三组 watcher 同时驻留仍会产生后台监听与内存干扰，不能视作独立串行。Mpx 在这种模式下多次漏掉复位 marker，而单组连续 25 轮没有复现。诊断确认重新监听已完成，后续写入却没有对应的原生事件；尚不据此给 Node 或 Mpx 下最终根因结论。测量改为每组整批完成并关闭 watcher 后再启动下一组，每批仍保持同一进程和完整预热／采样；按分片轮换组次序，反向复测反转整批次序。真实语义与 marker 校验保持不变，串行生命周期有独立回归。

- macOS 云端短进程超时清理出现 `kill EPERM`。进程退出与再次发送组信号之间存在竞态；只有独立进程快照确认目标组没有存活成员时才忽略该错误。仍有成员、快照失败或无法解析均保留原始权限错误，不扩大信号范围或提权。历史失败缺少当时的进程快照，不能断言其根因已被证明，仍需当前提交的 macOS 云端回归确认。

- `6ef92ef` 的 Linux Taro 小程序分片安装全部通过，但静态组 CSS 为安全类名、TSX 仍为原类名。发布版 `5.5.11` 的 `transformJavaScript` 默认不启用 TSX，并将解析错误连同原文返回；准备工具只取 `.code`，丢失了失败信号。现在按文件扩展名或 SFC script 的 `lang` 传入解析选项，并强制检查返回错误。快照仍精确约束类名，不对集合外字符串兜底转换。
- 同轮支付宝原生组在 Taro `modifyBuildAssets` 中崩溃：平台插件写入新 `.browserslistrc` 时，Vite runner 直接读取不存在的 bundle 成员。最初怀疑空样式，读取实际调用链后排除；生产接入已提供专用兼容资产，但禁用整组插件也将它移除了。两种基线通过 bundler `emitFile` 保留这个普通框架资产，记录 `baselineCompatibility`，不加载生成器、不处理样式。真实 Rollup 生命周期回归验证资产在后续改写之前可用。

- Windows runner 的首个进程测试在 10 秒总期限内超时，后续四项通过。采样器本来允许 60 秒冷准备，测试却把它与 100 ms 的被测超时一起限制为 10 秒；失败日志未区分具体阶段，不能单凭该日志断言目标进程清理挂起。回归改为等待准备结束后，从 `session.startedAt` 独立断言超时及清理不超过 5 秒，外层期限容纳已有的准备上限。被测 timeout、性能预算和正式采样次数均不变。

## 验证

Linux 诊断 `36595321092` 在计划阶段暴露 watcher 回归自身的跨平台假设：原子保存的临时文件也可能先触发 change，`once('change')` 不能代表目标源码更新。回归改为按完整源码路径消费事件，仍断言连续四次真实保存的内容，另加临时事件先到达的确定性用例与监听器清理断言。没有放宽 marker、样式、采样或耗时预算。

扩展 uni 诊断 `36595811830` 的准备阶段把 `uni.scss` 当普通 CSS 解析，遇到行注释后报 `Unknown word $uni-text-color-inverse`。原生组现在按扩展名和 SFC 样式块的 `lang` 选择 CSS／SCSS 解析器，用对应 stringifier 保留作者语法，只移除生成指令。真实 `uni.scss` 逐字保留、Sass 编译语义、SFC 多样式块均有回归；`CI=1 pnpm test:perf:demo` 共 84 项通过。该修复不改变生产生成器，也不能用准备测试代替云端框架验收。

全 Linux 诊断的 React/Vue Vite、uni H5、Gulp 在快速基线组出现第二次保存无事件，接入组可能因处理更慢而未触发。Chokidar 3/5 实现均对 change 去重 50 ms，并对 remove 去重 100 ms。真实 Chokidar 5 目录 watcher 使用原子替换复现：收到首次 change 后立即再次保存，只观察到第一次；独立重建 watcher 并在事件后间隔 150 ms，两次内容均收到。测量器在上次结果已验证之后、下一次计时开始之前统一保留 150 ms 间隔，仍逐次验证新 marker 与样式；记录到样本和趋势身份。持久回归连续验证四次真实保存，不通过固定等待认定成功。该实验解释输入事件被吞的机制，完整框架修复状态仍以新提交云端报告为准。

`36590396264` 的定向诊断确认分包 RN 和 uni App 构建通过，仍暴露出几类隔离准备问题。uni 示例直接声明所用 Sass；style-injector uni 同时声明 Sass Embedded 与 Less。消费项目复用根 `.pnpmfile.cjs` 对 UTS `gnu/glibc` 发布元数据的已有纠正，裁剪锁文件时保留钩子校验值；原安装日志明确记录 Linux GNU 包因 `gnu` 与 `glibc` 不匹配而被跳过。

HBuilderX 预设的入口位于 `tailwindcss.v4.cssEntries`，已用发布版 `5.5.11` 实际返回值验证读取路径。weapp-vite 专用捕获入口改为 ESM 桥接，让 Node 加载 CJS 实现；独立 Node 子进程中的配置打包回归修复前失败、修复后通过，避免 Vitest 的运行环境掩盖动态 require 错误。

uView 产物的 `.hello-scss.data-v-*` 被旧比较器仅凭共享作用域类错误归到背景探针。复合选择器检查现在排除缺少必要业务类的规则，保留函数伪类的不确定条件；真实下载 CSS 与回归均验证灰色声明不再污染探针，真正命中的红色背景仍被检测。浏览器读取已挂载 STYLE 元素的原始 CSS，避免 CSSOM 丢弃 `rpx` 让 Web demo 的 weapp 转换预览误报缺样式；Chromium 实验确认原始 `64rpx` 与实际 `18px` 分开保存，不能将转换预览当作小程序设备样式支持。

Taro Vite 与 Webpack 样式注入均按发布适配器的原文生成职责准备静态输入，uni Vite 则使用消费项目的 Vite 与捕获配置执行两次预处理。作用域扫描中的页面配置模块不属于页面源码，禁止插入 CSS 导入。新增定向回归覆盖这些边界。uni 与 style-injector uni 的微信产物均显式执行 `node scripts/ci/demo-matrix/run.mjs <目标> --build-only --update`，随后不更新验证；style-injector uni 的 H5 也执行同样流程，基线内容未变化。普通 uni 第一次构建因本工作树缺少 merge 的 dist 失败，构建 merge/variants 依赖闭包后重新执行成功。

Taro Webpack 的诊断运行 `36587807594` 中，H5 与 Harmony 产物在同一 CSS 文件先声明 `--spacing:4px`，随后由相同具名层、等价 `:root/:host` 选择器的 `0.1rem/0.2rem` 覆盖。静态组只保留后值。比较器现在仅消除可证明被同优先级后续声明覆盖的根主题变量，保留原始探针；条件、作用域、匿名层、不同选择器和优先级都不合并。下载的 20 个真实 CSS 文件在 Chromium 中规范化前后计算尺寸一致，两目标的静态与接入探针也一致。`CI=1 pnpm test:perf:demo` 共 74 项通过；这不替代完整 demo 页面和正式云端采样验收。

Linux 诊断继续暴露独立消费项目边界：分包 Taro RN 漏声明 `metro-react-native-babel-preset`，Metro 报错但外层退出 0，marker 断言正确阻断。补齐与其他 RN demo 相同的直接依赖，锁文件仅增加该 importer 的三行；`pnpm install --frozen-lockfile --offline --ignore-scripts --filter @weapp-tailwindcss-demo/subpackage-taro-webpack-react-tailwindcss-v4` 通过。构建当前包依赖闭包后，定向执行 `node scripts/ci/demo-matrix/run.mjs subpackage-taro-webpack-react-tailwindcss-v4:rn --build-only --update` 重新生成 static 基线（无差异），再去掉 `--update` 验证通过。

uni-app 发布包实际声明且安装了 `@weapp-core/escape`。真实 Vite 5.4.21 复现确认：框架默认 `preserveSymlinks: true` 导致 pnpm 嵌套依赖无法从链接路径解析，扁平布局可解析。三组统一用 pnpm `hoisted`，不增加手工依赖或修改发布包；记录布局并纳入趋势兼容身份。去掉 `weapp-tailwindcss` 的基线还需保留页面的标签模板语义：先核验发布版 `weappTwIgnore === String.raw`，再按 AST 将基线命名导入改为内建函数，其他 API 拒绝猜测替换。

HBuilderX CLI 模板的 ESM 配置打包会把捕获器中的 CJS `require('node:module')` 转成不可用的动态调用。捕获器根据原导入类型生成 ESM 或 CJS 入口，ESM 用显式 `createRequire` 加载消费目录内的支持代码。真实 esbuild 配置打包回归覆盖捕获、记录和移除生成包后的禁用组，不靠 mock 宣称模块可加载。额外磁盘诊断 `debug-uni-app-x` 在三组准备阶段统一关闭并移除，其非正常用户开销不进入性能数字。App 作者探针按已有任意值探针使用 px，避免错误期待框架保留 rpx。定向工具测试共 72 项通过，云端仍须重新生成各状态静态输入验证这些调整。

Linux 缩减采样运行 `36580080675` 的 React H5 仍出现组件布局差异。检查发现旧观察器分两次 evaluate 等待组件并采样；首次调用可能看到空文档，第二次看到刚创建的节点。现在先验证本轮 marker，再在同一页面调用中等待组件，确认原节点未脱离且 marker 未变后同步读取布局。持久回归覆盖空文档到延迟渲染、节点替换和 marker 变化；Chromium 强制该时序，旧顺序读到 `inline`，修复后读取 `block`。这是采样器的定向验证，仍需真实 H5 云端对照确认。

同一诊断中，issue-951 的 `mainCssChunkMatcher: () => true` 被捕获器一概当作闭包拒绝。仅增加语法可证明的无参数布尔常量回调编码，不执行回调猜测返回值，不使用动态求值，不支持读取参数、外部变量或副作用的函数；往返与拒绝反例均有测试。`CI=1 pnpm test:perf:demo` 共 64 项通过。构建对照失败时，在计时之外保存三组 CSS／HTML 或 RN bundle，补充原始产物证据；已有 `--spacing` 与 RN marker 失败仍保持失败，等待证据定位。

`83fc43b` 的 Taro 小程序冷／热构建中，静态组 `.flex` 含 `-ms-flexbox`、`-webkit-flex`、`flex`，接入组含 `-ms-flexbox`、`flex`；开发启动两组均只有 `flex`。静态输入中原本只有标准 `display:flex`。真实 Autoprefixer 与该 demo 的生产 Browserslist 复现了添加旧前缀的行为，接入后的平台处理会清理该前缀。原比较器先把声明变成集合，丢失了前后覆盖关系。比较现按 AST 顺序，仅规范化同一规则中被后续同优先级标准 `flex`／`inline-flex` 覆盖的对应 WebKit 回退；不改源码或产物，原始探针规则另存于语义证据。不同规则、条件、声明顺序、优先级及真正的布局差异均保留。这里采用既有探针要求的标准 flex 支持边界，不推断不支持标准 flex 的旧浏览器。

真实 Autoprefixer 回归及顺序／条件／优先级反例通过，性能工具共 59 项测试通过。Chromium 分别消费原始 CSS 与可比较 CSS，计算布局和子元素位置一致；云端仍需在当前提交重新生成静态输入并执行正式对照，不能把该最小浏览器实验当成设备验收。

Windows 诊断运行 `36567931950` 的静态组已有本轮 marker、普通 CSS 与空请求队列，但缺少 `taro-view-core { display: block }`，接入组则已加载该样式。Taro `4.2.1` 的 Stencil 自定义元素在首轮渲染阶段挂载组件样式；仅检查 `document.complete` 与请求完成，会提前采到 `inline/auto` 布局。页面观察器对旧适配器等待 `componentOnReady()`；现代适配器没有该 API，必须核验元素已注册、组件声明的 CSS 已挂载在文档或 shadow root。初版只处理旧适配器，在后续入口审查中纠正，并用真实现代组件复现。检查不猜测应有的 `display`，单次等待有界，失败仍阻断。不能只检查 `hydrated` 类名，因为页面更新可以重新设置 class。每个 watcher 单独保存最后的完整样式与布局快照，避免后续进程覆盖证据。

组件就绪回归覆盖异步渲染、未注册、拒绝、超时清理、现代适配器与 shadow root；`CI=1 pnpm test:perf:demo` 共 57 项通过。使用真实 Chromium 与发布的 `@tarojs/components@4.2.1` 做两种适配器的隔离实验：旧适配器阻住懒加载模块，现代适配器阻住首轮渲染任务；均实测到 `inline`，释放后变成 `block`。现代组件明确没有 `componentOnReady()`，渲染前就绪检查失败、样式挂载后通过；不支持组件告警的 Taro 事件入口在最小实验中未启用。此实验不替代完整页面或云端验收，也不能单凭它断言此前作者 CSS 宽度异常已解决。

定向回归入口为 `pnpm test:perf:demo`，复用清单和产物检查的兼容回归为 `pnpm test:demo:matrix`。React Vite Web 在上述 baseline 提交已完成正常采样数的三组构建、启动和连续热更新，重新生成静态输入后语义验证通过。原始报告保留在本次任务的 `.tmp/demo-cost/formal-vite-committed`；本机结果不视为云端全矩阵验收，也不冻结预算。

Mpx 样式注入 demo 补齐依赖后，执行 `node scripts/ci/demo-matrix/run.mjs style-injector-mpx:wx --build-only --update` 重新生成 static 基线，内容未变化；再用相同命令去掉 `--update` 验证通过。该验证是定向产物验收，不包含 IDE／设备运行。

Mpx 正常采样数的本地运行在 `53b98f7e0` 上完成三组各 7 轮冷构建、热构建和启动验证；连续 HMR 在 16 轮之后的原生组发生漏更新并超时，原始样本和失败前源码／产物已保留，不能宣称 HMR 全量通过。

串行 watcher 的 Mpx 定向诊断完成三组、每类 2 轮预热和 20 轮连续更新，marker 与静态／接入样式等价检查通过；该诊断仅采样 1 轮启动，不能替代正式全阶段报告。进程组清理与串行生命周期加入持久回归，`CI=1 pnpm test:perf:demo` 共 51 项通过。

在 `6ef92ef` 上重新执行 `pnpm perf:demo:report --only style-injector-mpx:wx --phases build,hmr`，三组冷／热构建与启动各 7 轮、每类更新 20 轮全部通过，报告完整性错误为 0，并通过 `perf:demo:guard`。此前同提交的一批数据受本机合盖休眠污染，保留为失败报告；正常批次单独归档，不覆盖旧样本。Taro H5 本地定向准备因 npm 发布依赖下载超过 15 分钟失败，未进入计时阶段；不据此判断构建回归。

源码准备修复新增真实 Babel 语法和 Rollup 资产生命周期回归，`CI=1 pnpm test:perf:demo` 共 54 项通过。使用独立消费项目中已安装的发布版 `5.5.11` 复现默认 TSX 解析错误，修复后 `h-[64rpx]` 转为 `h-_b64rpx_B`，集合外 `unknown-[8px]` 保持不变。完整云端静态输入仍须在修复提交重新生成并逐状态验收。

## 适用边界

当前 React Vite Web 有正常采样数的定向实测证据；Gulp 的三组构建、启动与全部更新操作通过缩减采样诊断，另有 7 轮离线安装数据。完整 CLI 云端矩阵仍在验收，其他构建器及 style-injector 必须通过真实结果确认。IDE 和设备验收独立于云端 CLI；本记录不证明这些环境通过。尚未据此修改生产实现，也不能把单一 Vite 目标的模块加载 profile 外推为全仓根因。

## 规则评估

不新增 AGENTS 规则。现有发布依赖隔离、真实语义验证、失败证据和显式预算更新要求已经覆盖这些问题，优先通过持久回归落实。
