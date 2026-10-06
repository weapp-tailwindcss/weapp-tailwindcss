---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 52d34c8ee402b865df7e0e1841285db3c7bf9347
regressions:
  - packages/postcss/test/lynx-css-compat.test.ts
  - e2e/lynx-css-defaults.test.ts
  - e2e/lynx-static-evidence.test.ts
---

# Lynx 原生透明度与 Tailwind 百分比语法

## 症状

严格 PNG 验收暴露了旧报告的支持假阳性。提交 `ed4500bf5` 的 [原生运行](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37342063498) 中，Android 和 iOS 的 `effect-opacity` 对照与探针图片完全相同，内容均不透明。生成 CSS 和实际编码后的 TASM 都保留 `opacity: 50%`。

## 根因与纠正

固定 Lynx 4.0.1 在 `core/renderer/css/parser/number_handler.h` 将 `kPropertyIDOpacity` 分配给 NumberHandler，消费数字值。Tailwind v4 输出的百分比通过了构建和 encoder，却不能据此推定原生支持。

在拥有平台 CSS 兼容职责的 postcss 包中，将单个明确的 opacity 百分比转换为等价数字。转换覆盖无 theme 变量的样式、嵌套规则与关键帧；不改动态变量、其它属性、无效或非有限 token。利用值 AST 保留注释，并读取 PostCSS 仍有效的 raws 值，避免修改声明时丢失原始注释。普通 Web 保持原输出语义。

静态证据仅将 opacity 的百分比与数字作精确等价比较；例如 50% 等于 0.5，但不等于 50。catalog 未变，不改原生支持基线或像素门槛。

## 验证

- 先增加百分比与 keyframe 回归，旧实现 9 项失败；修复后 30 项通过。随后新增的注释回归首次失败于 PostCSS raws 边界，修正后全部通过。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/lynx-css-compat.test.ts --update=none` 验证数字、指数、边界、动态输入、注释和幂等性。
- `CI=1 pnpm e2e:lynx --update=none` 覆盖真实 Tailwind 生成、生产 encoder 和 WASM decoder，要求最终编码值为 0.5；同时覆盖静态等价比较的反例。
- `CI=1 pnpm e2e:lynx:static:update` 已限定 React Lynx 重建。审查仅 effect-opacity、variant-structural、variant-group-peer、variant-data-aria 的声明由 50%/100% 变为 0.5/1，118 项生成/编码结论和 catalog hash 不变；随后运行不更新验证。
- `pnpm release status` 确认中文 intent 包含 postcss、weapp-tailwindcss 和 Lynx 消费包。首次代理 TLS EOF 保留；有界网络对照中同一官方 registry 经现有代理返回 200，直连证书主机名不符，随后 status 成功。未关闭 TLS 验证、切换 registry 或修改全局网络。

## 适用边界

上述证明静态转换和真实编码正确，尚不能声明双端模拟器视觉验收完成。后续必须使用新的 runId、实际 bundle 哈希和写图回执重新采集原生报告；此前 schema 1 报告仅用于诊断。其它 16 项双端支持差异需要分别定位，不通过批量刷新基线解决。本机 Xcode 27 与固定 Lynx 4.0.1 的完整 iOS 编译仍有已记录兼容阻塞。

## 规则评估

不新增 AGENTS。由负责模块实现等价转换，并用真实 encoder 和持久边界测试落实已有分层验收要求。
