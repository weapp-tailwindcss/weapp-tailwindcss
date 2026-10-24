# Benchmark 诊断规则

## 适用范围

- 本目录及 `prepare.mjs` 创建的临时插桩副本。

## 核心职责

- 采集完整候选、来源和阶段证据，或包含已回收对象的统计分配样本。
- 操作入口和证据解释统一见 [README](README.md)。

## 变更原则

- 插桩只写入无 Git 元数据的 benchmark 准备副本；先验证全部 AST 锚点，再写入。两侧使用相同 observer 协议。
- 诊断不能改变正式预算、确认条件或生产关闭顺序；不能主动请求 GC。诊断 check 名称和并发组不得与正式门禁重名。
- 来源 key 只归一化已知工程根，实际内容保留完整哈希；没有源码映射的生成 chunk hash 不用于证明函数不同。
- 观测分配、缺失映射和固定上限必须显式记录；输出或采样超限使证据失败，不能静默截断后声明完整。

## 测试要求

- 修改 AST 锚点、worker 协议或关闭过程时，覆盖真实 Node fixture 和失败路径。
- 修改入口时，覆盖普通 PR 默认行为、独立诊断 check、输入校验和预算隔离。

## 推荐验证命令

- `pnpm exec vitest run -c benchmark/version-compare/vitest.config.mjs --update=none --maxWorkers=1`
- `pnpm agents:check`

## 提交前检查

- 确认没有修改产品源码或准备副本以外的构建产物，没有混入真实框架性能验收结论。
- 升级 Node 协议、变更 CLI 身份或生成代码布局时重新验证协议支持和 AST 锚点；保留首败证据。
