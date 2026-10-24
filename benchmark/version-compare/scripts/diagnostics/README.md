# Uni / Taro Vite / Mpx 输入与分配诊断

这两个手动模式用于定位性能失败，不能证明正式性能验收通过。`--input-diagnostics` 记录完整候选和来源，不启用 inspector；`--allocation-diagnostics` 额外启动包含 major/minor GC 已回收对象的统计分配采样。二者分开运行，均要求一个完整 Git 基线 SHA、一个已登记的 Uni、Taro Vite React 或 Mpx 小程序项目、3 次冷构建和同一 watcher 的 3 次修改/回滚。禁止与 `--guard` 同时使用。

## 运行入口

在仓库根目录、依赖和对应 Node 已准备好时执行。将以下示例的 Git 基线改为本次对比的准确 commit；诊断期间保留首败工件，不以结果替代正式门禁。

```sh
pnpm bench:ci -- --input-diagnostics --baseline-ref fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417 --only demo-uni-app-vite-tailwindcss-v4__mp-weixin --build-runs 3 --hmr-runs 3 --result-dir .tmp/benchmark-input-diagnostic
```

分配模式使用同一参数，将 `--input-diagnostics` 换成 `--allocation-diagnostics`，并使用独立结果目录。工作流为这两个模式固定 Node 22.23.3；本地应核对实际 worker 的 `process-start.json`，不能以父 shell 的版本代替。该版本 V8 inspector 支持 `includeObjectsCollectedByMajorGC` 和 `includeObjectsCollectedByMinorGC`。实现不发送 GC 或 heap snapshot 请求；协议失败则停止诊断。

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
