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

源码修改先完整写入同目录临时文件，再原子替换目标文件，保留现有权限。真实 watcher 回归检查连续替换时只读到完整版本，避免文件截断与写入之间触发编译。

锁文件中的 Rollup 4.63.0 使用 [watcher 补丁](../../../patches/rollup@4.63.0.patch)：同一构建任务共用文件 watcher，transform dependency 单独记录失效语义。原版在 Linux 对普通模块和 transform dependency 重复监听同一文件，原子替换后会停止响应后续修改。[CJS/ESM 回归](./rollup-watch.test.mjs) 同时检查直接导入、虚拟模块消费方、连续修改与删除后重建。补丁仅随本仓库冻结依赖应用，不随 weapp-tailwindcss npm 包安装；后续升级 Rollup 时必须复验并评估移除，不能只改版本号。

Nitro 2.13.4 的 [externals 补丁](../../../patches/nitropack@2.13.4.patch) 在匹配内联规则前规范化解析后的 module ID。原版只规范化原始 ID，Windows 原生反斜杠路径会漏掉 `nuxt/dist` 内联规则，让 Nuxt 4.6 的 SSR renderer 在 Node 中未经开发环境变换直接加载，导致 manifest 缺失和 HTTP 500。[发行包 resolver 回归](./nitro-externals.test.mjs) 覆盖 POSIX、Windows 盘符、根目录、UNC、pnpm 嵌套路径、相对导入及更具体的 external 规则；真实 Nuxt demo 继续验证 SSR、静态基线与连续 Web 更新。补丁仅随本仓库冻结安装生效，不随产品 npm 包发布；[上游 resolver](https://github.com/nitrojs/nitro/blob/v2.13.4/src/build/plugins/externals.ts) 发布等价修复后，先复验再移除补丁与锁文件登记。

开发验收使用 demo 默认 watcher，不强加 Watchpack 或 Chokidar polling。短间隔磁盘轮询会将 Webpack 虚拟模块反复报告为缺失，使慢编译持续空转；真实虚拟模块回归要求空闲时稳定、实际更新后重建并再次稳定。Windows 专项连续执行三次完整 H5 流程，额外保存失效事件来源与 watcher 身份。

Mpx CLI 2.2.30 的首轮就绪 Promise 不能接收后续致命错误；原版会吞掉错误，在 MultiCompiler 关闭所有 watcher 后以 0 退出。[CLI 补丁](../../../patches/@mpxjs__vue-cli-plugin-mpx@2.2.30.patch) 将增量致命错误独立报告并设置非零退出码，[真实 MultiCompiler 回归](./mpx-fatal-watch.test.mjs) 同时验证首轮失败和普通编译错误后的恢复。旧的 `dev:e2e-watch` 包装器也不再用定时器掩盖子进程退出。补丁仅作用于本仓库冻结安装，不随 npm 包发布；[上游实现](https://github.com/mpx-ecology/mpx-cli/blob/next/packages/vue-cli-plugin-mpx/commands/serve/mp.js) 发布等价修复后，复验上述回归再移除补丁与锁文件登记。

动态产物通过 `snapshotOutput` 的共享读取句柄归档，避免 Windows CopyFileW 阻塞编译器写入；Mpx 需要本轮完成日志才开始读取。归档副本仍需通过当前轮次标识和样式断言，读取失败不能忽略。`fixtures/output-copy-race.cjs` 对照旧复制方式和新读取方式的真实并发写入，要求新方式零错误。

`DEMO_MATRIX_WATCH_DIAGNOSTICS=1` 可记录真实文件 watcher 的创建/关闭调用栈和退出前的 Webpack 阶段，不创建保活句柄。手动触发 Demo Watch Diagnostic 的 `mpx` 输入会按原始 wx/ali/swan/tt 分片顺序在 Windows Node 22/24 复验；普通日志保持关闭以减少时序干扰。自然退出的原始错误仍需单独归因，重跑通过不代表首次故障已修复。

静态语义基线位于 `e2e/__snapshots__/demo-matrix/`；完整产物、版本、SHA、执行命令、阶段结果、构建日志和浏览器截图位于 `e2e/.artifacts/demo-matrix/`。`DEMO_MATRIX_ARTIFACT_DIR` 可指定本地输出目录。

浏览器就绪要求探针出现、本地 script/stylesheet 请求结束和开发更新通道握手；不要求后台请求或开发遮罩达到全页面 networkidle。逐轮验收继续检查真实 CSS、DOM、类名和计算样式。

只有新主文档响应重置请求与握手状态，hash/history 路由跳转保留同一文档的连接；真实浏览器回归同时覆盖客户端路由和整页重载。

## PR Gate

[demo-matrix.yml](../../../.github/workflows/demo-matrix.yml) 在各操作系统使用根 `package.json#packageManager` 声明的 pnpm 版本冻结安装锁文件并构建当前包。所有目标必须执行成功；最终 gate 对照清单检查每个 OS/Node/目标和全部阶段、提交 SHA、pnpm 版本，不接受缺失、重复、过期或跳过的报告。PR Gate 对启用的矩阵要求 success。CI 证据只对报告中的具体提交有效，本机通过不能替代 Windows/Linux 验收。

Webpack JSX 测试探针会暴露当前 module.hot 状态。DOM 与样式已渲染后仍须等待 HMR 回到 idle，再写入下一轮内容，避免启动期间旧更新尚在 prepare/apply 时触发重叠更新；其余浏览器与产物断言保持不变。

Webpack 5.105.4 的 [only-dev-server 客户端](https://github.com/webpack/webpack/blob/v5.105.4/hot/only-dev-server.js) 将 `hot.check()` 和 `hot.apply()` 分开调用；检查结束后加载新的异步 chunk 会让状态从 ready 回到 prepare，导致 apply 拒绝并停在 ready。[依赖补丁](../../../patches/webpack@5.105.4.patch) 使用 `hot.check(applyOptions)`，由 runtime 等待正在加载的 chunk 后应用更新，保留原有 ignore 选项和错误回调。[真实浏览器回归](./webpack-hmr.test.mjs) 在 ready 时启动异步 chunk，检查更新值和 idle 状态；不能通过放宽 idle 门槛或刷新兜底隐藏竞态。补丁只随本仓库冻结依赖安装，不随产品 npm 包发布；上游发布等价修复后，先复验再删除补丁及锁文件登记。

POSIX 收尾仅向本次进程树拥有的组发送信号。macOS 对仅剩僵尸进程的组可能返回 `EPERM`；此时读取 `ps` 的 PGID 与状态，仅确认组已空或全部为 Z 时视为终止。仍有活进程、状态缺失或读取失败必须报告错误。[进程组信号回归](./process-group-signal.test.mjs) 覆盖这些边界，并在 macOS 构造真实僵尸组；Windows 继续使用原有 taskkill 路径。
