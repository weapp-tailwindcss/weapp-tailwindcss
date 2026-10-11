---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 48b0f965f779b69abb9985b97a721c557dc01afb
regressions:
  - packages/weapp-tailwindcss/test/watch-hmr-font-size-proof.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-class-declaration-proofs.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-class-variables.unit.test.ts
---

# Watch 字号证据的合法性证明

## 症状

uni-app x 微信 watch 轮次 `efbec914-eb36-474e-9c79-52d6f22bfb56` 在模板与脚本动态类阶段后，进入 `user reported index text-xs to text-[29px] baseline wxml` 时拒绝 `text-xs`。保存现场中，WXML 消费 `wtu-1gr1ye4-b` 与 `data-v-00a60067`；原规则使用 `font-size:var(--text-xs)`，别名规则使用 `font-size:24rpx`，已读取的无条件主题根声明为 `--text-xs:24rpx`。

同一现场还存在独立的行高差异：原规则为 `line-height:var(--tw-leading,var(--text-xs--line-height))`，别名变成 `line-height:calc(1 / 0.75)`；通用规则中 `--tw-leading` 声明为空。空值并不等于缺失，不能据此选择 fallback。本次只修正字号证明，不宣称完整现场已通过。

## 根因与纠正

[根变量签名复盘](watch-css-global-variable-signatures.md)中的完全内联证明只覆盖 margin 长属性。字号即使引用完整、无覆盖的根变量，也保留变量 AST，无法与合法的静态字面量建立等价证据。

在 PostCSS 包的原声明证明器中补充独立的 `font-size` 证明，只接受单个有限非负基础长度、小程序 `rpx`、百分比或裸零。正负零均为零；非零裸数、负值、未知单位、关键字与函数均不纳入证明。CSS tokenizer 直接读取带符号数值，不能复用 margin 为算术上界使用的 `Math.abs`。

变量只沿已有索引证明过的完整根绑定递归展开；沿用局部、条件、layer、注册、冲突、缺失与循环绑定拒绝规则，以及原有深度和签名预算。原始 AST 必须恰好包含一个有效节点，不能把 `var(--number)rpx` 拼成长度 token。

字号合法性标签同时参加变量和字面量两侧签名。完整声明序列、值、重要性、选择器和其他声明仍必须匹配；不删除 `line-height`，不展开未知外层变量的 fallback，也不调整已有 margin 证明和普通属性的计算阶段边界。

## 验证

- 固化 82 项持久回归。确认测试别名满足现有 safe class 格式后，在未接入字号证明的原签名路径重跑：30 项合法字号正例失败，52 项负例通过，错误明确包含实际消费别名 `wtu-fontsize-0`。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-font-size-proof.unit.test.ts test/watch-hmr-class-declaration-proofs.unit.test.ts test/watch-hmr-class-variables.unit.test.ts test/watch-hmr-class-evidence.unit.test.ts test/watch-hmr-dynamic-scope.unit.test.ts test/watch-hmr-removed-rules.unit.test.ts --update=none`：6 文件、313 项通过，无跳过。
- 正例覆盖基础单位、百分比、零、科学计数法、完整变量链、相同根重声明，以及保留全部相同行高声明后的完整规则；负例覆盖负值、溢出、关键词、字符串、函数、拼接、非法 fallback、覆盖、循环、声明增删和顺序。
- 保存现场的两条完整声明被固化为负例，证明字号修复不会掩盖动态行高丢失。这里只使用最小化持久用例，没有修改或重新生成保存现场。
- 两个源文件通过 ESLint，显式关闭 `format/prettier`。按 PostCSS 项目配置启用 strict、exactOptionalPropertyTypes、noUncheckedIndexedAccess 并关闭 noCheck，通过 TypeScript API 逐文件取得两个源文件的语法与语义诊断，均为零；不将此描述为全包类型检查通过。
- 提交前执行 `git diff --check`、`pnpm agents:check` 和 `pnpm release status`。

## 适用边界

本次未运行设备、IDE、浏览器、真实 watch 或全面测试；真实链路由主流程结合 producer 修复重新验收。严格证明有意不覆盖字号关键字与 `calc()`，不能作为通用 CSS 求值器。

中文变更意图：为工程 watch 样式证据补充受限字号合法性证明，消除已证明根变量与合法字面量的误拒绝，同时继续拒绝声明丢失和不安全展开。签名模块仍只被工程脚本按源码路径消费，不在 PostCSS 发布入口导出；已检查发布计划，本次不新增公开包 change intent 或版本提升。

没有修改 demo、样式生成、构建产物或 static 预期，因此无需重建 static 基线。

## 规则评估

不新增 AGENTS。现有 CSS 解析所有权、先红后绿、完整样式证据和真实链路验收规则已覆盖本次修复。
