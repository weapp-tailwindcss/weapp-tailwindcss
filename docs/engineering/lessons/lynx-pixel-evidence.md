---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: b186032078ba550f91cbb46b3f611e13dee6633d
regressions:
  - e2e/lynx-pixel-evidence.test.ts
  - e2e/lynx-reports.test.ts
---

# Lynx 原生像素报告的编码假阳性

## 症状

CI run `37325619986` 的 Android job `111815484865` 虽然显示绿色，原生步骤实际在报告对照失败：18 项像素用例从支持变为不支持。该 job 的 `continue-on-error` 将诊断失败掩盖在 job 成功中。系统截图同时显示 System UI 无响应，不能将该轮 Android 视为有效完整验收。

iOS job `111815485155` 的命令与旧基线对照通过，但检查其原始截图后也发现像素假阳性，命令通过不能证明报告结论正确。

## 根因与纠正

原生 JS 将 Base64 PNG 字符串的哈希不同视为样式生效。精确对应已提交 Android 基线、`verifiedAt=2026-08-17T06:34:56.557Z` 的原图中，`layout-visibility`、`type-weight-style`、`effect-opacity` 的 probe 为 446×171，control 为 445×171；共同区域 76095 个 RGBA 像素完全相同，编码差异只来自额外一列。当前 CI Android 的两图均为 448×163，因此暴露了原来被宽度差隐藏的问题。当前 CI iOS 的 `type-weight-style`、`effect-opacity` 也有 500×187 对 499×187 的同类差异。

报告接收侧过去只验证 JSON 结构、状态和 checkpoint 声明，没有核对截图。现在原生验收与基线更新共用 PNG 校验，要求两图尺寸一致，解码真实图像检查可见像素变化；双方 alpha 为零时忽略不可见 RGB。缺失、损坏、错误 checkpoint 或只有编码/尺寸变化的“通过”报告被拒绝。动画/transition 逐对检查必要变化，未通过的交互不因截图差异被自动改成支持。

仅比较共同区域还不够：渐变会随整个元素宽度重新插值，即使只多一列也可能造成大量细微色差。最终实现拒绝尺寸不同的证据，不引入裁剪、缩放或取整容差；原生捕获必须先提供大小一致的可比较区域。

保留原报告、PNG 和首次失败，不自动重写 supported/unsupported，也不自动更新基线。此变更修复证据放行边界；原生 capture 的合成范围、fixture 的属性消费以及逐 case 断言还需分别验收。

## 验证

新增用例在修复前 8 项失败，确认旧入口放行了不充分证据。定向命令：`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-pixel-evidence.test.ts e2e/lynx-reports.test.ts --update=none`。

覆盖宽度或高度多一像素、PNG 压缩差异、透明 RGB、alpha 变化、多行图中单个真实像素变化、缺失/损坏 PNG、动画与 transition 时间序列、具体 checkpoint 契约，以及不支持结论也必须保留可解码截图。

对原始 artifacts 只读解码：精确 Android 基线有 15 项在共同区域完全无变化，本轮 iOS 有 17 项；另外 3 个 Android 结论变化用例（`background-size`、`background-linear-gradient`、`effect-shadow`）的旧图虽有共同区域像素差异，但两图宽度仍不同，不能作为有效属性对照。最终严格校验拒绝旧 Android 与本轮 iOS 各 23 项；本轮 Android 拒绝 `border-width-color`（448×173 对 448×163）与 `animation-spin`（434×90 对 448×163）的捕获尺寸不一致。本轮 Android 还与旧基线不一致，且有 System UI 无响应。结果保留在任务的 `.tmp/ci-audit/lynx-pixel-real-artifact-audit.jsonl`。

最终定向验证 3 文件 32 项通过，ESLint、严格 TypeScript 和 agents 检查通过；相关包与 Rspeedy 构建、已提交 CSS AST/encoder 静态证据验证通过。本次未修改样式生成或 demo 源码，没有刷新 static 基线。

## 适用边界

尺寸一致且有可见差异只是必要条件，不足以证明具体 CSS 属性正确。若效果本身改变尺寸，需改进 fixture/capture，在同样大小的父级画布内呈现变化；不能凭截图尺寸变化放行。旧 JSON 基线暂时保留，待双端重新采集、审查完整证据后显式更新。本轮未宣称原生样式支持矩阵已修复或全端验收通过。

本检查也不单独证明图片属于本轮。原生固定文件名和写入完成回执仍需进一步约束；旧文件或捕获路径不完整不能靠可解码 PNG 自动获得真实性。

## 规则评估

不新增 AGENTS 规则。通过共享证据校验、持久回归和报告手册收紧已有验收边界，避免将截图编码当作视觉语义。
