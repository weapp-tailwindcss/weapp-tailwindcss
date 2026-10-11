# Package Guidelines (`packages/wetw`)

## 适用范围

- 本文件适用于 `packages/wetw`。
- 该包是组件注册与脚手架生成 CLI，涉及文件系统写入与 registry 解析。

## 核心职责

- `src/cli.ts`：命令行入口。
- `src/config.ts`：配置加载与默认值处理。
- `src/registry.ts`：registry 解析（默认与本地文件）。
- `src/add.ts`：组件写入逻辑（含覆盖保护）。
- `src/init.ts`：默认配置文件初始化。

## 变更原则

- 文件写入逻辑必须默认安全：未开启 `force` 时不覆盖已有文件。
- 配置加载应保持“显式配置优先，自动默认兜底”的语义稳定。
- registry 格式变化需保持向后兼容，或在变更说明中明确升级路径。
- CLI 参数行为变更需同步更新测试与文档，避免命令语义漂移。

## 测试要求

- 修改核心流程时至少覆盖：
  - 无配置默认加载；
  - 初始化配置文件；
  - 添加组件写入；
  - 已有文件冲突分支；
  - 本地 registry 加载分支。

## 推荐验证命令

- `pnpm --filter wetw test`
- `pnpm --filter wetw build`
- 定向回归：
  - `pnpm --filter wetw exec vitest run test/index.test.ts`
