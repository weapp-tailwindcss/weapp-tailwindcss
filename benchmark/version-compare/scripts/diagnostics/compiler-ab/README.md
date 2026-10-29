# Webpack 编译器及其可选 esbuild peer 上下文 A/B

这是固定 Linux / Node 22.23.4 的独立 `workflow_dispatch` 诊断，保留正式 Taro 4.3.1 / Webpack 5.91.0 目标、性能预算与全部真实编译工作。结果作为编译器配套的因果证据，不能代替正式性能门禁或平台验收。

两侧来自同一准确源码 SHA 的 `git archive`，均为无 `.git` 临时副本、独立安装依赖。原正式锁与 workspace 配置完整归档并记录 SHA；current 和 previous 均使用工具生成的派生锁，分别执行 frozen install 并核对锁 SHA。

先对两侧精确移除 `webpack@5.91.0>webpack-cli`、`webpack@5.105.4>webpack-cli` 与 `webpack-dev-server@4.15.2>webpack-cli` 的可选 peer。original→current 的严格审查只允许这两种准确 consumer 的可选边/meta 移除及可证明的上下文传播，保留原 CLI 三个 context 的版本、其它绑定和 metadata。CLI 指向同一 WDS4 的引用仅能去掉该 WDS4 的 CLI peer group。现代 Webpack 5.112.2 逐项原样；不能机械删除全图 CLI 或改变其它平台/工具依赖。

previous 在该派生锁上，将目标 demo manifest 的准确 Webpack `5.91.0` 切为 `5.105.4`。配套来源为准确基线 `0e9ceb82321d49d145bf63c4adf84c7a8639e0e9`，保留原补丁，加入该基线的 Webpack 5.105.4 补丁。对子依赖仅使用三个 `@tarojs/{webpack5-runner,taro-loader,webpack5-prebundle}@4.3.1` 的父包限定 override，Webpack 直接配套也精确限定父包。

本轮明确增加一条配套轴：目标 `dependencies:@tarojs/taro → optionalDependencies:webpack` 的 Webpack 5.91.0 / Terser 5.6.1 / esbuild 0.21.5 上下文，合入目标直接 Webpack 5.105.4 / Terser 5.6.1 / esbuild 0.28.2 上下文。完整旧/新编译器、直接 Terser 附着边、实际 esbuild 引用和最短路径写入 `optionalEsbuildMerge`。Terser 源码/版本、其它依赖、metadata 与嵌套 peer 精确相等；全图其它 esbuild 绑定和源码身份不得归一化。该额外变化来自实际锁图首败，不能声称实验只改了 Webpack 单一版本。

逐 importer 从 dependencies/devDependencies/optionalDependencies 构建实际可达图并联合细分。目标 manifest 作为初始轴授权，其它 importer 只有经过三个准确 Taro parent 才能进入轴；未获授权路径保持准确 Webpack 与配套身份。每个 importer 独立保留 opaque context 唯一性，避免把不同 importer 的可证明 context 分裂当成全局歧义，也不能把同一入口的真实双绑定合并。所有新增/移除 snapshot 必须有授权路径、全部 incoming 和源码身份；不可达快照与非轴路径消费的轴包 snapshot 保持原样。全局 package metadata、锁配置、catalog、工具链 YAML document、补丁与无关引用另行审查。

运行时 bootstrap 在 phase/GC observer 之前安装同步 CJS/ESM 加载守卫，并传播到 main/child/worker。所有实际 webpack-cli 加载都拒绝；从 Terser 实现消费 esbuild 同样拒绝。固定 Terser 5.6.1 的实际入口为 `dist/utils.js` 内两处 `require("esbuild")`，其异常可能被自身 catch，因此控制器独立审核不可撤销 violation，不能只看退出码。每个启动必须匹配 session/hash、ready 与父级 close/exit 回执；缺证使测量无效。普通其它来源的 esbuild 加载仍可进行；仅准确登记 realpath/SHA/参数的官方 esbuild 原生 service 可获放行。shell、未登记原生 helper 或无法证明传播的启动均阻断，不 stub 模块，不更改 specifier、加载结果或工作量。

每侧三次新进程生产完整冷构建，顺序为 current/previous、previous/current、current/previous。保留 demo 的 cache/prebundle、mainFields、生产压缩器与所有资产。记录主 Node/进程树 RSS、自然 GC、worker 创建/峰值、实际 options、OPTIMIZE_SIZE 前后及全部 processAssets 后的内存、逐资产 bytes/SHA256，磁盘输出也完整核对。phase 内存在 `source.source()` 求值/哈希前记录，哈希成本与之后内存另存；该操作可能物化缓存源码，必须解释为对称诊断。map 只统计实际资产与 related.sourceMap，不调用 `source.map()`。

每次构建最长 300 秒；Git 读取 30 秒、archive/tar 120 秒、安装/准备构建 20 分钟。失败不重试、不修改阈值，保留首败；TERM 1.5 秒后 KILL，并独立确认进程组消失与 close/reap。无法确认停止时保留临时副本及归属。证据超限、部分写入、缺少观测、图漂移或采样失败均使诊断失败，不主动请求 GC。

本地定向 fixture：

```sh
node --test benchmark/version-compare/scripts/diagnostics/compiler-ab/test.mjs
```

完整实验仅通过独立诊断 workflow 执行：

```sh
node benchmark/version-compare/scripts/diagnostics/compiler-ab/run.mjs --out-dir .tmp/taro-compiler-ab
```

artifact 包含原正式锁及 SHA、两侧派生锁/workspace/manifest、原补丁、差异轴与逐 importer 路径、可选配套合同、实际模块/实现 hash、加载守卫证据、每轮日志、GC、options、资产 hash 和 RSS。所有本轮进程确认停止后才清理副本。

历史首败必须保留：[40874665892](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40874665892) 暴露 pnpm12 全局 selector 改写宽 peer metadata；[40878658733](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40878658733) 暴露 Webpack/WDS 可选 CLI 双向 peer 上下文漂移。两次均在 prepare 阶段失败，未执行 A/B 测量。后续轻量锁预验又明确发现可选 Terser/esbuild 附着上下文变化，本合同按该证据建立；不得以 fixture 或锁预验成功宣称框架性能验收通过。

pnpm `12.15.0` 的子依赖 selector 采用[范围交集](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/package-manager/src/overrides/selectors.rs#L16)，即使 `webpack@=5.91.0` 也会重写 `^5` 等宽 peer；[父包限定](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/package-manager/src/overrides.rs#L216)才按 consumer 身份隔离。真实最小安装证据位于 `fixtures/pnpm12-selector-output.json`。
