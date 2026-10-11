# P2 工程增强实现说明

本版本提供四类可审查、可重复运行的工程工具：Issue triage 输出事实、证据关联的假设和复现建议；skill eval 按版本统计触发质量；runtime size 检查入口、sideEffects 和预算；兼容性矩阵校验 owner、测试入口、状态和移除条件。

所有脚本均为只读操作，支持 `--help`，输出稳定 JSON 或 Markdown，并在 CI 中使用非零退出码表示输入或契约错误。路径和日志进入 triage 前会脱敏。兼容性状态必须为 `verified`、`partial`、`blocked` 或 `unsupported`，后两者不会被视为通过。

验证命令：`pnpm p2:triage fixture.json`、`pnpm p2:eval`、`pnpm p2:runtime-size -- --json`、`pnpm p2:compat`、`pnpm skills:validate`。
