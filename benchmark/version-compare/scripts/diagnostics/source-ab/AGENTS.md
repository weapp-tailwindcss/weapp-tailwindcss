# Taro 源码 A/B 诊断

## 适用范围
- 本目录、本分支手动 benchmark workflow 与本轮无 Git 元数据的准备副本。

## 核心职责
- 比较准确 2dd 与 0637 源码，先核候选、实际任务与逐资产正文，再解释内存。
- 复用 ae8387b 的被动编译器、自然 GC、完整资产与资源关闭协议；不改变任何依赖或锁。

## 变更原则
- 仅准备副本接受已验证 AST 锚点的插桩；两侧独立 frozen install，禁止借用依赖。
- 只读来源来自当前构建图或既有集合；正文保持原字节，集合完整记录，超限失败。
- 固定 Linux、Node 22.23.4、三次新进程生产构建和交错顺序；没有主动 GC 或 inspector。
- 正式性能预算、样本数、生产代码与关闭顺序保持不变；本诊断不能作为正式验收。
- 子进程必须有截止与归属收据，未确认停止保留副本和首败证据。

## 测试要求
- 验证两份准确源码的插桩锚点、语法、正文归档与坏锚点拒绝。

## 推荐验证命令
- `node --test benchmark/version-compare/scripts/diagnostics/source-ab/test.mjs`
- `pnpm agents:check`
- `git diff --check`

## 提交前检查
- workflow 仅手动触发，独立 check 与并发组；所有实验只在诊断分支，不合入主任务。
