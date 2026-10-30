# weapp-vite 运行时诊断规则

## 适用范围

- 本目录及通过显式 `--weapp-runtime-diagnostics` 建立的临时会话。

## 核心职责

- 对真实业务 bin 采集模块解析、加载、V8 parsed、累计分配及自然 GC 证据，流程与证据边界见 [README](README.md)。

## 变更原则

- 只允许无 Git 元数据的独立准备副本；不得改写生产源码、候选集合或正式性能预算。
- 业务 bin、manifest、preload helper、原始 profile 和事件流必须核对实际身份与字节哈希；wrapper 不能冒充业务进程。
- 不主动请求 GC、heap snapshot，不改变业务信号处理或关闭顺序；停止命令只释放本诊断资源。
- 输出观察不是 finalizer 成功或输入等价；resolve/load/parsed 各为不同证据层，均不能单独证明函数执行。
- 明示源码读取范围、未映射项和固定上限；超限或缺证失败，不能静默截断后声称完整。

## 测试要求

- 协议、worker 生命周期和模块钩子变更须覆盖真实 Node fixture、错误入口、失败收尾与工件完整性。
- 显式模式必须与正式预算及其他诊断互斥；普通模式不能新增异步边界、求值或环境变化。

## 推荐验证命令

- `pnpm exec vitest run -c benchmark/version-compare/vitest.config.mjs benchmark/version-compare/test/runtime-diagnostics.test.mjs --update=none --maxWorkers=1`
- `pnpm agents:check`

## 提交前检查

- 不把诊断的时间/RSS 用于正式预算；确认首败、自然 GC 回调边界、helper 哈希和资源关闭记录完整。
