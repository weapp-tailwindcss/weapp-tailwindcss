---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1325
issues:
  - https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1319
  - https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1325
baseline: 80efee1e22769557c4c73308c546f446c929320a
regressions:
  - packages/weapp-tailwindcss/test/source-line-limit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/sfc-style-boundary.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/sfc-style-work.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-sfc-style-snapshot.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-watch-snapshot.unit.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/vite-style-transactions.test.ts
  - e2e/hbuilderx-source-mutations.test.ts
  - e2e/hbuilderx-source-only.test.ts
  - e2e/fixtures/issue-1325-style-boundary.repro.test.ts
  - benchmark/version-compare/test/invalidation-instrumentation.test.mjs
---

# SFC 样式边界与事务修复

本记录继续 [main 根因验收](main-1319-1325-root-cause-acceptance.md)。保留旧失败现场，单独记录修复版；设备验收尚未完成，两个 Issue 均不能标记为全面根治。

## 症状

原工程 `mp-html.uvue` 的脚本注释包含伪 style，基线会把后续脚本作为 CSS 返回并触发 UTS 的 `Unknown word`。并行转换还存在过期事务失败击穿较新样式请求、Harmony 删除后残留旧规则的问题。

## 根因与纠正

`<style>` 全局正则跨过 SFC 顶层边界，把脚本字符串、注释和自定义块内容当作 CSS。原工程 `mp-html.uvue` 的注释误匹配使 UTS 进入真实 style 请求，产生 `Unknown word`。转换器另一个正则会把伪 scoped 标签当作载体，造成 MagicString 区间重叠。

中立工具层现在复用既有 `@vue/compiler-dom` 的 SFC 模式，保留顶层块原文、属性和 offset。转换器、快照、CSS 缓存及来源扫描共享同一边界；Svelte 保留独立适配和预处理器元数据。生成扫描区分文件中的完整 SFC 与显式 `sourceCss` 载荷，无 style 的 SFC 不再把整份脚本作为 CSS 扫描。已展开的 Sass、import、URL 和外部 src 保持各自的处理入口。

真实 HBuilderX 5.34 Vapor 的 `@vitejs/plugin-vue` 调用 compiler-sfc 时使用默认 `ignoreEmpty=true`。无 src 的空白 style 不占请求索引；含 src（包括空属性值）或 CSS 注释的块仍占索引。提取器先过滤再编号，以独立 compiler-sfc descriptor 校验。转换器编辑仍保留空块；自闭合 scoped 载体在原位置展开，避免生成规则落到块外。

异步状态按文件保留当前事务及结算结果，样式读取同时追随替代通知和结算通知。旧任务失败仍由旧 transform 抛出，较新请求不会被过期失败击穿；当前失败持续传播，直至后续事务替换。身份核对与快照读取处于同一同步阶段。

成功事务统一发布样式快照、Harmony 来源、引用和生成规则。完整 SFC 的权威状态按文件替换，子请求只补充尚无权威状态的来源；删除后保留空状态，防止晚到子请求复活旧规则。最终 bundle 按真实模块图选取有效来源，保留 watch 缓存模块；权威来源为空时禁止从旧 sourcemap 回退恢复规则。

保留 #1319 已合入的零宽重置、基础类注入和作者覆盖顺序；没有新增公开 API、关闭 preflight、合并所有 style 或改动厂商文件。

## 验证

以下命令在独立安装依赖的本任务 worktree 执行，Node 24.22.1、pnpm 12.15.0：

```sh
pnpm --filter weapp-tailwindcss exec vitest run test/uni-app-x test/bundlers/sfc-style-boundary.unit.test.ts test/bundlers/sfc-style-work.unit.test.ts test/bundlers/vite-css-memory.test.ts test/bundlers/shared/generator-css/source-files.test.ts test/bundlers/vite-sfc-style-source.unit.test.ts test/bundlers/vite-framework-watch-snapshot.unit.test.ts test/bundlers/vite-sfc-style-snapshot.unit.test.ts test/ci/architecture-contract.test.ts test/ci/framework-boundaries.test.ts test/ci/generation-ownership.test.ts test/source-line-limit.test.ts --update=none
pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-scoped-generator-sources.unit.test.ts test/bundlers/vite-scoped-generator.unit.test.ts test/bundlers/vite-watch-css-output.test.ts test/bundlers/vite-watch-css-post.unit.test.ts test/bundlers/vite-framework-runtime-facts.unit.test.ts --update=none
pnpm --filter weapp-tailwindcss build
pnpm architecture:check
pnpm agents:check
pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false
```

最新两批复验合计 41 文件、460 项通过，包含原四项失败语义、实际 bundle 删除/替换/文件退出、异步交错、错误恢复、POSIX/Windows/UNC/相对 module id，以及属性内 `>`、CRLF、嵌套模板、空块、多块、预处理器、外部 src、CSS 伪标签和扫描伪指令。另补无作者 style 的完整 SFC 请求：没有对应块时跳过 CSS，已发布的生成块 override 仍生效，空 override 清除旧样式。包的 ESM/CJS 与声明构建通过；架构及规则检查通过。

验收器的 replace 与 append 现在组合成一次保存，避免丢失 append 或产生额外原生重载；Web 同文件追加也保持一次保存。四个辅助测试文件共 42 项通过：

```sh
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hbuilderx-source-mutations.test.ts e2e/hbuilderx-local-helpers.test.ts e2e/issue-1144-runner.test.ts e2e/hbuilderx-attach.test.ts --update=none
```

这些测试不启动设备，也不作为原始平台的通过证据。

另补 e2e 私有的外部 CSS 独立更新入口：父 SFC 字节保持不变，外部文件须预先登记到原生恢复清单；每步等待新编译同步、实际节点与产物内容变化，停止与恢复仍由原 runner 统一负责。失败不能被吞掉或通过后续重试覆盖，原生停止未知时保留源码现场。以下四个离线回归文件共 54 项通过，包含 Windows/UNC/相对路径、软链、串行更新、falsy 拒绝值和清理边界：

```sh
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hbuilderx-app-process-cleanup.test.ts e2e/hbuilderx-source-only.test.ts e2e/hbuilderx-hmr-lifecycle.test.ts e2e/hbuilderx-source-mutations.test.ts --update=none
```

临时原工程矩阵还修正了追加普通 style 与既有 scoped 规则优先级不同导致的误判；新增块保持对应作用域，逐步保存产物哈希。20 项矩阵/恢复离线检查及 10 项编译 hook 追踪检查通过，仍不等同于设备矩阵通过。

PR 首轮 CI 的真实 H5 构建发现新增 `watchChange` 未同步 Vite 静态槽声明。补充经过延迟插件入口的删除回归，在旧声明上报同一初始化错误；登记钩子后，30 项槽位/事务回归和 4 项框架组装回归通过。没有移除或放宽声明校验。

完整 CI 后续发现 `uni-app-x/vite.ts` 为 502 行，超过既有 500 行门槛；本地同一回归先复现失败，再将 bundle 样式占位与 Harmony 产物注入整体提取至 `vite/style-placeholder.ts`。原入口降至 443 行，新模块 103 行，不删空行凑数或放宽规则；原有实际 bundle 与事务回归继续验证相同行为，行数回归纳入上述 460 项。

`2ac24b4d13a950f723703a49b64109ab18ec65bf` 的 [Mpx benchmark 首次失败](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41405977435/job/125148401524) 记录构建插件中位耗时 909→991ms、构建峰值 RSS 1091.01→1179.13MB、稳态 RSS 1034.70→1102.87MB、HMR 峰值 RSS 1439.58→1554.29MB 和稳态 RSS 1427.78→1534.14MB；均超过原有 5% 门槛。[Taro Vite 首次失败](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41405977435/job/125148401537) 为 HMR 插件 p95 1711→1857ms，三次样本中两次回归。原始 job 日志、Mpx benchmark/GC artifacts 与 Taro benchmark artifacts 已保存，不能据其他检查成功忽略这些失败；没有通过提高阈值或反复重跑放行。

补充确定的解析工作量回归后，对无 `<style` 的 Vue-like 输入直接返回空样式；可能包含标签时继续使用顶层解析器，Svelte 在负判定前独立分派。同一次 CSS memory 刷新只解析一次，规范化前后字符串不同时分别解析；来源扫描的指令与 import 遍历共享同一解析结果。没有跨刷新全局缓存或长期持有 AST。七项新增回归同时断言解析次数、生成块索引变化、删除、外部 src 空槽和来源扫描结果。局部 kernel 的八索引刷新中位耗时由约 3.827ms 降至 0.537ms，实际七个 Mpx 源码合计约 0.113→0.031ms；这些局部数据不能证明整条 Mpx/Taro CI 性能门禁已通过。

`1a555c150d91ab873c2f10f6629f2fe4729b5f4e` 的全部 PR 检查随后结束：233 项成功、29 项按条件跳过、3 项失败。失败为 [Taro Webpack 构建](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41411745466/job/125166515552)、[Uni Vite HMR RSS](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41411745466/job/125166515523) 及性能汇总。Taro 构建中位耗时 18805.03→20063.41ms，增加 6.69%；Uni HMR 峰值 RSS 1065.46→1228.52MB、稳态 1044.55→1129.44MB，反序确认仍超预算。首次原日志均保留，没有重跑或调整原门槛。

同一源码以 Node 24.22.1 在本地完成一次 Uni `--input-diagnostics`：固定基线 `80efee1e22769557c4c73308c546f446c929320a`，三次构建、同 watcher 三轮修改和回滚。实际 worker 身份与两侧入口均已核对；不能把本地 Node 24 的诊断当作 Linux Node 22.23.4 的正式预算结论。归一工程根后，初始候选快照相同；首次修改时扫描快照与真实模板产物的更新时序不同，后续 watch 事件次数也不同，因此额外的 service 重建尚不能归为性能根因。当前记录缺失具体失效 id 与命中原因，新增仅对 Uni input 准备副本生效的追踪，保留 watchChange、compiler.invalidate、每个 root 的依赖/候选命中和版本变化、服务失效身份。单次 iterable 不预消费，未注册 observer 时不求诊断详情，不主动 GC，不改正式预算和关闭顺序。6 个定向测试文件共 64 项通过，包含真实 Node fixture、异常传播、锚点原子失败和固定观测上限；诊断补丁本身不计为性能修复。

进一步确认普通 Uni 的 generator、watch 与来源收集会对同一完整 SFC 重复构建模板 AST。现在每个 CSS memory 实例维护最多 128 个文件的 LRU，仅保存当前 raw/prepared 全文身份与冻结的扁平 style 元数据，文本相同时共用对象，不保留 AST。来源扫描的权威空文本与空 style 继续优先，规范化前后索引分别保存；子请求不能覆盖完整文档，remove、prune 与 dispose 同步淘汰。generator 单次请求只取一次快照，watch 跨消费者复用。新增两个快照测试文件，并复验 scoped 生成、watch 输出与框架组装；上列两批共 460 项通过。独立只读审查没有发现接入阻塞。缓存统计仅为逻辑字符量，不能据此推断进程 RSS 或声明性能门禁已修复。

唯一 Linux input 诊断 [run 41434891295](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41434891295) 固定优化前源码 `1da466c008b6f125996d557256ec329e23ce8302` 与基线 `80efee1e22769557c4c73308c546f446c929320a`，仅执行 Uni mp-weixin 的三次构建、三轮 HMR。该 run 已结束，日志与 artifacts 分析单独保留；新快照代码没有改变其输入，也没有再次调度相同诊断。诊断成功不等同于正式性能预算通过。

类型检查仍失败，仅保留已在基线复现的五项诊断：`generic-web-production-fast-path.ts:100` 的 TS2379；`weapp-tw-web-rpx-finalize-loader.ts:28` 的 TS2322、34/35 的 TS4111、40 的 TS2345。本次没有新增诊断，不能据此写成类型检查通过。

原始手动入口的故障快照先保存为忽略目录中的 `main-80efee1e-failure.snap`，然后仅对该入口生成修复版 static 基线，并复验不更新：

```sh
pnpm exec vitest run --config e2e/fixtures/issue-1325-style-boundary.vitest.ts --update=all
pnpm exec vitest run --config e2e/fixtures/issue-1325-style-boundary.vitest.ts --update=none
```

两次均 5 项通过；常规包单测同时保留独立正确性断言。快照记录完整 SFC、转换结果及三个索引的请求/返回。修复前日志和快照保留，未用成功重跑覆盖失败。

真实 H5 构建的 `e2e/issue-1319-static.test.ts` 以 `--update=none` 复验 1 项通过，已有产物快照无差异；这仅证明构建输出，不计入原生运行态验收。

## 原工程与设备验收

原工程仍固定 `cq112233/unibestX@b239192f46611f51877aef48ca851b4c67c47f44`，A 使用原锁 npm 5.6.3，B 使用修复版完整运行时闭包。B 原验收目录在恢复时已不存在，因此从同一原提交重新建立独立副本并安装，没有复制 A 的可写依赖目录。旧 B 的源码归档、tarball、安装 receipt、编译失败及截图继续保留。

微信原 AppID `wx6d379a8c0aff3ea3` 的打开错误已通过原生 UI 查明为“登录用户不是该小程序的开发者”，不是样式结论。保留截图 `wechat-permission/original.png`，未重置登录或修改票据。用户随后明确授权验收副本使用 weapp-tailwindcss demo AppID `wxb3d842a4a7e3440d`；新验收通过原工程现有 `VITE_WX_APPID` 配置入口覆盖并重新预检，记录该差异。

HBuilderX 固定 5.34.2026102909；iOS 最初绑定 iPhone 18 Pro / iOS 27.2，后续按用户授权切换现有设备，分别记录运行环境。隐私页“同意并进入应用”的既有授权保留。旧预检均已关闭或阻断，不能复用；全部设备验收仍须新 prepare、当前会话 computer use、verify 和领取。

B 在 `8ef80b1` 后重打 R3 完整运行时闭包，旧 R2 receipt 保留。21 个 tarball 及实际可达的 21 个包、1374 个文件、36 条内部运行时依赖边均逐一核对；不把 pnpm store 中旧版本实例误计为当前入口。R3 实际 Vite CJS 入口 SHA256 为 `d4fce46a49241624487cfe60e548a2dc5529a2b7d5a46d971ea4f3292fa5c1ad`，B 锁哈希为 `d92e5b2a345bc5a0ff9e1e08247f38441848ae0e8e42b1917031e589dd399ca9`。A/B 直接依赖锁差异仅为 `weapp-tailwindcss`；Tailwind 4.3.3、Vue 3.5.44、Vite 5.2.8 及 DCloud 配套版本保持原锁。B 的 `pnpm install --frozen-lockfile --ignore-scripts` 通过。tarball 没有原生 `.node` 二进制，本轮消费 JS 后端。

CI 行数修复后，以 `7f85958ecb399cc7f104155a0f505026a3713ed4` 的运行时代码重新构建并打包 R4；后续提交仅补充本记录。21 个 tarball、实际可达的 21 个包、1375 个文件和 36 条内部依赖边均核对一致，B 的独立 frozen install 通过。R4 实际 Vite CJS 入口 SHA256 为 `8fd3a38703e3aa0fdad0fc87f4246e8edb4cb8243996346fb7256cdd965fac8d`，B 锁哈希为 `b41105b24aa64289347cb3bdcd2123f0778c8d8680a4249056ce6ac2e3fb0b90`。再次核对 A/B 直接依赖锁，差异仍仅为 `weapp-tailwindcss`；上述 Tailwind、Vue、Vite 与 DCloud 版本保持一致。旧 R3 证据保留；R4 安装核对不计为设备验收通过。

性能解析工作量优化后，以 `c4031d58c` 的运行时代码重建 R5。21 个 tarball、实际可达的 21 个包、1375 个文件及 36 条内部运行时依赖边均逐一核对，独立 frozen install 通过。实际 Vite CJS 入口 SHA256 为 `1b21c931d235a88b0ca88e3964c118721bab48e50e1bb24dab997fc75b7f86c3`，B 锁 SHA256 为 `a36590cb639a3fb5bad77191cc21306cc7466426bd83299b200427d796fd761a`。A/B 直接依赖锁差异仍仅为 `weapp-tailwindcss`；Tailwind、Vue、Vite 和 DCloud 版本保持一致。R4 现场保留，R5 安装审计不代表设备验收通过。

原工程的 `manifest.config.ts` 虽注释声称回退原 manifest，实际会把未提供环境变量的 DCloud AppID 和 uniCloud spaceId 置空。A/B 均通过原生成入口显式保留原提交的 `VITE_DCLOUD_APPID`、`VITE_UNICLOUD_SPACE_ID`，同时提供用户授权的 `VITE_WX_APPID`；后续受控启动继承同一环境，避免构建时再次清空。此为验收环境固定，不修改原工程厂商或业务代码。

用户明确选择 Pixel 5 后，经 Android Studio 启动已安装的 `Pixel_5`，核对为 `emulator-5554`。本轮 `87910ff3-2d48-4e4e-8a90-8025b99334fe` 的 prepare 中微信、HBuilderX、iOS、Android、Harmony、Web 全通过；Chrome 原生入口超时后，另起本轮预检，以应用内入口完成真实 AX 读取、截图、输入、点击及完成回执，保留实际调用记录。随后 verify 的微信再次在 `App.getCurrentPage` 超时，门禁仍阻断。此前原生 UI 保存的基础库 3.17.6 错误为 `appLaunch with non-empty page stack`，不是业务样式结论。所有失败报告和截图均保留；没有复用失败报告继续设备调度。

同时修正了预检自身的确定缺陷：仅 prepare 创建临时微信 fixture，成功运行并关闭后封存；verify/live 只读校验，来源被篡改时失败，不再重写六个文件后继续。四个定向回归文件共 96 项通过。修正后的新轮次 `a896c308-9139-4725-a6fd-eb01925bbb95` 中 prepare 和真实 computer use 均通过，verify 仍在 `App.getCurrentPage within 1979ms` 超时，收尾截图也超时。因此该修正不能被描述为 IDE 卡死的唯一根因。已阻断并结束本轮服务、关闭任务浏览器页，保留用户 IDE 与设备会话；后续须安全恢复 IDE 后重新预检。

用户随后确认没有其他窗口并授权受控重启。通过当前会话原生应用控制正常退出所选 Stable IDE，核对原 PID 退出及新实例，关闭重启自动恢复的本任务旧探针窗口后重新 prepare。新轮次 `0232e901-3de6-4a6c-a710-9e5538505e54` 的登录查询通过，但微信仍阻断，其余平台脚本探针通过；未进入 computer use 门禁或任何产品设备验收。实际 automator 1.4.0 在成功的 `Tool.getInfo` 握手后执行三十秒 `waitForAppReady`，最后一笔 `App.getCurrentPage` 的剩余时限为 1984ms；这不是整轮只等待两秒。截图另收到 IDE 的 `timeout waiting for automator response`，未发现可据此放宽门禁的确定预检实现错误。报告、原日志和重启后的项目列表截图保留，账号与用户配置未重置。

随后只运行一次带 `DEBUG=automator:protocol` 的有界微信 worker 诊断，使用全新 UUID 和独立临时项目，不生成可领取报告。IDE 2.02.2608080、SDK 3.17.5 的握手原响应保存；四次 `App.getCurrentPage` 中，前两次返回 `getPageMetaByWebviewId(null)` 元数据错误，后两次取得有效 pageId/path，随后真实节点、点击、数据和截图均成功，worker 正常退出。此结果说明该次短暂未就绪由现有轮询收敛，不能反推旧超时的唯一根因，也不能替代新的全端预检。此前 UI 的 SDK 3.17.6 记录继续单列，不与本次握手混报。

新的 `50703b2d-e5a8-4951-bdad-e03dfa6179cb` 各平台脚本探针通过，当前会话 Chrome 原生入口超时后立即记录阻断并结束服务。切换应用内浏览器后重新建立 `7541b033-1082-4f12-9b8e-989c88325b8d`，以真实 AX、输入、点击、PNG 和实际工具调用 ID 完成 computer use，verify 全部通过。但任务领取以 `pnpm exec` 启动，实际 PATH 比 prepare/verify 的脚本运行环境少了同一 pnpm 安装的 `node-gyp-bin`，完整身份比较正确阻断，设备测试尚未启动。本轮已结束并关闭任务标签页。任务启动器现固定这个实际工具目录，仍执行完整身份比较；只读身份核对通过，下一轮须随新代码重新 prepare，不复用已阻断报告。

全端 `1172` 轮次完成新 prepare、真实 computer use、verify 和领取后，B R5 在 iOS 27.2 的原首页已完成 Vapor 编译，未再次出现 `mp-html` 的 `Unknown word`；捕获 1 次带本轮 token 的 App Launch，但隐私页仍覆盖首页。Device Hub 未显示该运行窗口，未取得真实节点，最终截图超时，运行态证据为 0。该次编译成功只缩小编译故障范围，不算首屏或样式验收通过；runner 正常停止、源码恢复确认，首次失败保留。

用户随后授权 iOS 27.0；该 runtime 明确报 `runtime path not found`，未启动产品测试。用户改为授权使用当前已有模拟器后，选择现有 iPhone 17 Pro / iOS 26.5。新全端 `66231b5a` 的 prepare、当前会话真实交互、verify 与完整身份领取均通过；微信旧任务服务锁仅在确认原进程已退出、项目归属本任务且 IDE 回到项目列表后归档回收，账号与用户配置保持原样。该轮先完成上述 Uni 诊断，再启动 B R5 原首页。

iOS 26.5 这次在 600000ms 内未生成开发产物，App Launch 和节点证据均为 0。HBuilderX 原日志表明其先下载缺失的 `launcher-x-vapor-ios-simulator@5.34.2026102719`，遭遇 HTTP/2 `ContentReSendError` 和读取超时，尚未进入编译；已安装的带 `-arm64` 组件是另一基座，不能替代。当前会话 UI 也显示“iOS模拟器(x86_64)正在下载”。已按多端手册请求用户完成官方组件下载，没有复制、重命名基座或修改厂商文件。独立的显示阻塞仍存在：同一 UUID 在 simctl 为 Booted、devicectl 为 shutdown，Device Hub 跳过 framebuffer 后保持 Disconnected，再启动报 NSError 405。两个首次失败现场均已保存，runner 停止与源码恢复确认，门禁关闭；恢复组件与设备显示后须重新完整预检。

## 适用边界

当前两个 Issue 的结论均为“验证未完成”：尚未取得修复版原首页的微信/Harmony Vapor 边框全序列，以及 Vapor+iOS 的十次冷启动和十轮连续更新。H5、VDOM、静态回归及 CI 不替代这些证据。后续按首次偏离记录编译、产物、节点与截图，严格 HMR 与原生重载分别统计。

Refs #1319，Refs #1325；不自动合并 PR 或关闭 Issue。

## 规则评估

沿用现有 SFC、构建图、生命周期、跨平台路径与原生证据规则；本次用共享实现和可执行回归固化边界，不新增 AGENTS 规则。
