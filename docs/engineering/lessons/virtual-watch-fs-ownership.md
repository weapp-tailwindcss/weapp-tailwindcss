---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1320
baseline: db117f17e9083ab0a4575a46dc15e364569563d6
regressions:
  - scripts/ci/demo-matrix/watch.test.mjs
  - scripts/ci/demo-matrix/virtual-removals.test.mjs
  - scripts/ci/demo-matrix/process-completion.test.mjs
---

# 虚拟文件的监听存在性边界

## 症状

依赖升级后的本地完整 57 阶段验收在第 26 阶段失败：默认虚拟模块夹具空闲编译三次，超过既有上限二次。第 1–25 阶段通过，第 27–57 阶段未执行，不能将网站阶段或远端 CI 的成功视为整轮完成。

该轮网站三浏览器禁止更新验收实际完成：2124 passed、636 既有范围 skip、无 flaky/retry/result error。1204 次整图断言包含全部 20 张超高图；这些成功仅绑定上述源码和网站阶段。

## 根因与纠正

准确起始基线 e769e69b97c88b379a80d3cabca4fa20330b999a 的夹具实际解析 Webpack 5.105.4、Watchpack 2.5.2；升级后 Taro runner 固定 Webpack 5.91.0，解析 Watchpack 2.6.3。不能声称新旧 Webpack 版本相同。事件探针记录到 `scan (missing in initial scan)`，随后又出现 `watch (missing on attach)`。

Watchpack 2.6.3 的 macOS FSEventStream 启停后重新扫描会推进目录初始扫描完成时间。下一次挂载 watcher 时，纯虚拟文件在磁盘上依然缺失，错误触发 remove 和聚合重建。强制 polling 同样能够触发该边界。现代 Webpack 5.112.2 与 Watchpack 2.6.3 也能复现；仅给 Taro 降级 Watchpack 无法覆盖问题，且现代 Webpack 明确要求 `^2.6.3`。

修复放在 webpack-virtual-modules 0.6.2 的输入文件系统边界。插件在 afterEnvironment 和 watchRun 核对当前 WatchFileSystem，包装该实例的 watch，在实际 Watchpack 创建后为其 `_onRemove` 安装实例守卫。每个事件从监听器实际输入文件系统读取当前 `_virtualFiles`；仅精确路径仍为 own property 时忽略磁盘伪删除。真实物理删除、所有权结束后的删除及同批 change 保持原路。WeakSet 防止多插件重复包装，不修改全局原型。

不能只过滤 `emit('remove')` 或最终 aggregated 通知：原 `_onRemove` 仍会删除 aggregatedChanges 中的真实 change；Webpack 的 getInfo/pause 路径也直接读取这些集合。不能在最终回调中直接 return，否则可能已消费 once listener 并暂停监听。当前守卫在上述状态变化之前执行；不删除祖先目录依赖、不关闭物理 rescan、不放宽时间或编译次数门槛。

官方实现依据：[webpack-virtual-modules 0.6.2](https://unpkg.com/webpack-virtual-modules@0.6.2/lib/index.js)、[Watchpack 2.6.3](https://unpkg.com/watchpack@2.6.3/lib/index.js)、[目录监听实现](https://unpkg.com/watchpack@2.6.3/lib/DirectoryWatcher.js)。本轮核对上游正式版仍为 0.6.2，master 也没有该守卫。已有 [Issue #155](https://github.com/sysgears/webpack-virtual-modules/issues/155) 与 [Webpack 5 支持 PR #69](https://github.com/sysgears/webpack-virtual-modules/pull/69) 属于相关历史，不能视为本次问题已经被上游修复。

## 验证

在上述基线加本次未提交修复的 macOS、Node 24.22.1 工作树执行：

- `CI=1 pnpm test:demo:matrix`：72 files、1222 tests 全部通过。
- `CI=1 pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/watch.test.mjs scripts/ci/demo-matrix/virtual-removals.test.mjs --update=none`：20 项定向通过。
- 根与 Mpx、Taro Webpack、uni-app Vite 三个独立模板的 `pnpm install --frozen-lockfile` 全部通过；模板各自先用 `pnpm install --lockfile-only` 生成锁文件。

回归覆盖 Taro 5.91.0 和现代 5.112.2、默认与 polling 监听、空闲上限、产物 42→84、真实物理更新/删除报错/缺失恢复、同批混合事件和恢复产物 88。额外验证 pause 聚合集合、once listener、动态 FS/map/所有权、多个插件、替换 WatchFileSystem，以及 POSIX、Windows 反斜杠、盘符根目录和相对路径的精确身份。

新物理夹具首轮在 modern polling 的混合阶段失败：虚拟更新先触发构建，磁盘删除尚未被 polling 发现，读取的是旧模块缓存。夹具改为在真实物理 remove 通知中写入虚拟模块，固定被验证的事件关系，随后同一四组矩阵通过；不靠延长等待或重复碰运气放行。

原始事件探针、准确基线、失败和回归日志保留在忽略目录 `e2e/.artifacts/dependency-upgrade-20261028/`。本轮新的完整预检、全部本地阶段、受影响 static 生成/禁止更新和最终 head CI 尚须完成；本记录保持 partial。

## 同轮安全审计补充

补丁本身仅改变虚拟文件存在性判定；在加入安全更新之前，四份变化锁规范化移除本补丁身份后与 db117f17 的业务图完全相同。随后刷新 audit，发现已存在版本的公告返回发生变化，不能把数据库新增公告说成该监听补丁引入漏洞，也不能只记录风险而遗漏已有兼容修复。

上游 Taro components-react 的 Solid peer 为 `*`，允许将 Solid 1.9.10 升为同系列 1.9.17，再按其官方 `~1.6.8` 配套升级 seroval/seroval-plugins 至 1.6.12；没有强制突破旧 Solid 的 `~1.3.0` 子依赖范围。MCP 新补丁明确允许 Hono node-server 2.1 系列，按官方范围更新到 2.1.5。根及受影响独立模板由 pnpm 定向更新锁，不修改 manifest、公开 Node 范围或 peer 范围。最终安装、锁图与审计结论以本轮最终采集为准。

Vue I18n 9 的 legacy 正式通道仍为 9.14.5：部分新公告要求 11.4.14，另有公告没有 patched_versions；DCloud 内部配套及 Mpx bridge 仍绑定 9 代，继续登记上游回补或专项迁移。公告撤回也不等于本仓库修复漏洞。

## 适用边界

补丁同时登记根及三个实际包含 0.6.2 的独立模板。uni-app Vite 模板的 unplugin 间接安装该包，但 Vite 构建不执行 Webpack 守卫；仍同步安装补丁，不能把它写成真实 Webpack 覆盖。uni-app Webpack 的 0.4.6 及其余四个不包含 0.6.2 的模板保持原锁。

插件接入沿用所审 Webpack 5.91.0/5.112.2 的异步 attach 行为，不声明任意自定义同步 WatchFileSystem 都已验证。此补丁不修复 Taro 固定 Webpack 的安全公告，也不扩大框架支持代际。上游正式版实现等价虚拟存在性边界且通过本仓库全部默认/polling、混合事件和物理恢复回归后，升级并删除根、三个模板的补丁与锁登记。

## 规则评估

不新增规则；沿用构建图取证、真实解析身份、根因回归及独立模板锁文件要求。[此前夹具包边界修复](virtual-watch-fixture-boundary.md) 的历史证据继续保留，其“polling 负对照应失败”只描述当时尚未修复虚拟 FS 边界的依赖版本，不能继续作为本补丁的期望行为。


## Windows 后续失败与监听交接

1403f2b6 的 Windows Node 24 诊断工作流在前置 `pnpm test:demo:matrix` 发现两个失败，尚未进入真实 demo watch 诊断：一项是物理/虚拟夹具第一次物理更新后的稳态检查，另一项是外源样式采集测试的 30 秒总超时。不能据此宣称真实 demo watch 已失败或已验收。

物理夹具的构建回调早于 Webpack 异步缓存收尾及下一轮 WatchFileSystem 挂载。新增握手按构建序号确认监听已接管，再发起下一次输入事务；物理内容在已存在的输出目录完成写入后 rename 替换，避免半写输入。原 10 秒就绪、1.5 秒初始观察、1 秒稳态窗口及初始最多两次构建均保留，非初始事务另明确要求恰好新增一次构建。失败日志记录当前轮次、不可变 watcher 代次、事件原因、modified/removed 图和回调时间线。macOS 受控实验将缓存收尾延迟 250ms，确认回调与监听挂载确实相差 250–306ms；该实验不能证明 Windows 原失败的每个磁盘事件因果，也不能把截断多事件假说当成已经复现的根因。

样式采集测试原外层预算为 30 秒，内部三个启动轮询却各自允许 180 秒，因而外层超时会抢先丢失启动阶段诊断。修复使本测试使用 20 秒共享启动截止，包含 launcher、页面创建、导航、文档 load、探针及更新传输；其他入口仍保留 Chromium 原 30 秒 launcher 上限。启动失败记录具体阶段及全部待完成请求，原第三方样式不参与本地采集的断言保持。SSR 夹具先加载 Vue 模块，再单独放行实际挂载，避免动态 import 的依赖发现和页面重载混入 hydration 门控。页面创建或检查证据写入失败时仍回收已归属浏览器，并保留并发错误。当前证据不能确认原超时具体卡在外源请求、启动还是清理；修复预算与资源边界后，仍需以准确新 head 的 Windows CI 验证，不靠提高原 30 秒门槛或重跑旧提交放行。

整合 main 的 0e9ceb823 时保留双方 CI 用例，由 pnpm 工具重新生成根锁并完成 frozen install。锁结构审计确认仅引入 main 的 postcss-pxtrans 1.1.0、postcss-rem-to-responsive-pixel 7.0.9 与 converter 0.3.0 配套及必要引用；其余解析图和补丁不变。原有本地与远端成功仍绑定各自旧 head/base，不能转移到整合后的提交。最终 static、完整多端和新 head CI 尚待完成，本记录继续保持 partial。

## 构建进程终止的原始证据

准确 3b06ba9af15b1605c09a3eee752de7e94a7bc22a 的 107 项 static 禁止更新复验在前八项通过后，Taro React Native 构建于 Metro 欢迎信息之后停止。`execa@9.6.1` 在进程被信号终止时没有 `exitCode`；旧 `complete()` 仅断言退出码为零，因而用 `undefined !== 0` 的新断言遮蔽了原始 ExecaError、信号及原因。既有日志不足以还原原信号和发送者，不能将这次失败归因为 Metro 编译错误，也不把它解释为成功退出。

修复在完成边界直接传播 Execa 的失败对象，正常退出仍须严格等于零，原构建超时不变。使用实际 Node 子进程分别非零退出和被 SIGTERM 终止，两项回归在修复前均失败，修复后保持原错误对象及其 stderr、退出码和信号；连同停止、轮询和进程组信号回归，四文件 21 项通过，ESLint、agents:check 与 diff 检查通过。上述验证包含 3b06 后未提交的本节修复。随后独立 RN 构建和带进程诊断的相同探针用例均 exit 0；后者仍严格核对 static 基线，没有刷新基线。这些有界诊断未复现原终止，不能抹去首轮失败；当前源码的正常模式验收仍须重新执行。
