# 运行时守卫证据

此守卫只用于 compiler A/B 诊断，两侧使用相同 bootstrap、模块钩子、进程包装和同步收据协议。钩子、包身份识别及 NDJSON 写入有观测开销，诊断结果不能替代正式性能门禁。

守卫必须先于 phase preload 执行。它不替换模块 specifier、URL、加载结果或编译器实现，不发起 GC，不额外等待业务任务，也不修改生产资源的关闭顺序。原有 `NODE_OPTIONS`、`execArgv`、环境、参数、回调、输出与 `execFile` 的 promisify 契约保留；仅前置固定 bootstrap 与关联字段。业务正常返回原值，已禁止的模块消费另写不可撤销收据，即使内部捕获异常并以 0 退出，controller 仍拒绝该样本。

`webpack-cli` 按真实包归属识别，覆盖绝对路径、symlink、subpath 和缓存命中；仅解析 CLI 不算加载。Terser 的 CJS `require` 消费 esbuild 被拒绝。对于 Terser 的静态或动态 ESM 解析，Node 钩子不能区分 resolve-only 与已缓存模块的实际消费，因此记录 `unsupported` 并拒绝证据，不把无法观察的路径报告为通过。

Node 子进程和 Worker 均须留下父 intent/start/close 与独立 ready、bootstrap/runtime 哈希、PID/thread 的完整关联。`env: {}`、空 `execArgv`、嵌套 Worker、`SHARE_ENV` 和 ESM 命名导入使用同一协议。shell 和无法证明的启动方式直接拒绝。

原生 helper 只接受 controller 从实际安装副本领取的精确 realpath、SHA256 与完整 argv 白名单。它免 Node ready，仍须完整 start/close；reader 再核对身份。原生 `execFileSync` 不暴露可独立关联的 PID，因此不支持。服务 `unref()` 后若父进程来不及确认 close，也按缺证失败，不能增加等待或凭退出码默许通过。

本地 fixture 仅使用 builtin Node 和临时伪包，不运行真实框架构建。固定 Linux / Node 22.23.4 的诊断兼容性仍须由独立诊断 CI 验证。
