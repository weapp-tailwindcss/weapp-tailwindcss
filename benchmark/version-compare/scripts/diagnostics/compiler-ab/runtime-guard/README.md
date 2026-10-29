# 运行时守卫证据

此守卫只用于 compiler A/B 诊断，两侧使用相同 bootstrap、模块钩子、进程包装和同步收据协议。钩子、包身份识别及 NDJSON 写入有观测开销，诊断结果不能替代正式性能门禁。

守卫必须先于 phase preload 执行。它不替换模块 specifier、URL、加载结果或编译器实现，不发起 GC，不额外等待业务任务，也不修改生产资源的关闭顺序。原有 `NODE_OPTIONS`、`execArgv`、环境、参数、回调、输出与 `execFile` 的 promisify 契约保留；仅前置固定 bootstrap 与关联字段。业务正常返回原值，已禁止的模块消费另写不可撤销收据，即使内部捕获异常并以 0 退出，controller 仍拒绝该样本。

`webpack-cli` 按真实包归属识别，覆盖绝对路径、symlink、subpath 和缓存命中；仅解析 CLI 不算加载。Terser 的 CJS `require` 消费 esbuild 被拒绝。对于 Terser 的静态或动态 ESM 解析，Node 钩子不能区分 resolve-only 与已缓存模块的实际消费，因此记录 `unsupported` 并拒绝证据，不把无法观察的路径报告为通过。

普通 Node 子进程和 Worker 均须留下父 intent/start/close 与独立 ready、bootstrap/runtime 哈希、PID/thread 的完整关联。`env: {}`、空 `execArgv`、嵌套 Worker、`SHARE_ENV` 和 ESM 命名导入使用同一协议。shell 和无法证明的启动方式直接拒绝。

原生 helper 只接受 controller 从实际安装副本领取的精确 realpath、SHA256 与完整 argv 白名单。它免 Node ready，reader 再核对身份。原生 `execFileSync` 不暴露可独立关联的 PID，因此不支持。

官方 esbuild 的同步服务会对 Worker、native helper 及管道执行 `unref()`；root 自然退出不会等待它们的 JS exit/close。只有固定 `0.21.5` / `0.28.2` 官方 `lib/main.js` 的完整 SHA、版本、manifest、Worker 入口、native SHA/argv 和父子层级全部一致，且真实成功调用的最终引用状态为 unref 时，才允许独立 OS 停止路径。两份入口摘要来自各自 npm tarball 的 SRI 验证，见 [0.21.5 发布源码](https://unpkg.com/esbuild@0.21.5/lib/main.js)与 [0.28.2 发布源码](https://unpkg.com/esbuild@0.28.2/lib/main.js)，固定身份保存在 `service-sources.mjs`。源码仅同名、同版本或包归属相同均不足以获得资格。

每个 bootstrap isolate 通过 Linux `/proc/thread-self` 将 Node threadId 绑定真实 TID，再记录 task/process starttime 与 boot ID。native start 另通过 `/proc/PID/exe` 的真实句柄记录 SHA、映像 device/inode 和 argv，核对前后出生身份与 exe 链接；不能改读可能被原位替换的普通磁盘路径。外部 controller 必须独立至少见到一次匹配的活身份，复核 executable、native SHA、父子与进程组归属。root 真实 exit/close 0 后、任何清理信号前，controller 最多被动观察 1000ms，分别确认根出生身份、精确 task 与 helper 实例消失；PID/TID 被新出生身份复用只证明旧实例消失，不改绑或操作新实例。同一实例处于 Z 仍未 reap，不能按进程组消失放行，观察失败或未确认停止时保留临时副本。

`external-termination.json` 保存首见、最后存活、首次发现消失和最后复核的时间区间、root close 与全部 controller signal 尝试。它不推断精确退出时刻、独立退出码或退出原因；内部缺 close 保持 `close: null` / `internalCloseComplete: false`，另记 `thread-stopped-at-root-boundary` 或 `observed-stopped-after-root-exit`，`statusKnown: false` 且 code/signal/cause 为 unknown。普通资源、缺 unref、ref 恢复、无首见活、权限错误、超时或清理信号污染均拒绝。业务内部不增加 await/ref/stop，不改关闭顺序，信号后的消失仅作为清理结果，不能回填成功证据。

observer 从启动起始终可导出合法 JSON 的 partial 快照及首错。已观察的文件 inode 和全部字节（含半行）只能追加，删除、替换、截断或改写均失败；最终 reader 对同一次读取的 Buffer 核对摘要后再解析。收据限制为 1024 文件、合计 16MiB，超限失败。构建进程耗时与外部停止确认耗时分别记录，不把首次发现消失当作精确退出时刻。

本地 fixture 使用 builtin Node 和临时伪包，不运行真实框架构建。Linux 专项 fixture 额外调用本 worktree 已安装的官方 esbuild 做一次最小 transformSync，验证真实 worker/helper 的 unref 边界；Mac 不具备 `/proc`，该项只在固定 Linux / Node 22.23.4 诊断 CI 执行。其它身份、停止与负例通过平台无关 fixture 验证。
