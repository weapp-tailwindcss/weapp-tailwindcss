# P0 诊断事件与性能门禁实现说明

## 事件口径

编译诊断事件使用 schema version 1，阶段限定为 `scan`、`candidate`、`generate`、`postcss`、`emit` 和 `hmr`。事件可携带 revision、operationId、耗时、缓存结果、模块/源码身份、错误和证据引用。旧的 source/bundle/hot-update 事件仍可通过同一个事件总线发送。

`redactCompilationPath` 只保留项目根目录下的相对路径；根目录外只保留 basename，并统一处理 Windows 反斜杠，避免把本机绝对路径写入诊断产物。JSONL 使用逐事件 JSON 序列化，摘要用于 CI 和本地日志首屏展示。

## 性能口径

`summarizeSamples` 对有限数值计算样本数、P50、P95、P99；`evaluatePercentileGuard` 在任一侧样本不足或缺少有限 P95 时返回 `unavailable`，否则按可配置相对阈值判断是否通过。冷启动、预热和稳态样本应由调用方分别收集，避免混合统计。

本次先提供稳定的统计原语和回归测试，后续接入现有 `benchmark/version-compare` 采样器时应复用这些函数，并将阶段数据写入既有 JSON/Markdown artifact。P95/P99 门禁不改变现有 HMR 内存反向复测规则。

## 兼容边界

本次没有修改 bundler 输出路径、源码扫描边界或 Tailwind 生成方式，也没有增加官方 Tailwind 插件。完整的 Vite/Webpack/PostCSS 生命周期事件接入和 CI 阶段 artifact 聚合应在后续提交中沿用上述 schema 与统计口径。
