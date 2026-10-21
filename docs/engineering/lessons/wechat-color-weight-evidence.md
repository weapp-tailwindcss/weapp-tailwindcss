---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 399d635bb559cfd6a0d01369727740e1ffc7f822
regressions:
  - e2e/tailwind-weapp-alpha.test.ts
  - e2e/tailwind-weapp-replay.test.ts
  - e2e/tailwind-weapp-capture.test.ts
---

# 微信颜色权重的支持边界与原始证据重放

## 症状

本轮经用户确认，将未知运行时动态颜色权重登记为小程序平台限制，继续保留静态百分比支持。`bg-sky-500/(--my-alpha-value)` 的权重在运行时改变时，现有终端转换保留不透明 fallback，不能把它当作透明度已生效；将 `color-mix` 简写为 `rgba` 也不能普遍保留数值、越界及原色透明度语义。

## 根因与纠正

- 十一个静态正向案例分别覆盖 0%、25%、50%、100%、小数、原色 alpha 相乘，以及静态根变量、变量别名和分数百分比。
- 有限类切换正向检查 25% → 50% → 25%，保留独立参考和每阶段绝对像素预期。
- 未知运行时权重负向检查 50% → 25% → 50%。目标保持不透明 fallback，独立 `rgba` 参考改变，另用 `opacity:var(...)` 见证变量实际更新。三者必须同时符合预声明语义，不能仅凭两图不同通过。
- 原有动态宽度改用同一阶段协议，检查 32px → 64px → 32px；页面不再按宽度案例硬编码切换。

### 原始证据边界

旧微信报告只校验附件摘要，错误截图重新签名、缺恢复阶段、错误见证和过期 sidecar 均可能被放行。本轮先固化失败回归，再补生产重放：

1. 保存生成 WXSS 和完整项目原件，逐案例登记回执。
2. 每阶段采集页面输入、实际身份文本、目标/参考/见证样式及三块节点几何。
3. 截图标记绑定 run ID、案例、阶段和 CSS 摘要；同色的 before/restored 也不能交换旧图。
4. 重读完整 PNG 和窗口尺寸，以生产色彩归一化及视口裁剪重建截图，逐像素核对裁剪结果，再重算绝对颜色和目标/参考差异。
5. 重放强制要求全部阶段、完整几何和全部原件回执，拒绝孤立裁剪图、双方同错色及与报告不一致的断言。采集异常仍落盘已有测量和原图，原异常继续传播。

合成 PNG 仅用于协议回归，不能登记为微信实际运行。正向和负向端侧验证均须使用新一轮扩展预检、当前会话真实 computer use 与 verify；本记录的代码提交阶段尚未执行微信真实夹具。

## 验证

- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-weapp-{alpha,replay,capture,environment,pixels,conversion-oracle}.test.ts e2e/tailwind-mini-program-alpha-limit.test.ts e2e/tailwind-probe-properties.test.ts e2e/tailwind-report.test.ts e2e/tailwind-fixtures.test.ts e2e/wechat-session-boundary.test.ts --update=none`：11 文件、187 项通过。命令中的花括号仅为阅读简写；跨平台入口 `pnpm e2e:tailwind:contract` 已逐文件登记三个新增测试。
- `pnpm e2e:tailwind:static:update`：审查后仅 `weapp.wxss` 和索引变化，其余 47 份样式逐字节保持一致。以 `fixtureBaseline(root, false)` 重新生成全部 48 份产物并执行禁止更新的比较，通过。
- 全部修改的 TypeScript 文件通过 ESLint；微信认证阻断与清理的 7 项回归和会话边界的 5 项回归保持通过。
- `pnpm exec tsc -p e2e/tsconfig.json --pretty false` 仍有全目录的 lib、JSX 与脚本类型错误，不能登记为全量类型检查通过。

## 适用边界

本轮保持验收 partial。合同、生成产物和合成协议通过不代表微信运行时通过，也不代表全部注册能力、RN/Lynx 原生及 Web 剩余状态已验收。


## 规则评估

既有“预声明支持预期”和“运行时重读 PNG/sidecar”规则已经覆盖本问题，无需增加放行例外。将微信真实采集接入同一生产重放器，并保留认证和清理原异常，避免合同测试与端侧判定分叉。
