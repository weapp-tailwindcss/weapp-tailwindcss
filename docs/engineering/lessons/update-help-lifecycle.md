---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 0d2ddb800db22046ff7f0f5fe7527fb0117894fa
regressions:
  - packages/test-helper/test/update-packages/runner.test.ts
  - packages/test-helper/test/update-packages/process-signals.test.ts
  - packages/test-helper/test/pnpm-smart-proxy.test.ts
---

# 依赖更新帮助入口的副作用与子进程生命周期

## 症状

扩展验收的真实 CLI 冒烟超过 60 秒。原测试同步启动 `update-packages --help`，阻塞了 Vitest 的超时回调；单次串行诊断在原预算内用时 5.85 秒通过，因此不能将全面运行时的高负载超时认定为更新功能故障。

## 根因与纠正

帮助请求仍在执行前后扫描整个 workspace、解析锁文件并计算发布记录。代理只查找参数中是否含 `up/update`，还会把 `help up` 等请求当作升级，清理 metadata 并追加升级排除项。

现统一识别帮助请求，帮助路径原样转发且绕过快照与发布记录；前置目录、过滤、日志等全局参数不会把帮助目标误判成升级。正常升级仍先读取快照，成功后比较并生成记录。

同步冒烟改为有界异步子进程。两层 CLI 共用中断转发，代理等待 pnpm 的 `close` 后才退出，确保中断沿本任务的父子链传递并移除信号监听。Windows 分支按本层持有的 PID 使用有界 `taskkill /t /f`，不依赖 POSIX 信号处理。测试使用临时调用目录，但更新 CLI 的默认业务根仍为仓库根；帮助早返回才是避免全仓扫描的保证。

## 验证

- 帮助回归修复前 8 项失败；修复后三个测试文件共 37 项通过，0 失败、0 跳过。
- 真实三级子进程测试确认叶子进程就绪后，中断经 runner 和代理传递，等待关闭后该 PID 已退出。
- 命令：`CI=1 pnpm exec vitest run --project=@weapp-tailwindcss/test-helper packages/test-helper/test/update-packages/runner.test.ts packages/test-helper/test/update-packages/process-signals.test.ts packages/test-helper/test/pnpm-smart-proxy.test.ts --maxWorkers=1 --fileParallelism=false --update=none`。

## 适用边界

此次修改为仓库维护脚本，不改变公开包行为，也不调整原测试预算。真实子进程测试通过就绪文件触发父进程的信号事件，可跨平台验证转发和关闭。两个 CLI 测试均复用已有 `runOwnedWorker`，由测试父进程负责超时后的 POSIX 进程组或 Windows 进程树终止，不依赖被终止者执行 JavaScript。实际本地结果来自 macOS，不能代替 Windows 实机验收。

## 规则评估

不新增 AGENTS 规则；用帮助副作用、监听器释放和真实进程链回归约束边界。
