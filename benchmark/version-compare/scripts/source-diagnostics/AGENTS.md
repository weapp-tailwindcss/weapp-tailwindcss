# Source diagnostics 准备规则

## 适用范围
- 本目录与创建的外部 products/evidence/archives，不是正式性能门禁。

## 核心职责
- 从准确 Git commit/tree 准备两个无 Git 元数据的独立产品副本，保存可复核来源、工具与关键输入。

## 变更原则
- driver 必须等于 sourceRepository 干净 HEAD；Git 禁用 replace refs。
- 统一固定 kind 与 argv；不接受任意 shell 命令。pnpm Node 入口与 native executable 均 shell:false；不使用 .cmd/.bat/.ps1 包装器。
- products、archives 不上传；仅 evidence 上传。完整归档、文件清单和失败日志不因报告成功而省略。
- 每侧独立冻结安装、构建与依赖物理归属；不借用其他 role 或 driver node_modules。
- before/after 验全部 tracked 输入；checkpoint 仅验 immutable 关键输入。HMR 修改/恢复证据由 workload controller 拥有。
- 默认执行器只在 Linux/macOS 提供自建进程组关闭确认；Windows native 在 owned job 生命周期完成前明确失败，不声称验收通过。
- 任务目录必须独占静止；不声称抵抗恶意并发写入的原子快照。读取超限或身份变化必须失败。

## 测试要求
- 用真实 Git/tar、注入 pnpm 操作的 fixture 验来源和失败协议；注入回执不得用于实际诊断。
- 修改来源、路径、归档或关闭过程时覆盖对应失败路径。

## 推荐验证命令
- `pnpm exec vitest run -c benchmark/version-compare/vitest.config.mjs benchmark/version-compare/test/source-diagnostics.test.mjs --update=none --maxWorkers=1`
- `pnpm agents:check`

## 提交前检查
- 确认所有报告 diagnosticOnly=true、budgetAcceptance=false，不替代 CPU/RSS 或正式性能验收。
