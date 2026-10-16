---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/blob/c1881fbce083c1ce0613ecc2ae920fdd599b5199/e2e/preflight-probes.test.ts
baseline: c1881fbce083c1ce0613ecc2ae920fdd599b5199
regressions:
  - e2e/preflight-harmony.test.ts
  - e2e/preflight-probes.test.ts
---

# 预检合成探针必须隔离完整工具与设备身份

## 症状

扩展全面轮次 `5d7c8536-c809-41e4-ac0b-ece83c1d664b` 在 static 阶段的 Harmony 截图回退用例失败。首次错误是三个 HDC 路径别名“设备配置存在歧义”：两个别名保留预检绑定的绝对工具路径，而用例只把 `HDC_PATH` 改成 `hdc`。失败发生在任何设备命令执行前。

在独立且冻结安装依赖的 checkout，以原始基线、同轮报告中的 Harmony 工具与目标重建六个 gate 环境别名，执行原用例得到实际退出码 1、1 项失败、27 项因名称筛选未执行。错误与全面轮次相同，未通过修改生产行为制造通过结果。

## 根因与纠正

全面入口把已验证工具写入 `HDC_PATH`、`E2E_HBUILDERX_HARMONY_HDC_PATH`、`DEMO_VISUAL_HARMONY_HDC_PATH`，同时注入三个设备别名。夹具仅覆盖一个工具别名，未覆盖设备别名；原模拟设备 ID 又碰巧等于本机目标，掩盖了设备身份泄漏。生产入口拒绝多值别名符合门禁契约。

将 Harmony 用例移到独立回归文件，夹具同时绑定三个工具别名和三个设备别名，并在清理时恢复原环境。模拟工具及目标均使用明确的合成身份；命令 mock 校验工具、设备和参数，未知操作直接失败。继续验证 pixelMap 失败、`snapshot_display` 回退、有效 JPEG、UI 结构与远端临时文件清理。

`screenCap` 的异常本来就会触发回退，因此仅在该 mock 分支内断言参数可能被生产代码捕获。回退完成后再从独立调用记录核对完整 `screenCap` 参数，避免错误参数被一次成功回退掩盖。

宿主环境构造独立于夹具覆盖，参数化覆盖未预选和完整预选环境；后者在普通 CI 中也会暴露任一别名遗漏。六个负例分别构造每个工具或设备别名的冲突，证明原有生产歧义保护仍然阻断：工具冲突不运行任何命令，设备冲突只允许版本与目标枚举。

## 验证

修复工作区保留同轮报告的六个真实 Harmony 环境绑定，以 Node 24.18.0、pnpm 12.9.1、Vitest 5.0.4 执行：

```bash
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/preflight-gate.test.ts e2e/preflight-evidence.test.ts e2e/preflight-probes.test.ts e2e/preflight-harmony.test.ts --update=none
pnpm agents:check
```

定向预检组共 98 项通过，无失败或跳过。原始 red 和修复 green 分别保留完整日志、实际进程退出码、环境白名单及日志摘要；不把测试注入的探针输出描述为真实设备验收。ESLint（禁用 Prettier 规则）、规则及差异检查均通过。

## 适用边界

本次只修正测试夹具，不修改生产探针或公共接口，不改变 demo、样式与 static 基线，不需要包发布 change intent。所有 Harmony 命令均被 mock，文件仅写入本用例创建的临时目录；没有操作设备、浏览器、IDE 或微信登录态。该定向回归不能替代修复提交上的新一轮预检和扩展全面验收。

## 规则评估

不新增或放宽 AGENTS 规则。已有隔离原则足够，补充可执行的完整身份回归，并保留严格的生产冲突门禁。
