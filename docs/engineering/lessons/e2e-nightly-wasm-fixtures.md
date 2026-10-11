---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38089432046
baseline: e976c47772afcdaea3cbe674c84b5146f7d6edc7
regressions:
  - e2e/lynx-css-defaults.test.ts
  - e2e/package-cli.test.ts
  - e2e/issue-1194-css-calc.test.ts
  - e2e/issue-1214-rpx-calc.test.ts
  - e2e/issue-1214-author-css-watch.test.ts
  - e2e/issue-1214-rpx-calc-watch.test.ts
  - e2e/native-session-registry.test.ts
  - e2e/preflight-report-output.test.ts
---

# Nightly 的 WASM 编码诊断与临时工程身份

## 症状

2026-10-11 的 E2E Coverage Nightly 在 Windows 出现 uni-app 临时项目找不到 `vite-plugin-uni/bin/uni.js`、Lynx 缺少不支持属性/选择器诊断，以及原生会话不可写路径和临时目录收尾断言失败。Windows 的 Lynx 静态报告把 `columns`、`float` 等已被 encoder 删除的属性误报为可用。

## 根因与纠正

`@lynx-js/tasm@0.0.49` 在 Darwin/Linux x64 选择 NAPI，Windows 选择 WASM。原始 WASM `_encode` 已返回 `css_diagnostics`，但 JavaScript `encode_wasm` 构造公开返回对象时漏掉该字段。静态证据依赖 encoder 的诊断报告，字段丢失会把送入 encoder 的 CSS AST 误当成已被 bundle 保留。通过精确版本 pnpm patch 透传字段，生产 CSS 与快照语义不变；回归在每种宿主系统都显式运行 WASM，分别核对属性和选择器诊断，避免只有 Windows 才覆盖该边界。

只读检索上游 `css_diagnostics wasm` 未找到对应 Issue/PR。核对的[上游实现](https://github.com/lynx-family/lynx/blob/706c714fd1ec9f5a16329e091e8ce8d419711639/oliver/lynx-tasm/index.js)仍遗漏字段；未向上游发送消息或建立 Issue。patch 仅适用于生产 encoder `0.0.49`。后续升级必须先用显式 WASM 回归验证上游已透传字段，再删除 `patches/@lynx-js__tasm@0.0.49.patch`、workspace 登记和 lockfile patch hash，不能只删除登记或推断新版本已修复。

临时 uni-app 工程借用 demo 的 `.bin` 目录，Windows 包装脚本的相对入口无法迁移到新项目。共享 helper 现在按实际安装包 `package.json` 的 `bin` 元数据解析入口，用当前 Node 执行解析后的文件；临时项目不再链接 `.bin`。watch 仍复用同一 pnpm session 和同一编译进程，传递显式 Node 与实际 CLI 文件。

Windows 会把文件祖先下不存在的子路径也报告为 `ENOENT`。原生会话预检现在检查最近的现存祖先，只有可遍历目录下的缺失 registry 才是首次运行，文件或损坏链接继续阻断；创建持久根目录失败与已被领取的 slot 分别保留原因。

Lynx CLI 选项回归使用真正的宿主绝对路径；启动错误回归通过已知 Node 可执行文件和缺失 cwd 触发真实 spawn `ENOENT`，不依赖 Windows 对缺失无扩展名命令的 shell 解释。报告身份回归按显式 repositoryRoot 写入，不通过伪造全局 `process.cwd()` 改变其他调用的 cwd，临时目录移除对 Windows 短暂文件占用保留有界重试。

## 验证

- `pnpm install --frozen-lockfile`：精确 patch 可重复安装，锁文件没有无关版本升级。
- `CI=1 pnpm --filter weapp-tailwindcss... --filter @weapp-tailwindcss/lynx build`：构建当前 worktree 的包依赖。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/package-cli.test.ts e2e/lynx-css-defaults.test.ts e2e/lynx-native-command.test.ts e2e/lynx-native-options.test.ts e2e/native-session-registry.test.ts e2e/preflight-report-output.test.ts --update=none`：覆盖 CLI 的 POSIX、Windows 反斜杠、盘符、根目录、相对路径，真实 WASM 编码、原生进程生命周期和持久登记失败边界。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1194-css-calc.test.ts e2e/issue-1214-layout-static.test.ts e2e/issue-1214-rpx-calc.test.ts e2e/issue-1214-author-css-watch.test.ts e2e/issue-1214-rpx-calc-watch.test.ts --update=none`：5 文件、22 用例通过，Issue 1194 H5 与 Issue 1214 WXSS/watch 的既有 static 基线不变，没有自动更新快照。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-rspeedy.test.ts -t 'matches the committed CSS AST' --update=none`：实际 bundle 的 118 项既有静态证据基线通过；其余 23 个用例因定向过滤没有执行。

## 适用边界

本地在 macOS / Node 24 验证真实 CLI 和强制 WASM 编码；Windows runner 的全静态套件需由对应 CI 再确认，不能把模拟路径用例称为真实 Windows 执行。未连接 IDE、登录账号或设备，也没有启动本地全面测试。此次不修改 demo 页面、样式与输出预期，因此只验证现有 static 基线，不重新写入基线。

## 规则评估

不新增规则。根规则已有跨平台路径、稳定依赖身份、真实产物和 patch 移除要求；用显式 WASM 和临时 CLI 的持久回归补齐执行覆盖。
