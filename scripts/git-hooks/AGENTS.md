# 提交钩子脚本

## 适用范围
- `scripts/git-hooks/*`，用于根 `lefthook.yml` 的提交检查。

## 核心职责
- 从 Git 暂存区收集文件，以参数数组调用 ESLint；不承担全仓检查或 hook 安装。

## 变更原则
- 文件集合与 Lefthook 的 glob/exclude 保持一致，Git 文件名使用 NUL 分隔。
- 未暂存内容的隐藏、恢复及重新暂存由 Lefthook 负责，不在 runner 内另行 stash 或 `git add`。

## 测试要求
- 修改暂存处理需验证部分暂存、失败恢复、特殊文件名和删除/重命名。
- 启用 hook 安装只使用临时 Git fixture，保留真实 checkout 及共享 worktree 的配置。

## 推荐验证命令
- `CI=1 LEFTHOOK=0 pnpm --filter weapp-tailwindcss exec vitest run test/ci/git-hooks --update=none`

## 提交前检查
- 检查 Windows/macOS/Linux 路径与参数边界，并同步受影响的回归和升级记录。
