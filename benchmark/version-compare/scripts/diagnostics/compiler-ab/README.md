# Taro Webpack 编译器配套 A/B 诊断

这是独立的 `workflow_dispatch` 诊断，不参与正式性能 check，也不改变正式保留的 Taro 4.3.1 / Webpack 5.91.0 目标。

两侧从同一准确源码 SHA 的 `git archive` 创建无 `.git` 临时副本，各自安装依赖。current 保留原锁与 Webpack 5.91.0；previous 仅在副本里用 pnpm override 切换到 `0e9ceb82321d49d145bf63c4adf84c7a8639e0e9` 的 Webpack 5.105.4、准确直接配套与原补丁，重新生成锁并 frozen install。

锁审查允许目标 demo 的 Webpack，以及实际发生版本变化的直接配套之完整依赖闭包。临时副本仅改该 demo manifest 的精确 `5.91.0` 声明；对 `@tarojs/{webpack5-runner,taro-loader,webpack5-prebundle}@4.3.1` 分别设置父包限定的 `>webpack` override，对新 Webpack 的直接配套也使用父包限定。保留其它项目和原 `5.91.0` 补丁，另加准确基线的 `5.105.4` 补丁。只有这三个 Taro 包的精确 Webpack peer `5.91.0→5.105.4` 可变；其它 peer、metadata、依赖边、catalog 和 importer 必须保持一致。两侧实际解析的 runner、loader、prebundle、压缩器、Webpack、PostCSS、补丁文件和编译器文件 hash 另行核对。不能只凭 install 成功认定差异轴成立。

固定 Linux / Node 22.23.4，每侧三次新进程的生产完整冷构建，顺序为 current/previous、previous/current、current/previous。保持原 demo 的 cache/prebundle、mainFields、压缩器及全部编译工作，清理本诊断副本的输出与编译缓存。每轮最长 300 秒，失败即保留首败，不重试、不改变阈值。

记录自然 GC、主 Node 与进程树 RSS、worker_threads 创建及峰值、实际 options/mainFields、OPTIMIZE_SIZE 前后及全部 processAssets 完成后的内存和逐资产 bytes/SHA256。phase 内存在资产正文求值前记录；完整 hash 使用 `source.source()`，其耗时与之后内存单列。该求值可能物化源码缓存，必须把结果解释为对称诊断。map 计数只包含实际 `.map` 资产和 related sourceMap 元数据，不调用 `source.map()`。最终磁盘输出也逐文件记录完整 bytes/hash。

证据超限、部分写入、缺少观测、依赖漂移和采样失败均使诊断失败。Git 读取固定 30 秒、archive/tar 固定 120 秒、安装/准备构建固定 20 分钟、测量构建固定 300 秒；终止阶段先 TERM，1.5 秒后 KILL，再独立确认进程组消失与 close/reap。无法确认停止时保留副本及归属，记录首错和清理错。不会主动 GC、关闭压缩、改变生产配置，或把诊断结果当作正式门禁通过。

本地仅执行无依赖 fixture：

```sh
node --test benchmark/version-compare/scripts/diagnostics/compiler-ab/test.mjs
```

需要在独立诊断 workflow 中运行的完整命令：

```sh
node benchmark/version-compare/scripts/diagnostics/compiler-ab/run.mjs --out-dir .tmp/taro-compiler-ab
```

输出包含原锁 SHA、新锁、两侧 workspace 配置、原 Webpack 补丁、允许闭包与全部差异、真实依赖身份、每轮构建日志、自然 GC、逐资产 manifest、options、RSS 明细和汇总。成功或失败后，仅在确认本轮进程已经停止后清理临时副本；证据目录保留给 artifact 上传。

私有 GC preload 保留正式观察器的 2048 事件、256 单批及 2MiB 上限，并在正常退出时先领取 `takeRecords()`，再停止观察、结算并写入绑定 PID/session 的结束回执。它只在主线程领取文件，继承 preload 的 worker thread 不争用同一 PID 的文件。成功仅证明本进程 observer 在结束前收到的事件完整，不代表 VM 或其它线程的全部 GC。缺尾、身份不符、截断或 stderr 写入错误均报告 `GC evidence unavailable` 并使实验失败；共享正式 preload 与性能门禁保持原样。

pnpm 工具链与 workspace 的多个 YAML document 分别保留：按目标 demo 领取唯一 workspace 锁，其余 document 必须跨侧完全一致。锁审查同时验证 settings、checksum、明确的 override/补丁切换、非轴补丁 hash 和 snapshot metadata。联合细分 snapshot 图以保留边名和非编译器 peer 绑定；无法区分的不透明 peer context 直接失败。只有准确 `5.91.0→5.105.4` 引用可进入编译器轴；现代 `5.112.2` 的完整版本、补丁及 peer 上下文和闭包外配套引用必须保持一致。

pnpm `12.15.0` 的子依赖 selector 采用[范围交集](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/package-manager/src/overrides/selectors.rs#L16)，`webpack@5.91.0` 和 `webpack@=5.91.0` 都会改写 `^5`、`*` 等宽 peer，不能用作隔离实验。父包限定先按[包名与版本过滤](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/package-manager/src/overrides.rs#L216)。`fixtures/pnpm12-selector-output.json` 保存真实 pnpm 三项目安装的最小输出和原锁 SHA：两个全局 selector 均改写宽 peer，父包限定加目标 manifest 切换保留宽 peer 与现代编译器。首轮诊断 run `40874665892` 因全局 selector 导致的非轴 metadata/真实 Vite 与 Webpack 绑定漂移而在 prepare 阶段失败，没有执行 A/B 测量；原始日志和官方 artifact 必须保留。
