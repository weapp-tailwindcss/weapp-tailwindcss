# 模板依赖升级流程

模板范围以根目录 `templates.jsonc` 为准，实际资产位于 `templates/`。标准入口是：

```bash
pnpm templates:upgrade
```

该命令依次更新依赖和 pnpm 锁文件，然后运行模板构建 smoke 与 canonical 模板门禁。只需要刷新依赖时使用 `pnpm templates:update-deps`。

更新脚本会保持当前依赖的主版本，按现有框架兼容矩阵处理 Tailwind、Taro、uni-app 和 Mpx；模板中已声明的 `@babel/*` 依赖会按其当前主版本获取最新版本。Tailwind v4 的样式生成仍由 `weapp-tailwindcss` 接管。

失败时先保留错误输出并确认网络和 Node/pnpm 版本，再重新执行更新命令。提交前检查模板 `package.json`、`pnpm-lock.yaml`、文档清单和 `git diff --check`，不要手工编辑生成的锁文件。
