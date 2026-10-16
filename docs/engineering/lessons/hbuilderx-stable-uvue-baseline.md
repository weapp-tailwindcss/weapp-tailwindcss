---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/blob/c1881fbce083c1ce0613ecc2ae920fdd599b5199/e2e/uni-app-x-vdom-tailwindcss-v4.test.ts
baseline: c1881fbce083c1ce0613ecc2ae920fdd599b5199
regressions:
  - e2e/uni-app-x-vdom-tailwindcss-v4.test.ts
---

# 固定 Stable 工具链后同步 uni-app x 官方样式基线

## 症状

扩展全面轮次 `5d7c8536-c809-41e4-ac0b-ece83c1d664b` 在第 31 阶段失败，`uni-app-x-vdom-tailwindcss-v4` 的第 17 次快照断言不匹配。`main.wxss` 的公共组件 reset 新增 `rich-text`，`video` 从条件区块内移到公共列表后部。本轮实际绑定 Stable HBuilderX `5.26.2026091802`；原有基线来自 Alpha `5.31.2026093020-alpha`，见 [Alpha 基线记录](hbuilderx-alpha-uvue-baseline.md)。

## 根因与纠正

两套已安装 IDE 的官方 `@dcloudio/uni-mp-vite/lib/uvue.css` 本身存在该差异。Stable 自带 `uniapp-cli-vite` 为 `5.26.2026091411.1611`，其 `uni-mp-vite` 为 `3.0.0-alpha-5020520260821001`；Alpha 对应版本分别为 `5.31.2026093017.4537` 与 `3.0.0-alpha-5020720260921001`。此次没有升级工具链，不能将它归因为本候选引入的产品回归。

官方插件在 `generateBundle` 读取同安装目录的 CSS，经平台预处理输出 `uvue.wxss`。本轮后处理前的原始 bundle 已包含 Stable 的选择器列表；最终产物与 Stable 输入一致，旧快照与 Alpha 输入一致。两轮既有兼容处理均移除 `progress`。公共 reset 的 13 条声明完全相同，`video` 在微信平台仍命中原规则；`rich-text` 则确实多获得这组官方声明，不能把它描述成纯格式变化。本 demo 未使用这两个组件。

保持已选 Stable 工具、生产转换和比较器，限定该项目重新生成基线。审查后只有 `main.wxss` 上述三处行变化，其余 16 份快照字节未变；没有删除选择器、重排官方输入或降低断言。

## 验证

原全面轮次保留完整失败日志、实际退出码 1，以及 92 份实际产物和 17 份预期快照的逐文件摘要。后续定向验证使用 Node `24.18.0`、pnpm `12.9.1` 和原 Stable CLI/host 绑定，明确重建项目并保留微信登录态：

```sh
CI=1 E2E_SKIP_HBUILDERX=0 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_SKIP_BUILD=0 E2E_PROJECT_FILTER='^uni-app-x-vdom-tailwindcss-v4$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-x-vdom-tailwindcss-v4.test.ts -u --bail=1
CI=1 E2E_SKIP_HBUILDERX=0 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_SKIP_BUILD=0 E2E_PROJECT_FILTER='^uni-app-x-vdom-tailwindcss-v4$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-x-vdom-tailwindcss-v4.test.ts --update=none --bail=1
```

单独生成与随后禁更新复验均真实退出 0，各 1 项通过、无跳过。复验位于 `fe518378948b15cac703ef488ae02e0e91be64d9` 加唯一受控的未提交快照变化上；执行前后状态一致，未将原 SHA 当作已经包含更新的提交。原始回执与日志位于忽略目录 `e2e/.artifacts/full-validation-recovery/stable-uvue-baseline-fe518378948b/`。完整验收须在后续准确候选提交上重新预检和执行，不复用失败轮次。

## 适用边界

该记录仅证明当前固定 Stable 编译器的项目静态基线与实际产物相符。Alpha 历史验证仍保留其版本边界，不能把一份基线宣称为所有 IDE 版本的共同输出。未在本次定向验证中执行设备运行、HMR、其它原生架构或完整 57 阶段；不新增包发布 change intent。

## 规则评估

不新增 AGENTS。沿用显式工具绑定、限定项目生成、审查完整差异、禁止更新模式复验和项目归属清理要求。
