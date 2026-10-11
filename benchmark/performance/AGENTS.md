# 性能基准与门禁规则

## 适用范围

本目录维护全链路性能场景、统计、报告和门禁，不承载生产实现。

## 变更原则

- 所有实测结果必须写入临时目录或 CI artifact，默认命令不得改写 tracked 基线。
- 场景输出必须验证样本间哈希稳定；性能优化不能牺牲 CSS、模板或脚本语义。
- 预算只允许通过显式 baseline update 命令更新，并在变更说明中记录环境和原因。
- 路径使用 `node:path`，临时目录使用 `os.tmpdir()` 或显式 artifact 目录。

## 测试要求

- 统计、复杂度拟合、预算判断和报告渲染必须有 Vitest 回归测试。
- 新增场景需要覆盖至少三个输入规模，才能参与复杂度判断。
- 已知债务必须包含 Issue 链接、非阻断原因和升级为阻断的条件。

## 推荐验证命令

- `pnpm --filter benchmark-performance test`
- `pnpm --filter benchmark-performance report -- --suite postcss --runs 1 --warmups 0`
- `pnpm --filter benchmark-performance guard -- --suite postcss --runs 1 --warmups 0`

## 提交前检查

- 确认 `.tmp/performance-report` 没有被加入提交。
- 确认预算、场景和已知债务文件仍是有效 JSON。
- 确认生成报告包含 commit、环境、样本数、复杂度和门禁结果。
