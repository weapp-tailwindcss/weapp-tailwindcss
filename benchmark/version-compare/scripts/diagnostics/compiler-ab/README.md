# Webpack 编译器及其可选 esbuild peer 上下文 A/B

这是固定 Linux / Node 22.23.4 的独立 `workflow_dispatch` 诊断，保留正式 Taro 4.3.1 / Webpack 5.91.0 目标、性能预算与全部真实编译工作。结果作为编译器配套的因果证据，不能代替正式性能门禁或平台验收。

两侧来自同一准确源码 SHA 的 `git archive`，均为无 `.git` 临时副本、独立安装依赖。原正式锁与 workspace 配置完整归档并记录 SHA；current 和 previous 均使用工具生成的派生锁，分别执行 frozen install 并核对锁 SHA。

对称工具 metadata 规范化单独审查：仅允许准确 `@expo/bunyan@4.0.1`、原归档 SRI 的缺失 `engines` 补为 `{ node: ">=0.10.0" }`。每轮从固定官方 registry 保存版本与完整 packument 原响应，并下载同 SRI tarball，核对固定 SHA1/SHA256、manifest SHA256 和旧 `engines: ["node >=0.10.0"]` 形态；记录实际 Node 22.23.4 的兼容收据。首次工具派生若保留字段缺失，比较参考也保持原样；若补写精确官方对象，才记录 `applied: true`，不能强迫写入或接受两侧不对称。比较参考是原锁逻辑对象的明确副本，保存为 JSON，不是 pnpm 生成锁；原字节及 SHA 保持。两侧派生锁的完整 bunyan 条目必须等于该参考，其它 metadata/绑定/图仍按原严格规则检查。请求共用 60 秒截止并限制压缩与解压证据大小，不加载发布实现。

两侧先用 `pnpm install --lockfile-only --no-frozen-lockfile --ignore-scripts` 生成锁，完成来源、规范化、CLI 隔离、编译器轴与全图预验后，才分别完整 frozen install，并复核锁 SHA 与配置。该顺序提前发现漂移；lockfile-only 本身仍可能补写已核实的 registry metadata。

先对两侧精确移除 `webpack@5.91.0>webpack-cli`、`webpack@5.105.4>webpack-cli` 与 `webpack-dev-server@4.15.2>webpack-cli` 的可选 peer。original→current 的严格审查只允许这两种准确 consumer 的可选边/meta 移除及可证明的上下文传播，保留原 CLI 三个 context 的版本、其它绑定和 metadata。CLI 指向同一 WDS4 的引用仅能去掉该 WDS4 的 CLI peer group。现代 Webpack 5.112.2 逐项原样；不能机械删除全图 CLI 或改变其它平台/工具依赖。

previous 在该派生锁上，将目标 demo manifest 的准确 Webpack `5.91.0` 切为 `5.105.4`。配套来源为准确基线 `0e9ceb82321d49d145bf63c4adf84c7a8639e0e9`，保留原补丁，加入该基线的 Webpack 5.105.4 补丁。对子依赖仅使用三个 `@tarojs/{webpack5-runner,taro-loader,webpack5-prebundle}@4.3.1` 的父包限定 override，Webpack 直接配套也精确限定父包。

本轮明确增加一条配套轴：目标 `dependencies:@tarojs/taro → optionalDependencies:webpack` 的 Webpack 5.91.0 / Terser 5.6.1 / esbuild 0.21.5 上下文，合入目标直接 Webpack 5.105.4 / Terser 5.6.1 / esbuild 0.28.2 上下文。完整旧/新编译器、直接 Terser 附着边、实际 esbuild 引用和最短路径写入 `optionalEsbuildMerge`。Terser 源码/版本、其它依赖、metadata 与嵌套 peer 精确相等；全图其它 esbuild 绑定和源码身份不得归一化。该额外变化来自实际锁图首败，不能声称实验只改了 Webpack 单一版本。

逐 importer 从 dependencies/devDependencies/optionalDependencies 构建实际可达图并联合细分。目标 manifest 作为初始轴授权，其它 importer 只有经过三个准确 Taro parent 才能进入轴；未获授权路径保持准确 Webpack 与配套身份。每个 importer 独立保留 opaque context 唯一性，避免把不同 importer 的可证明 context 分裂当成全局歧义，也不能把同一入口的真实双绑定合并。所有新增/移除 snapshot 必须有授权路径、全部 incoming 和源码身份；不可达快照与非轴路径消费的轴包 snapshot 保持原样。全局 package metadata、锁配置、catalog、工具链 YAML document、补丁与无关引用另行审查。

运行时 bootstrap 在 phase/GC observer 之前安装同步 CJS/ESM 加载守卫，并传播到 main/child/worker。所有实际 webpack-cli 加载都拒绝；从 Terser 实现消费 esbuild 同样拒绝。固定 Terser 5.6.1 的实际入口为 `dist/utils.js` 内两处 `require("esbuild")`，其异常可能被自身 catch，因此控制器独立审核不可撤销 violation，不能只看退出码。每个启动必须匹配 session/hash、ready 与父级 close/exit 回执；缺证使测量无效。普通其它来源的 esbuild 加载仍可进行；仅准确登记 realpath/SHA/参数的官方 esbuild 原生 service 可获放行。shell、未登记原生 helper 或无法证明传播的启动均阻断，不 stub 模块，不更改 specifier、加载结果或工作量。

每侧三次新进程生产完整冷构建，顺序为 current/previous、previous/current、current/previous。保留 demo 的 cache/prebundle、mainFields、生产压缩器与所有资产。记录主 Node/进程树 RSS、自然 GC、worker 创建/峰值、实际 options、OPTIMIZE_SIZE 前后及全部 processAssets 后的内存、逐资产 bytes/SHA256，磁盘输出也完整核对。phase 内存在 `source.source()` 求值/哈希前记录，哈希成本与之后内存另存；该操作可能物化缓存源码，必须解释为对称诊断。map 只统计实际资产与 related.sourceMap，不调用 `source.map()`。

每次构建最长 300 秒；Git 读取 30 秒、archive/tar 120 秒、安装/准备构建 20 分钟。失败不重试、不修改阈值，保留首败；TERM 1.5 秒后 KILL，并独立确认进程组消失与 close/reap。无法确认停止时保留临时副本及归属。证据超限、部分写入、缺少观测、图漂移或采样失败均使诊断失败，不主动请求 GC。

安装身份从已审计锁的目标 importer 取得种子，沿每条真实 dependency/optional 边核对版本、源码 metadata 与实际目录：同一 snapshot 必须指向同一目录，不同 snapshot 不得合并；仅锁明示不支持当前 OS/CPU/libc 的可选包可以缺席。单独记录项目 direct、runner、Taro、项目脚本重定向的 taro-loader、prebundle 与压缩器绑定。批准加载的 Webpack 仅限 direct 与 runner 两个根的并集；同侧完整包文件必须逐项相同，只排除包内 `node_modules`，JS、JSON 和隐藏文件都参与。记录完整文件 hash、锁内 patch 身份、补丁原文 hash 与全部 snapshot incoming。

本轮真实图中，current 的 direct 编译器自带 Terser 绑定 esbuild 0.28.2，runner/Taro/loader/prebundle 的编译器自带 Terser 绑定 0.21.5；previous 的编译器上下文合入 0.28.2。runner 直接消费的主 Terser 及 CSS minimizer 则在两侧均保留自身 esbuild 0.21.5，不能与 Webpack 自带的 Terser 混为一谈。这些事实由原严格锁轴与安装图核验共同约束，没有增加新的依赖变化授权。

完整 Webpack 源码清单写入独立合同文件，bootstrap 与每个 isolate 的 ready 绑定其 SHA；实际加载按 canonical root、准确 snapshot 和逐文件 hash 审核，拒绝其它版本、其它补丁或额外上下文，并留下不可撤销加载证据。observer 重新从真实 runner 解析主 Compiler，核对 runner 入口与 Compiler/Compilation hash 后接入；合法 direct 模块仍可加载。其它批准类只在业务首次加载后被动接入，保留原 exports、this、参数、结果及异常，不为观测预加载 direct。每次主编译、子编译及三阶段都须对应批准的 runner 身份；额外 context 真实创建编译器、缺主编译或缺真实 runner 加载守卫均失败。

[40901901583](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40901901583) 在两侧完整 frozen install 后发现 direct/runner 上下文分裂，失败清理无误；artifact SHA/CRC 已验证。旧 observer 仅接入 direct 类，错误的目录相等断言提前阻断了测量。此修复核对并绑定真实 runner 类，仍未产生该轮 A/B 样本。

本地定向 fixture：

```sh
node --test benchmark/version-compare/scripts/diagnostics/compiler-ab/test.mjs
```

完整实验仅通过独立诊断 workflow 执行：

```sh
node benchmark/version-compare/scripts/diagnostics/compiler-ab/run.mjs --out-dir .tmp/taro-compiler-ab
```

artifact 包含原正式锁及 SHA、两侧派生锁/workspace/manifest、原补丁、差异轴与逐 importer 路径、可选配套合同、实际模块/实现 hash、加载守卫证据、每轮日志、GC、options、资产 hash 和 RSS。所有本轮进程确认停止后才清理副本。

历史首败必须保留：[40874665892](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40874665892) 暴露 pnpm12 全局 selector 改写宽 peer metadata；[40878658733](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40878658733) 暴露 Webpack/WDS 可选 CLI 双向 peer 上下文漂移。两次均在 prepare 阶段失败，未执行 A/B 测量。后续轻量锁预验又明确发现可选 Terser/esbuild 附着上下文变化，本合同按该证据建立。[40896320294](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40896320294) 在 original→current 的严格 metadata 审查中发现 bunyan engine 补写，artifact SHA/CRC 已验证，仅有这一项额外 metadata 变化；同 SRI 官方来源和最小 fresh 项目证明这是独立工具规范化，仍未产生 A/B 样本。不得以 fixture 或锁预验成功宣称框架性能验收通过。

pnpm `12.15.0` 的子依赖 selector 采用[范围交集](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/package-manager/src/overrides/selectors.rs#L16)，即使 `webpack@=5.91.0` 也会重写 `^5` 等宽 peer；[父包限定](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/package-manager/src/overrides.rs#L216)才按 consumer 身份隔离。真实最小安装证据位于 `fixtures/pnpm12-selector-output.json`。
