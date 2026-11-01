# Demo 三系统验收

清单以 [catalog.mjs](./catalog.mjs) 为准，包含全部 28 个 demo、107 个可移植 CLI 目标组合。每个组合在 Windows、macOS、Linux 的 Node 24 上执行；Node 22 覆盖 Taro Vite/Webpack React/Vue、uni、Mpx、Gulp、weapp-vite、Rsbuild React、Nuxt 的关键入口，共 159 个 job。清单测试会核对 demo manifest，新增 demo 或构建脚本未登记时失败。

## 验收边界

| 类型 | 验收内容 | 边界 |
| --- | --- | --- |
| utilities | 生产静态基线、普通 dev 首编译、同一进程替换/新增/删除、Web 刷新及计算样式 | 小程序仅检查真实模板/JS 消费的类名和可达样式图，不代替 IDE 或设备运行 |
| authored-styles | 样式注入 demo 的生产、dev、连续修改及 Web 刷新 | 这些 demo 没有 Tailwind 生成接入，只验证其已有样式注入能力 |
| native-build | Taro RN CLI 构建、实际应用注册及页面探针进入 bundle | 保持 disabled 配置，不提供 utility 样式或 Android/iOS 设备覆盖 |
| webview-build | Taro harmony-hybrid、uni app 的 CLI 构建及 utility 产物 | 不提供原生桥接或设备运行证据 |
| HBuilderX 专属 | uni-app-x-vapor 在清单中明确登记 | 无可移植 CLI，不加入成功计数；Harmony IDE/设备验收另行执行 |

普通 utility 同时检查 `h-8`、`h-20`、`h-50`、`mt-2`、`flex`、`text-slate-500`、spacing 定义或内联值一致性，以及任意值和透明色对照。期望间距来自配置与实际产物，按倍数检查，不能拿某个模板的默认数值套用所有 demo。页面探针同时具有唯一 id、本轮标记、文本和真实 class 属性，孤立字符串不能充当消费证据。

五个 Taro React/Vue 夹具的 H5 与 Harmony hybrid 生产产物还默认启动后台 Chromium，检查独立尺寸、间距、颜色和像素参考。Harmony 的普通浏览器证据只验证 WebView 产物，不代表原生桥接或设备运行通过；报告缺少生产证据或部分属性错误必须被拒绝。

静态基线只记录探针实际引用的 spacing 变量；已内联的规则检查数值与倍数，主题中残留的未使用声明不参与等价比较。完整 CSS 仍随 artifact 保存；任何规则引用 `var(--spacing)` 却没有定义时必须失败。

Taro 目标包括 weapp、swan、alipay、tt、h5、qq、jd、harmony-hybrid、rn；分包 demo 按现有脚本覆盖五个目标。uni 主 demo 覆盖九个小程序、H5/SSR、三种 quickapp-webview 和 app；其他 uni demo 按现有 CLI 登记。Mpx 覆盖 wx/ali/swan/tt/dd，Gulp 覆盖 weapp/tt，Web Vite/Webpack/Rsbuild 同时覆盖 web/weapp 模式，另含 Vite 7 和 Nuxt。

## 本地执行

```sh
pnpm install --frozen-lockfile
pnpm build:ci
pnpm exec playwright install chromium
pnpm test:demo:matrix
pnpm e2e:demo:matrix taro-vite-react-tailwindcss-v4:swan
```

更新指定目标基线必须显式执行，然后执行不更新的同一命令：

```sh
pnpm e2e:demo:matrix issue-uview-plus-cssentries:mp-alipay --update
pnpm e2e:demo:matrix issue-uview-plus-cssentries:mp-alipay
```

运行器临时向已登记源码插入探针，在 finally 中恢复。不要在同一 demo 上并发运行测试或编辑。`--build-only` 仅供本地诊断，不能当作完整通过，CI 禁止使用它和 `--update`。

weapp-vite 的首轮产物写出早于监听初始化完成；首次修改前必须等到“小程序初次构建完成”和“开发服务已就绪”日志，不能仅凭探针产物存在发起修改。后续轮次仍核验本轮标识、类名和样式产物，不使用额外延时或重试修改掩盖丢失事件。

weapp-vite 7.7.0 已包含运行时兼容检查、信号与会话关闭，以及宿主 `transform-dynamic-import` 的上游修复；宿主仍在同一 `renderChunk` 中使用官方 CommonJS 转换，保留 Promise 拒绝、动态表达式单次求值、拆包和 source map。[真实产物回归](./weapp-vite-engine-compat.test.mjs) 执行拆分 chunk，不能通过自定义动态加载器掩盖转换遗漏。升级 weapp-vite 后，须先复验本目录三项 weapp-vite 回归及真实 HMR。

Taro React demo 与 Taro/Mpx 独立模板的 legacy ESLint 配置使用各消费项目显式声明的插件及 TS parser，避免 pnpm 隔离安装后从错误的依赖图解析。行为回归见 [framework-eslint.test.mjs](./framework-eslint.test.mjs)；独立模板在自己的冻结安装后执行同一合同，覆盖允许项、错误项、TS/JS 与 `.mpx` 解析边界。Mpx demo 的本地配置仍未启用这些规则，不能借用模板结果宣称其 lint 通过。

Taro RN 4.3.1 的样式规则仍导入 Stylelint 私有的 `declarationValueIndex.cjs`，该文件在 16.11.0 已删除，因此 RN 消费链精确保留 16.10.0。runner 同时显式持有 Stylelint 和规则插件，避免配置包的同名 peer 从普通项目取得 Stylelint 17 上下文中的插件；普通项目继续使用 17，上游 `^16` peer 声明保持原样。[真实消费链回归](./taro-rn-stylelint.test.mjs) 覆盖六个 RN demo 的物理解析、Node lint 和 RN PostCSS API。上游移除该私有接口依赖后，须先通过这些行为回归与 RN 构建，再移除局部 provider 和版本约束。

源码修改先完整写入同目录临时文件，再原子替换目标文件，保留现有权限。真实 watcher 回归检查连续替换时只读到完整版本，避免文件截断与写入之间触发编译。

本仓库为 Rollup [3.30.0](../../../patches/rollup@3.30.0.patch) 和 [4.65.1](../../../patches/rollup@4.65.1.patch) 登记 watcher 补丁：同一构建任务共用文件 watcher，transform dependency 单独记录失效语义。内置 Chokidar 的原生回调在 5ms 节流窗口内可能丢掉最后一次修改或删除；补丁合并通知后读取最终磁盘状态，并在 unwatch/close 时取消属于旧订阅的尾部任务。文件身份改变时，底层先重绑当前句柄再触发构建失效，避免 Linux/FreeBSD 上层异步 unwatch/add 留下监听空窗；不能把 BUNDLE_END 当作原生订阅就绪回执。

多个逻辑 owner 还可能共享同一个 `FsWatchInstances` 容器；只关闭单个 owner 再订阅会复用其他 owner 保留的旧文件句柄。补丁将实际 stat 的设备与 inode 身份传入原生订阅，在同一个容器内创建新句柄后切换当前代并关闭旧代，保留所有 owner 的通知与释放归属。旧代事件和异步错误不得广播到新代，创建失败保留现有 owner，未知或零 inode 不触发重复换代。[共享原生句柄回归](./rollup-native-shared-container.test.mjs) 固定这些边界，并通过真实 `_handleFile` 分支验证身份传递。

各版本共用缺失文件恢复的所有权规则：多个目录中的文件删除后，临时父目录订阅与明确缺失的定时对账由同一 owner 释放；重建、unwatch 或 close 都结束该 owner，旧 stat 和迟到定时器不能恢复它。权限及资源错误继续报告，不作为缺失重试。[多目录回归](./rollup-recreation-multi-directory.test.mjs) 和 `rollup-recreation-*.test.mjs` 从实际消费方解析各版本的 CJS/ESM，覆盖原生订阅尚未就绪、清理和错误边界；详见 [Windows 删除重建复盘](../../../docs/engineering/lessons/rollup-missing-file-recovery.md)。

父子依赖采用互不包含的根路径组成物理订阅组；同一路径的不同模块 ID 共用归属，普通文件仍共享一个组。每组只通知自己仍活跃的依赖，撤销根路径时释放该子树的句柄、恢复任务和扫描流。Chokidar 会保留撤销产生的 ignore，因此发生撤销的组继续服务现有根，但不接收新根；最后一个根退出即关闭，不保留历史空组，也不放宽用户的 ignored 配置。登记与事件归属通过路径祖先索引查询，构建轮次保留的依赖不重复安装订阅。[父子归属回归](./rollup-hierarchical-ownership.test.mjs)、[异步目录退役回归](./rollup-directory-retirement.test.mjs) 与 [分组生命周期回归](./rollup-watch-groups.test.mjs) 覆盖双向退役、历史 ignore、迟到扫描、原始模块 ID、跨平台路径、普通来源与 transform 的独立通知及完整关闭链路。[原生关闭异常回归](./rollup-close-errors.test.mjs) 将失败注入真实登记的 closer，要求同组其余资源仍释放，已退役的异步 closer 由最终关闭继续等待并报告错误；长期 watch 的异步清理失败只保留首错和累计次数，最终报告数量，避免积累错误对象；[不完整扫描回归](./rollup-directory-errors.test.mjs) 要求 error/close 仅结束扫描等待，只有完整 end 才确认文件删除。

[CJS/ESM 回归](./rollup-watch.test.mjs) 保留直接导入、虚拟消费方、连续修改、删除 ERROR 与重建产物检查；[节流与关闭回归](./rollup-native-delete.test.mjs) 和 [订阅连续性回归](./rollup-native-subscription.test.mjs) 固定边界时序。补丁仅随本仓库冻结依赖应用，不随 weapp-tailwindcss npm 包安装；[上游 Rollup FileWatcher](https://github.com/rollup/rollup/blob/v4.65.1/src/watch/fileWatcher.ts) 与其内置 Chokidar 发布等价修复后，必须对实际 demo 解析版本运行本目录全部 rollup-*.test.mjs，确认删除、重建、polling、关闭和原生身份回归通过，再移除对应补丁及锁文件登记。

Nitro 2.13.5 的 [externals 补丁](../../../patches/nitropack@2.13.5.patch) 在匹配内联规则前规范化解析后的 module ID。原版只规范化原始 ID，Windows 原生反斜杠路径会漏掉 `nuxt/dist` 内联规则，让 Nuxt 4.6 的 SSR renderer 在 Node 中未经开发环境变换直接加载，导致 manifest 缺失和 HTTP 500。[发行包 resolver 回归](./nitro-externals.test.mjs) 覆盖 POSIX、Windows 盘符、根目录、UNC、pnpm 嵌套路径、相对导入及更具体的 external 规则；真实 Nuxt demo 继续验证 SSR、静态基线与连续 Web 更新。补丁仅随本仓库冻结安装生效，不随产品 npm 包发布；[上游 resolver](https://github.com/nitrojs/nitro/blob/v2.13.5/src/build/plugins/externals.ts) 发布等价修复后，先复验再移除补丁与锁文件登记。

Taro 4.3.1 的 Harmony hybrid 平台原来只登记 Webpack 适配，Vite 产物会缺平台 alias、组件初始化和框架 hooks。[平台补丁](../../../patches/@tarojs__plugin-platform-harmony-hybrid@4.3.1.patch) 从 compiler context 与平台 getter 接入 Vite，复用上游 API 转换并显式登记 Babel 依赖；[React](../../../patches/@tarojs__plugin-framework-react@4.3.1.patch) 与 [Vue3](../../../patches/@tarojs__plugin-framework-vue3@4.3.1.patch) 补丁在开发 optimizer、生产 load 两入口识别真实 hybrid API，保留普通 H5 的绑定方式。[runner 补丁](../../../patches/@tarojs__vite-runner@4.3.1.patch) 等待异步 `modifyViteConfig`，并让 SPA/MPA 按真实 buildAdapter 使用 Harmony 的 rem 策略。回归执行发行包的插件钩子、真实 Babel 转换及生成脚本，覆盖已有元数据、Windows 模块字面量和路径归属；生产矩阵继续验证实际输出。补丁仅随本仓库冻结安装生效，不随产品 npm 包发布；[上游 Taro 4.3.1](https://github.com/NervJS/taro/tree/v4.3.1/packages) 发布等价修复后，必须先运行本目录 `taro-*.test.mjs` 与五个项目的 H5/Harmony 生产矩阵，再移除四份补丁、packageExtensions 和锁文件登记。

开发验收使用 demo 默认 watcher，不强加 Watchpack 或 Chokidar polling。短间隔磁盘轮询会将 Webpack 虚拟模块反复报告为缺失，使慢编译持续空转；真实虚拟模块回归要求空闲时稳定、实际更新后重建并再次稳定。Windows 专项连续执行三次完整 H5 流程，额外保存失效事件来源与 watcher 身份。

Mpx CLI 2.2.32 的首轮就绪 Promise 不能接收后续致命错误；原版会吞掉错误，在 MultiCompiler 关闭所有 watcher 后以 0 退出。[CLI 补丁](../../../patches/@mpxjs__vue-cli-plugin-mpx@2.2.32.patch) 将增量致命错误独立报告并设置非零退出码，[真实 MultiCompiler 回归](./mpx-fatal-watch.test.mjs) 同时验证首轮失败和普通编译错误后的恢复。旧的 `dev:e2e-watch` 包装器也不再用定时器掩盖子进程退出。补丁仅作用于本仓库冻结安装，不随 npm 包发布；[上游实现](https://github.com/mpx-ecology/mpx-cli/blob/next/packages/vue-cli-plugin-mpx/commands/serve/mp.js) 发布等价修复后，复验上述回归再移除补丁与锁文件登记。

动态产物通过 `snapshotOutput` 的共享读取句柄归档，避免 Windows CopyFileW 阻塞编译器写入；Mpx 需要本轮完成日志才开始读取。归档副本仍需通过当前轮次标识和样式断言，读取失败不能忽略。`fixtures/output-copy-race.cjs` 对照旧复制方式和新读取方式的真实并发写入，要求新方式零错误。

`DEMO_MATRIX_WATCH_DIAGNOSTICS=1` 可记录真实文件 watcher 的创建/关闭调用栈和退出前的 Webpack 阶段，不创建保活句柄。手动触发 Demo Watch Diagnostic 的 `mpx` 输入会按原始 wx/ali/swan/tt 分片顺序在 Windows Node 22/24 复验；普通日志保持关闭以减少时序干扰。自然退出的原始错误仍需单独归因，重跑通过不代表首次故障已修复。

静态语义基线位于 `e2e/__snapshots__/demo-matrix/`；完整产物、版本、SHA、执行命令、阶段结果、构建日志和浏览器截图位于 `e2e/.artifacts/demo-matrix/`。`DEMO_MATRIX_ARTIFACT_DIR` 可指定本地输出目录。

浏览器就绪要求探针出现、本地 script/stylesheet 请求结束和开发更新通道握手；不要求后台请求或开发遮罩达到全页面 networkidle。逐轮验收继续检查真实 CSS、DOM、类名和计算样式。

只有新主文档响应重置请求与握手状态，hash/history 路由跳转保留同一文档的连接；真实浏览器回归同时覆盖客户端路由和整页重载。

## PR Gate

[demo-matrix.yml](../../../.github/workflows/demo-matrix.yml) 在各操作系统使用根 `package.json#packageManager` 声明的 pnpm 版本冻结安装锁文件并构建当前包。所有目标必须执行成功；最终 gate 对照清单检查每个 OS/Node/目标和全部阶段、提交 SHA、pnpm 版本，不接受缺失、重复、过期或跳过的报告。PR Gate 对启用的矩阵要求 success。CI 证据只对报告中的具体提交有效，本机通过不能替代 Windows/Linux 验收。

同一 run 的局部重跑复用 OS、Node 和 shard 的 artifact 名称；上传启用 `overwrite: true`，在保存本轮报告前替换该分片的旧产物。否则 GitHub 可保留两份同名 artifact，按名称下载可能取到上一轮失败报告，让已经成功的分片无法通过汇总。需要保留首次失败时，应在重跑前按 artifact ID 归档日志与产物。门禁仍要求所有分片成功及完整证据，不过滤失败报告；根因和回归见[局部重跑产物复盘](../../../docs/engineering/lessons/portable-artifact-rerun.md)。

Webpack JSX 测试探针会暴露当前 module.hot 状态。DOM 与样式已渲染后仍须等待 HMR 回到 idle，再写入下一轮内容，避免启动期间旧更新尚在 prepare/apply 时触发重叠更新；其余浏览器与产物断言保持不变。

Webpack 的 [only-dev-server 客户端](https://github.com/webpack/webpack/blob/v5.112.2/hot/only-dev-server.js) 将 `hot.check()` 和 `hot.apply()` 分开调用；检查结束后加载新的异步 chunk 会让状态从 ready 回到 prepare，导致 apply 拒绝并停在 ready。[5.112.2 补丁](../../../patches/webpack@5.112.2.patch) 和 Taro 配套的 [5.91.0 补丁](../../../patches/webpack@5.91.0.patch) 使用 `hot.check(applyOptions)`，由 runtime 等待正在加载的 chunk 后应用更新，保留原有 ignore 选项和错误回调。独立 Taro Webpack 模板登记自己的 5.91.0 补丁。[真实浏览器回归](./webpack-hmr.test.mjs) 分别从根和 Taro 消费方解析完整 runtime、客户端和 emitter，在 ready 时启动异步 chunk，检查更新值和 idle 状态；不能通过放宽 idle 门槛或刷新兜底隐藏竞态。补丁只随本仓库冻结依赖安装，不随产品 npm 包发布；上游发布等价修复后，先复验再删除对应补丁及锁文件登记。

POSIX 收尾仅向本次进程树拥有的组发送信号。macOS 对仅剩僵尸进程的组可能返回 `EPERM`；此时读取 `ps` 的 PGID 与状态，仅确认组已空或全部为 Z 时视为终止。系统进程表中其他组的状态可能不可读，应先按 PGID 筛出目标组再验证状态。目标组仍有活进程、目标组状态缺失、进程组编号无效或读取失败必须报告错误。[进程组信号回归](./process-group-signal.test.mjs) 覆盖这些边界，并在 macOS 构造真实僵尸组；Windows 继续使用原有 taskkill 路径。
