---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37220779304
baseline: a822d0c028179e7be1d6eb15c48941d4d14895ba
regressions:
  - packages/weapp-tailwindcss/test/ci/verify-packed-packages.test.ts
  - packages/weapp-tailwindcss/test/native-distribution.test.ts
---

# 原生 Linux 验证的 Node 22 与 pnpm 12 工具链边界

## 症状

原生 Linux 构建、Rust 单测、JS/WXML/CSS ABI 和差分验证均通过后，Node 22 的最低 ABI 容器验证仍在 `corepack prepare pnpm@12.6.0 --activate` 处失败。Windows 验证则在功能检查通过后，清理仍被 Node 加载的 `.node` 文件时报告 `EPERM`。

## 根因与纠正

Node 22.18.0 内置的 Corepack 仍把 pnpm 版本元数据映射到 `bin/pnpm.cjs`，而 pnpm 12 的发布包使用 `bin/pnpm.mjs`，所以 Corepack 的默认 shim 不可执行。Linux 验证脚本仍由 Corepack 下载并校验根 `packageManager` 指定版本，但直接用缓存中的 `bin/pnpm.mjs` 生成临时 PATH 中的 `pnpm` wrapper；pnpm 会在当前 Node 22 上运行，验证目标仍是最低 Node ABI。这样 shell 调用和 Node `spawnSync('pnpm')` 都走同一个入口，同时保留 Corepack 的签名校验。

Windows 不能在同一进程仍持有原生模块时删除其文件。打包验证的清理阶段仅对 Windows `EPERM` 做可诊断的容错，其他清理错误继续抛出；Runner 临时目录随后由系统回收。Windows Runner 的 `os.tmpdir()` 还可能返回 `RUNNER~1` 形式的 8.3 路径，写入 pnpm 的 `file:` 依赖前先用 `realpath` 还原长路径，避免 URL 解码后触发 Win32 路径错误。

## 验证

```sh
sh -n packages/weapp-tailwindcss/native/ci-linux.sh
node --check packages/weapp-tailwindcss/native/test/package.mjs
pnpm --filter weapp-tailwindcss test:native:package
```

本地 Node 24.18.0 的真实打包验证通过。远端 run 37220779304 已确认四个 Linux target 的失败只发生在 Node 22 Corepack shim，Windows 只发生在最后的锁文件清理；代码构建、原生 ABI、Babel 对拍和 PostCSS native suite 均通过。修订后的 Linux 容器和 Windows job 需要在新提交上重新执行，才能将本记录升级为 `verified`。

## 适用边界

该修订只处理 CI 验证工具链和测试清理生命周期，不改变公开 API、Rust ABI、Node 支持范围或生产构建路径。pnpm 版本仍从根 `packageManager` 读取，不能改成漂移的 latest。

## 规则评估

不新增根规则。保留在原生目录的跨平台 ABI 验证与临时目录约束中。
