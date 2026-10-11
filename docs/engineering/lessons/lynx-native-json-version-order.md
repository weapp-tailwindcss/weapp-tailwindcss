---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 2e32077bcd62cbd3e1b857810c84001692bb0b62
regressions:
  - e2e/lynx-reports.test.ts
  - e2e/lynx-evidence.test.ts
---

# Lynx 原生 JSON 版本对象的顺序边界

## 症状

[运行 37347746026](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37347746026) 的 iOS 模拟器生成了完整报告，却在 report-validation 阶段返回 `ios report versions do not match the pinned matrix`。

## 根因与纠正

原生 EvidenceStore 添加取证清单时解析并重新序列化 JSON，Foundation 不承诺对象属性顺序。实际版本值与固定矩阵完全相同，键顺序却由 tailwindcss、lynxEngine、engineVersion、cssDefines 变为 engineVersion、tailwindcss、cssDefines、lynxEngine。校验和结论比较使用 JSON.stringify，将对象顺序当成版本差异。

版本校验改为严格的键集合和逐字段值比较，继续拒绝缺失、多余、错误字段以及非对象输入。独立的结论投影按键排序，保留实际值和所有字段；不能通过替换成固定矩阵隐藏真实版本差异。原生证据与历史基线均不改写。

## 验证

新增的报告校验和结论序列化回归在旧实现上分别失败。修复后报告与证据测试合计 38 项通过，包括全部版本字段的缺失/错误值及无效版本对象。

- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-reports.test.ts e2e/lynx-evidence.test.ts --update=none`
- `CI=1 pnpm exec tsc --ignoreConfig --noEmit --module ESNext --moduleResolution Bundler --target ES2022 --types node --resolveJsonModule --skipLibCheck e2e/lynx/reports.ts`

对下载的原始报告进行只读诊断，版本阶段已通过，随后因尚未执行 enrichEnvironment 而拒绝未解析的 deviceName。这只证明原版本故障消除，不能代替当前提交的完整原生验收。

## 适用边界

当前验收仍要求原始几何证据、截图和运行身份。旧运行缺少新增的六份几何矩形，不能作为新门禁的通过证据。真实 iOS 模拟器工作流还需重新构建运行。

## 规则评估

不新增 AGENTS，不涉及公开包行为或版本。通过持久回归固化跨语言 JSON 对象的语义比较，保留严格版本约束。
