# Uni / Taro Vite / Mpx 输入与分配诊断

这两个手动模式用于定位性能失败，不能证明正式性能验收通过。`--input-diagnostics` 记录完整候选和来源，不启用 inspector；`--allocation-diagnostics` 额外启动包含 major/minor GC 已回收对象的统计分配采样。二者分开运行，均要求一个完整 Git 基线 SHA、一个已登记的 Uni、Taro Vite React 或 Mpx 小程序项目、3 次冷构建和同一 watcher 的 3 次修改/回滚。禁止与 `--guard` 同时使用。

## 运行入口

在仓库根目录、依赖和对应 Node 已准备好时执行。将以下示例的 Git 基线改为本次对比的准确 commit；诊断期间保留首败工件，不以结果替代正式门禁。

```sh
pnpm bench:ci -- --input-diagnostics --baseline-ref fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417 --only demo-uni-app-vite-tailwindcss-v4__mp-weixin --build-runs 3 --hmr-runs 3 --result-dir .tmp/benchmark-input-diagnostic
```

分配模式使用同一参数，将 `--input-diagnostics` 换成 `--allocation-diagnostics`，并使用独立结果目录。工作流为这两个模式固定 Node 22.23.4；本地应核对实际 worker 的 `process-start.json`，不能以父 shell 的版本代替。该版本 V8 inspector 支持 `includeObjectsCollectedByMajorGC` 和 `includeObjectsCollectedByMinorGC`。实现不发送 GC 或 heap snapshot 请求；协议失败则停止诊断。

Taro Vite React 使用 `--only demo-taro-vite-react-tailwindcss-v4__mp-weixin`，其余限制相同。Taro 的仓库 runner 在加载 CLI 前改写 `process.argv`，preload 因此绑定准备副本中的 `scripts/taro-build-runner.mjs`，同时核对实际解析的 `@tarojs/cli` 包身份和 bin 声明。不能绑定未直接执行的 CLI bin，也不能把缺少对应进程证据解释为没有 GC 或分配。GC 模式仅在显式选择 Taro 的诊断 dispatch 开启；普通 PR 的 Taro 采样与门禁保持原行为。

Linux 使用 Benchmark 工作流的手动入口，选择准确 PR 分支，填写同一完整 `baseline_ref`、上述 `only`、`build_runs=3`、`hmr_runs=3`，仅启用 `input_diagnostics` 或 `allocation_diagnostics` 之一。两个输入默认关闭。等价 CLI 模板如下；`PR_BRANCH` 需要替换为真实分支名：

```sh
gh workflow run benchmark.yml --ref PR_BRANCH -f baseline_ref=fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417 -f only=demo-uni-app-vite-tailwindcss-v4__mp-weixin -f build_runs=3 -f hmr_runs=3 -f input_diagnostics=true
```

显式 `gc_diagnostics=true` 仍保留已有自然 GC、预算和反序确认行为。所有显式诊断 dispatch 的 job（包括 skipped job）使用独立 Diagnostic check 名及并发组。普通 PR 的 check 名、预算和调度逻辑保持原行为；诊断成功不能替换正式 PR 的失败。

新输入/分配模式使用同一确定性 `twbenchdiagnosticround1..3` 修改标记，不读取时钟或进程身份。初始来源已包含本轮标记时立即失败。这样两侧实际写入保持等量；原正式及自然 GC 模式仍使用原 marker 规则。控制器会记录生成规则，实际文本哈希仍需逐项比较，不能只比较归一化后的 marker 哈希。

## 证据与解释

- `allocation-preparation/*/instrumentation.json`：副本原文和插桩后的 SHA，以及唯一 AST 锚点。源码工作树和含 `.git` 的目录不能插桩。
- `gc-diagnostics/*/*/allocation-controller.json`：准确执行命令、限定范围的构建环境、源码初始/修改/回滚实际 SHA、预期 SHA、marker 和阶段时间。marker 归一化 SHA 仅供辅助比较，实际 SHA 始终保留。
- `inputs-N.json`：各来源层的完整候选和源码 SHA、UTF-8 字节数、UTF-16 长度、完整编译候选集合。每次冷构建 1 份；watch 包含首次构建、3 次修改、3 次回滚和结束共 8 份。最后一份来自停止采样，未发生新编译，因此不虚构编译候选集合。
- `allocation-N.json`：从启动以来累计的完整统计分配 profile、采样参数和阶段，按下述无损压缩协议保存。该数值不是存活堆或 RSS，不能直接和进程树 RSS 相减。源码映射缺失时保留生成模块身份并标记不可跨构建比较。
- `allocation-frames-N.json`：原始 profile 对应的全部栈帧与映射；只读取准备副本内仓库模块的源码和 sourcemap。第三方 `node_modules`、副本外模块及越界符号链接保留原始函数名、模块身份和行列，明确标记未映射、不能跨构建比较。原始 profile 与 `inputs-N.json` 在映射前写入；映射失败保留这些首败证据，但状态仍失败，不产生完整验收结果。控制器同时核对原始 profile 和映射文件的哈希。
- `diagnostic-input-comparison.json`：两侧对应阶段逐项比较候选和来源哈希，额外候选列出所属来源层及 SHA。仅来源 key 的已知项目根会归一化；源码中的根目录文字、marker 等内容差异保留。若实际输入不同，本轮分配差异不能解释原正式失败。
- `allocation-diagnostic.json`：明确标记 `diagnosticOnly=true`、`budgetAcceptance=false`。这两个模式在正式预算和反序确认前返回，不产生正式通过报告。

观测器只以 `WeakRef` 登记实际 store，不延长生产 store 的生命周期。每阶段先取 profile，再序列化候选；后续累计 profile 包含此前观测开销。来自诊断模块及其子调用的栈标记为 `diagnosticAllocation`；此标记能帮助区分直接观测分配，不能消除 inspector 对 GC、时序和进程内存的影响，也不能完整归属全部 V8 内部分配。

## Profile 传输与读取

新 profile 和栈映射文件使用 `weapp-tailwindcss.allocation-gzip.v1` envelope，`data` 是标准 gzip 字节的规范 base64，`uncompressedBytes` 声明内层实际字节数，`statistics` 保留可复核统计。内层仍为 `weapp-tailwindcss.allocation-url-dictionary.v1`：`urls` 保存每个完整 URL 一次，`document` 仅将 `sampling.profile` 树中的 `callFrame.url` 或映射记录中的 `originalUrl` 替换为字典下标。gzip 同时压缩重复结构字段，避免只有短 URL 的大 profile 仍因重复 JSON 字段超限。

空字符串、data URL、Unicode、行列、节点顺序、样本和未知 JSON 扩展字段均不归一化、不截断。采样器的原对象不改写；映射仍消费完整原始 URL。统计额外记录 `samplesWithoutNodeCount`：当前 head 无对应节点的样本仍完整保留，不丢弃、不补造栈。栈映射只覆盖 head 可取得的栈；无法关联的样本不归入任何模块、框架或泄漏结论。其他输入、操作和全文证据维持原协议。

控制器和离线消费者使用 `profile-files.mjs` 的 `readAllocationEvidenceFile(file, receipt, expectedKind)`，已读 Buffer 可使用 `profile-codec.mjs` 的 `decodeAllocationEvidence(raw, receipt, filename, expectedKind)`。读取器先限制实际文件大小，按编码文件原始字节校验 receipt 的 bytes 和 SHA，再检查压缩版本、规范 base64、有界解压、实际解压尺寸与 UTF-8，最后验证内层版本、全部引用、节点结构和重新计算的内外层统计。明确指定 `profile` / `frames` 防止串用；兼容旧未编码和 URL 字典 v1 profile / 映射。不能直接以 `JSON.parse(...).sampling` 读取新文件，也不能只验证文件 hash 后跳过解码验证。

传输继续受每文件 16 MiB、会话总计 64 MiB 的既有预算约束，base64 与 envelope 也计入存储字节。序列化前先有界计算实际 JSON UTF-8 尺寸，内层压缩输入和完整原值 JSON 均不得超过 64 MiB；普通 JSON 数据之外的循环、自定义序列化对象立即失败。`gzipSync` 的 `maxOutputLength` 按扣除 base64 和 envelope 开销后的真实文件预算设置；`gunzipSync` 的实际输出硬界固定为 64 MiB，不使用声明尺寸分配。解压后再按字典字符串的 JSON 转义后 UTF-8 字节与引用数计算完整原值尺寸，验证后才还原字符串引用。这个上限不会保证任意真实 profile 都能保存。压缩、展开或累计超限均失败，不拆分绕过预算；zlib 提前终止时只报告确知的硬界与原因，不虚构未生成的完整压缩字节数。此前已完成的证据文件保持可审计。

字典与 gzip 只改变诊断传输，不改变 inspector 采样参数、正式预算或采样终点。同步压缩、解压、字节计数和序列化都有 CPU 与内存观测开销，后续累计样本可能包含此前压缩；新诊断的 RSS 不能替代未插桩的正式预算比较。它不能证明某次未留下 profile 的失败由重复 data URL 引起，也不能据诊断 fixture 通过宣称真实框架 RSS 回归已修复。

## 固定范围

采样间隔固定 256 KiB，每会话最多 8 个阶段、32 个 store、每 store 4096 个来源条目、每集合 100000 个候选；每文件最多 16 MiB、每会话输出最多 64 MiB。栈映射最多读取 128 个准备副本内仓库模块、累计 32 MiB；原始采样保留采样窗口内的第三方调用栈，不因映射范围收紧而删减样本。冷构建在首个 `vite.completed` / 根 compilation 完成事件取样并停止，watch 在最后一次 stop 握手取样；停止后的产物写入、关闭和进程退出分配不在 profile 中。必须对照 `sampling.completedAtEpochMs`、完成事件、释放事件与 RSS 峰值时间，不得以 profile 中没有分配来排除窗口外的内存峰值。超限、未知锚点、worker 缺失或阶段不匹配使诊断失败，不截断后继续。

这些限制约束诊断输入/输出和阶段数，不能硬性限制 V8 inspector 内部的采样内存。watch 停止握手最多等待 10 秒；失败仍由原 runner 结束自己创建的子进程并恢复已修改来源。没有强制 GC、额外业务重建或产品源码埋点。

## Mpx 操作与实际输入

Mpx 使用 `--only demo-mpx-tailwindcss-v4__mp-weixin`，其他限制相同。优先单独运行 inputs 模式核对明确问题，不因诊断成功或另一次正式采样通过而丢弃首败证据。正式 Mpx 的预算、工作负载、自然 GC 配置和 PR 默认路径均不改变。

Mpx 仅在准备副本注入唯一 AST 锚点：Webpack compilation 创建与处理完成、来源扫描已读到的文本、生成器、原生生成会话、底层 compile/build，以及版本存在时的 compiler 服务池。准备阶段验证所有锚点后才写入；基线缺失服务池登记为 `absentCapabilities`，不是零次调用。锚点损坏仍直接失败。

插桩模块也会被准备阶段的包构建消费，此时 worker 尚未注册 observer。七类 Mpx 插桩点都在调用时读取 observer：不存在时直接执行原表达式或原函数体，不构造诊断详情、不追加 Promise 或等待边界；后续注册和移除立即生效。已注册但损坏的 observer 仍报错。服务释放的原有幂等 guard 保持在记录之外。

准备链路可在已安装依赖、无 `.git` 且尚未插桩的副本上做定向回归：

```sh
node benchmark/version-compare/scripts/diagnostics/verify-preparation-build.mjs <准备副本> <源码工作树> <证据目录>
```

该命令先执行实际 `prepareAllocationRoot`，只构建 UI 的 workspace 依赖链（包含 engine、主包及其依赖）和 UI 本身，不运行 `build:pkgs`、设备验收或 Mpx worker。依赖须提前就绪，构建期间关闭 pnpm 自动重新安装。它核对 UI → 主包、主包 → engine 的实际解析路径属于副本，并确认两个包的产物确实含插桩；记录命令、构建日志和解析路径。复用第三方依赖时必须将全部 workspace 链接指向副本，不能用原工作树的未插桩 dist 产生假通过。此回归只证明准备包构建和 UI 消费链路；真实 Mpx 诊断及性能门禁仍需单独运行。

- `operation-N.json` 按顺序保存实际开始、成功、失败、复用和失效事件。开始与完成以 `operationId` 对应，保留当前阶段和开始阶段；每轮额外 compilation 不合并或丢弃。`compilationCount` / `webpackCreatedCount` 是实际创建次数，`webpackCompletedCount` 是本插件处理完成次数，二者均包含 child；`snapshotCount` 仅登记每阶段首个完成的非 child 根编译快照，并保存对应 `compilationId`。child 先完成也不能抢占阶段快照。被跳过或失败的 compilation 不虚构完成；最后的 watch-stop 快照不增加编译次数或身份。
- `text-<sha256>.json` 保存实际来源、生成请求中的 CSS 与产物 CSS/rawCss 全文，按内容去重，保留 CRLF、根目录文字及实际 marker。来源取自既有扫描读取结果，不额外读源码；Mpx watch 缓存省略来源文本时仍能复核未变化文件。控制器逐份校验引用、全文哈希、文件数和总字节，并复核每项操作开始与完成配对，损坏、缺失和超限均失败。
- `matches.key`、`acquire.key`、`request.key`、`acquire.sourceSnapshot`、`request.snapshot`、`result.copy` 分别记录实际次数和耗时。计时包住原有一次调用，不重算 key 或重复复制数据；记录序列化耗时另列。没有服务池的基线不伪造这六项数据。
- 服务、生成器及 engine/native 会话只用弱映射分配进程内身份。复用、创建、退役、实际 dispose 调用及其返回分别记录；服务可选 dispose 记录 `callable`，方法不存在不能算作已释放。`native` 指本项目的生成会话层，不等同于 Rust 分配器；逻辑释放不能证明 RSS 下降。采样停止后仍被动记录实际关闭事件，不额外调用 dispose、不改变信号或生产关闭顺序。尾部状态与事件不一致即缺证，缺少释放事件不自动解释为泄漏或成功释放。
- `service.acquire` 在原有租约登记后关联 owner、entry、底层 `serviceGeneratorId`、lease、公开 facade 的 `generatorId`、key 和当时引用数；`service.matches` 保存实际布尔结果及同组身份。`serviceGeneratorId` 等于 `service.create.success.resultId`、`generator.create.success.resultId` 和生成/释放事件的 `engineId`；后者同时记录原生 `poolId`，与 `native.create/generate/dispose` 的 pool/session 身份串联。退役后相同 key 的新 entry 是不同代际。释放须对应既有 acquire 且身份一致，未知租约、跨 owner 或重复实际释放均失败；生产幂等 guard 内的重复 dispose 继续返回同一 Promise，不伪造第二次释放转换。
- 扫描 signature 原始结构含绝对工程根和输出目录，不同副本根足以改变其哈希。对照只归一化结构化路径，全文哈希不归一化；没有全文比较前，不能据签名差异宣称实际来源相同或不同。操作对照保留实际次数与顺序，以工件引用定位差异；不透明对象或函数身份不能用来证明跨进程闭包相等。

每会话最多 4096 个操作事件、4096 个弱映射身份；仍共用每文件 16 MiB、会话 64 MiB 的写入预算，全文文件与操作事件均计入。未知候选迭代器不能被额外消费，诊断明确失败。观测会改变分配和时序，所有数据仅用于诊断，不能直接解释原正式 RSS 差异。

## Vite 操作与来源全文

Uni 和 Taro Vite 复用同一套生成器、原生会话、engine compile/build 与可选服务池 AST 插桩；Webpack 的创建、child 与根 compilation 校验继续由 Mpx 独立使用。准备阶段没有 observer 时，Vite finalizer 直接执行原流程，不增加 `await undefined` 微任务；store 直接返回原对象，不创建诊断包装闭包。运行中注册或移除 observer 立即生效，已注册但损坏的协议必须失败。

每次实际 `finalizeGenerateBundle` 到达既有 `onEnd` 前记录 `vite.completed`，保存当下固定阶段、单调 `finalizationId` 和实际候选集合。同阶段额外完成全部入流，仅首个完成选为快照；`compilationCount` / `viteCompletedCount` 是实际完成次数，`snapshotCount` 仍为冷构建 1 或 watch 8。各 `inputs-N.json` 的完成身份、阶段和候选须对应唯一已选择事件；watch-stop 只有结束快照，不虚构完成身份或候选。

`source.snapshot` 使用每阶段每个 store 已有的同一次 `snapshot()` 结果，保存各来源层、实际文件身份和来源全文引用，不另读源码或重复调用 snapshot。各层全文与 `inputs-N.json` 的 SHA、长度和 store/阶段身份逐项核对。相同内容共享 `text-<sha256>.json`，CRLF 和源码中的根目录文字均保持原样；store 与 finalizer 身份只在事件顶层视为进程内元数据，嵌套同名用户输入仍参与比较。生成请求、每次 CSS/rawCss 和实际生命周期同样保留调用顺序；汇总列出总次数及各阶段次数。

以上事件和全文仍共用原有 4096 事件、16 MiB 单文件、64 MiB 会话预算，超限必须失败。验证器先核实际文件数量、总字节、全文引用和操作配对，再核构建器自己的完成关系。输入模式不加载 inspector；这些证据用于解释调用与输入差异，不表示 RSS 性能修复或正式预算通过。

Vite 的无 observer 准备构建可在前述 `verify-preparation-build.mjs` 命令末尾追加 `demo-taro-vite-react-tailwindcss-v4__mp-weixin` 或 Uni 项目标识，默认仍验证 Mpx。该回归只构建已有依赖与 UI 消费链，不启动真实框架性能 workload。

定向回归包含真实 Node 子进程中的 Mpx 诊断 worker 协议、手工构造的 compilation/store/操作，以及插桩后真实会话源码的受控依赖测试；这些不是实际 Mpx CLI 构建验收。真实框架行为仍需在集成后的准确 head 上单独运行 inputs 诊断，不能以协议 fixture 通过代替。

## Taro 冷构建尾部阶段

Taro 的 input / allocation 两种显式模式同时启用尾部数值观测，普通 PR、正式门禁、单独 GC 模式和 watch 轮次不启用。定位 RSS 尾峰优先使用 input 模式，避免把大 profile 的序列化、映射和压缩开销混入尾部判断。allocation 模式的原停止点仍在主 `finalizeGenerateBundle` 的 `onEnd` 前；后续阶段记录不是延长后的分配 profile。

源码准备阶段验证并插桩独立 CSS finalizer。依赖安装后，从准备副本的 Taro runner 实际解析 Vite，再从 Vite 解析 Rollup，沿各包 `exports.import` 的相对静态 ESM 图查找唯一 AST 锚点。`tail-dependencies.json` 记录实际版本、包元数据哈希、源码前后 SHA 和锚点。路径 realpath 必须留在无 Git 元数据的准备副本内；全部依赖锚点成功后使用临时文件 rename 替换，避免原位写穿 pnpm 硬链接。未知布局、重复插桩和路径逃逸直接失败。未注册尾部 observer 时执行原语句，不求值统计参数、不增加回调、Promise 或 await。

`operation-N.json` 中的 `vite.tail.phase` 与既有操作共享序列。每轮冷构建必须具有以下完整顺序：实际 resolved config → 主 finalizer 完成点 → `snapshot.before/after` → 独立 CSS finalizer 起止 → Rollup 文件写出起止 → `writeBundle` 起止（其中包含 Vite reporter 起止）→ `closeBundle` 起止。末尾摘要和每份实际事件都由控制器复核；阶段缺失或顺序变化不能当作零开销。

事件记录 wall clock、单调时间和本 Node 进程 `rss/heapTotal/heapUsed/external/arrayBuffers`，不能直接等同正式进程树 RSS。`snapshot.before/after` 包围既有候选、来源和可选 profile 处理；阶段统计的 `observationPreparationMs` 与 operation 自身的准备耗时单独保留。observer 会改变分配和时序，这些标记不能消除全部观测影响。

资产只统计全资产与脚本的数量和 UTF-8 字节，不复制 CSS、JS、AST 或 sourcemap 全文，不读取用户 opts 或额外调用 cssMatcher。无法从已知元数据确定的 CSS 数量和字节、sourcemap 序列化大小及未观测到的 styleHandler 调用次数保持 `unknown`；不能用文件名启发式分类。候选、sourceId、生成次数及请求 CSS 全文复用同序列的 `source.snapshot` 和已有生成操作，不重复扫描或额外调用 handler。reporter 是否可能压缩或序列化 map，应读取本次 resolved `logLevel/reportCompressedSize/ssr/sourcemap`，不能从框架名猜测。

每进程最多 64 个尾部事件、每次最多 4096 个资产；仍共用原操作事件数与文件/会话字节预算。没有强制 GC、额外构建、采样间隔或正式阈值变更。阶段结束与实际 RSS 峰的时序需要在同次诊断中对照；诊断 fixture 成功不表示 Taro 性能回归已修复。


## Uni HMR 的 bundle 输入补证

只有 Uni 微信目标的 `input_diagnostics=true` 注册本节观察器，普通 PR、自然 GC 和 allocation 模式不插入这层观察。沿用已有完整 Git 基线、单项目和固定 3 build / 同 watcher 3 次修改回滚；Node 固定 22.23.4，不启用 inspector。准备只写无 Git 的副本，并在写任何文件前验证全部实际 AST 锚点。入口示例（`PR_BRANCH` 须绑定本次待诊断准确提交，基线示例为本轮首败的实际 base）：

```sh
gh workflow run benchmark.yml --ref PR_BRANCH -f baseline_ref=e769e69b97c88b379a80d3cabca4fa20330b999a -f only=demo-uni-app-vite-tailwindcss-v4__mp-weixin -f build_runs=3 -f hmr_runs=3 -f input_diagnostics=true
```

新增事件继续写入控制器拥有的 `operation-N.json` 和 `text-<sha256>.json`，不是 bundler 输出；不写入、扫描或读回 `dist` 来还原源码。`uni.bundle.input` 在原 shouldProcessBundle 早退之后、实际处理的 generateBundle hook 入口归档 asset/chunk 的原始字符串或二进制字节；二进制按规范 base64 保存，并独立核原字节 SHA。`uni.snapshot` 在既有 snapshot 建立后、任何 entry 任务启动前保存处理器真正消费的 `entry.source` 字符串、SHA、UTF-8/UTF-16 长度，以及 processFiles、changedByType、runtimeAffectingChangedByType、linkedImpactsByEntry、removedFiles、omitted-known-files 和增量模式。两层输入不可互相替代。

`uni.plan`、`uni.selection` 与 `uni.cache` 记录既有计划结果、实际早退分支和 callback；不再次查询 cache 或调用用户 matcher。local hit、last-result hit、clean JS direct replay、processed reuse、shared attempt、shared result、transform entered 和 cancelled 保持各自语义；发现 shared task 不能代表最终复用成功，共享任务撤销后的真实重算仍留存。CSS 归一化、root/source/composition/decision/cache plan、JS plan/precheck/handler 等原调用各写一次终结 `uni.phase.*.span`，同时保存原 details、唯一 spanId、单调起点/终点、duration 和实际成功/失败；失败保留原错误及 cause。未终结调用保留在最后状态 `uniInput.spans.pending` 并阻断完整性。取消重复的 start/success envelope，不合并真实调用、不抬高4096事件预算；bundle 外层开始/完成、raw、snapshot、plan、cache、selection 仍逐项留存。既有 `entries.plan`、`tasks` 与 metrics 原样附在 `uni.plan.complete`。

这些时段是允许重叠的墙钟片段，不能相加作 CPU 开销。外围异步 `jsHandler` 的等待可能包含后续同步任务，不能视为内部 backend 同步成本；`transform-entered` 和 CJS loaded 也不足以区分 resultCache/native/Oxc/Babel 实际分流或进行CPU归因。原 `vite.completed` 候选数组保留 Set 迭代顺序；集合相等不能推出数组逐项相同，先排序的签名也不能解释所有下游顺序敏感行为。每个实际处理的 hook 使用独立 AsyncLocalStorage 身份并固定开始阶段，所有异步 factory 继承所属 bundle，并与实际 Vite finalization 一一绑定；timing 输出后控制器切换 rollback 不会重新归属该 bundle。正常 skip prehook 不虚构编译。

`uni.dependencies` 被动检查同一 worker 已完成的 CJS Module 缓存，记录实际 physical 文件、包身份、package SHA 和观测时文件 SHA；只将这些项标为 `loaded-cjs-cache`。按 importer 解析的 CLI、Vite 内部 Rollup/PostCSS 和主包依赖另列为 `resolved-only`，不会为了补证执行依赖。ESM 注册表、被 bundle 内联的模块、尚未使用的入口没有公开只读枚举依据时，逐项写入 `missingEvidence`；不能从 resolve 或锁文件推出 loaded，也不能从加载推出调用或 CPU 归属。文件 SHA 是观测时磁盘字节，不证明加载时字节；登记的 wrapper 身份也不证明 Rollup/Oxc 等原生后端已被覆盖，未登记的 backend 保持缺证。读取及原有事件/归档预算超限即失败，不截断放行。

控制器复核原始字节与处理器文本、每份输入/规划/完成唯一性、bundle 生命周期和实际 finalization 关系；缺失或未知结构阻断。原有 3 build 各一份、watch 8 份与双侧 11 个阶段对照继续执行。还须人工核对 run head、`versions.json`/controller 的准确 sourceCommit、worker Node/entry/preload SHA、清洁工作树和实际 mutation/rollback SHA。同步归档、哈希、Promise 包装及上下文传播都有观察成本；没有 observer 时不求值诊断详情、不增加 await。诊断保持 `diagnosticOnly=true`、`budgetAcceptance=false`，不能替代未插桩的正式性能门禁，不能据一次 profile 直接认定某个依赖为根因。

runner 将本次 pnpm worker 的 stdout/stderr 原始字节分别归档为 `worker-stdout.log`、`worker-stderr.log`，`worker-result.json` 保存字节/SHA、实际退出状态、首错完整 cause/AggregateError 链和诊断次错。日志与错误回执同样受16MiB单文件、64MiB会话总预算约束，超限明确失败；未观测到 close 不标为完整。构建/HMR、子进程停止、源码恢复和 diagnostics.finish 复用聚合收尾，后一项失败不覆盖首错。输出完整仅表示日志被完整归档，不能表示构建或诊断通过。

首次操作录制失败同步写入唯一的 `operation-terminal.json`，保存尝试序号、name、固定phase、file/bundle/sourceModule、录制错误和原操作错误；后续异常不能覆盖它。该小型回执最多4096字节，从原64MiB会话预算内预留4096字节，普通输出可用空间相应减少，不增加任何预算。字段缩写明确保留完整字节数与SHA；完整业务错误仍在原始日志及worker错误图，回执不冒充完整输入。回执写入失败另入状态，存在回执即拒绝完整性。录制首败与真实bundle终结后立即刷新 `status.json`；capture时尚未关闭的bundle继续为false，终结后才为true，不依赖正常exit补写。worker日志归档前重新统计全部实际操作、全文、profile及terminal文件字节，并与最后status计数并列，用较大值核64MiB总量；旧status低报不能减少计费。
