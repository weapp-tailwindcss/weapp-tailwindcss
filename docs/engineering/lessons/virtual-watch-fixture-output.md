---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1218
baseline: e11cd6a78eb5c89a3ea56ba3ac279a52489aa5ba
regressions:
  - scripts/ci/demo-matrix/watch.test.mjs
---

# 虚拟模块监听测试的输出隔离

## 症状

[Windows Node 24 检查](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/35484338768/job/106007796975)在共享 demo matrix 测试阶段失败：空闲期间编译 3 次，失效路径是 fixture 的输入根目录。此时尚未执行 Mpx 场景。

## 根因与纠正

fixture 将 `dist` 放在被监听的输入目录中。首次编译创建输出目录，造成真实的目录变更，干扰空闲监听断言。新增输入目录内容不变断言后，本地稳定失败，差异为新增 `dist`；本地未直接复现 Windows 的三次编译时序。

将临时目录分为独立的输入与输出目录，并在首次编译及增量编译后检查输入目录内容。保留原有空闲重建次数限制、真实虚拟模块更新和更新后稳定性断言。

## 验证

- 修复前，定向 watch 测试 1 项失败、4 项通过，输入目录断言捕获新增 `dist`。
- 修复后执行 `CI=1 pnpm test:demo:matrix`：12 个测试文件、73 项测试全部通过，该脚本已固定 `--update=none`。
- Windows 时序问题由新提交的 CI 继续验证，不以本地通过代替 Windows 证据。

## 适用边界

只调整测试 fixture 的文件布局，不修改产品监听实现、重建阈值或平台覆盖。未修改 demo、样式输出及 static 基线。

## 规则评估

将输入目录不变要求固化为可执行断言，不新增 AGENTS 规则。
