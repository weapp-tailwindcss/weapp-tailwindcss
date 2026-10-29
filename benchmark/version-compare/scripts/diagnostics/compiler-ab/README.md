# Taro Webpack 编译器配套 A/B 诊断

这是独立的 `workflow_dispatch` 诊断，不参与正式性能 check，也不改变正式保留的 Taro 4.3.1 / Webpack 5.91.0 目标。

两侧从同一准确源码 SHA 的 `git archive` 创建无 `.git` 临时副本，各自安装依赖。current 保留原锁与 Webpack 5.91.0；previous 仅在副本里用 pnpm override 切换到 `0e9ceb82321d49d145bf63c4adf84c7a8639e0e9` 的 Webpack 5.105.4、准确直接配套与原补丁，重新生成锁并 frozen install。

锁审查允许 Webpack 本身，以及实际发生版本变化的直接配套之完整依赖闭包。其它包的版本、metadata、依赖边、catalog 和 importer 必须保持一致；peer key 传播单列。两侧实际解析的 runner、Webpack、压缩器、PostCSS、补丁文件和编译器文件 hash 另行核对。不能只凭 install 成功认定差异轴成立。

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
