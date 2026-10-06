---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: a7957008181da96581d147ec29714f80ceff0012
regressions:
  - packages/weapp-tailwindcss/test/watch-hmr-nested-fallback-proof.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-font-size-proof.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-class-declaration-proofs.unit.test.ts
---

# Watch 嵌套变量中冗余 fallback 的证明

## 症状

真实微信 watch 轮次 `38080399-6586-4c13-be26-d1dec4cf92fe` 仍在 `user reported index text-xs to text-[29px] baseline wxml` 拒绝 `text-xs`。此时生产修复已经保留动态行高，字号的严格合法性证明也已生效。

保存产物的原规则为 `font-size:var(--text-xs);line-height:var(--tw-leading,var(--text-xs--line-height))`，safe alias `wtu-1gr1ye4-b` 为 `font-size:24rpx;line-height:var(--tw-leading,var(--text-xs--line-height,calc(1 / 0.75)))`。无条件主题根分别声明 `--text-xs:24rpx` 和 `--text-xs--line-height:calc(1 / 0.75)`，没有该主题变量的覆盖或注册。

完整签名比较确认字号、选择器、声明顺序和重要性都一致，唯一差异是内层变量新增的逗号与 `calc()` fallback。外层 `--tw-leading` 仍含空值或局部赋值，不能把它视为缺失或选择它的 fallback。

## 根因与纠正

原 `resolveNodes` 遇到无法证明的外层 `var()` 时，保留整段原始 AST，不继续识别内部永远不会使用的 fallback。已有删除冗余 fallback 的序列化器只在自定义属性定义路径使用，且仅允许单个有限数值 token。

普通声明中的外层 `var()` 语法完整有效时，现在在保留变量名称、函数结构与 fallback 位置的同时，递归识别内层冗余 fallback。只有内层主绑定通过原有无条件根、完整依赖、无覆盖与无注册证明，且 fallback 是无依赖的静态数值，才删除这个永远不会选择的部分。未知变量始终保持未解析状态，不内联变量本体，也不选择外层 fallback。

本路径额外支持受限的纯数值 `calc()`，复用原始 AST 的算术证明，要求每步运算有限、除数非零、加减号两侧有真正空白，运算符不能来自字符串。变量绑定解析器固定返回不可用，因而显式变量、转义变量、URL、env、attr、未知函数、长度运算和非法算式都不能通过。自定义属性定义不启用新增 `calc()` 范围，保留此前依赖图与循环拒绝边界。

完整外层变量语法无效时不递归规范化。所有原有根绑定安全检查、展开预算和属性合法性证明继续生效；本次没有扩大 `line-height` 的完全内联范围。

## 验证

- 初始 67 项持久回归在修复前有 16 项正例失败、51 项负例通过。独立复查后补充转义变量依赖及转义同名局部覆盖，最终本文件 70 项。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-nested-fallback-proof.unit.test.ts test/watch-hmr-font-size-proof.unit.test.ts test/watch-hmr-class-declaration-proofs.unit.test.ts test/watch-hmr-class-variables.unit.test.ts test/watch-hmr-class-evidence.unit.test.ts test/watch-hmr-dynamic-scope.unit.test.ts test/watch-hmr-removed-rules.unit.test.ts --update=none`：7 文件、383 项通过，无跳过。
- 通过现有 `readJoinedOutputFiles` 读取完整保存产物，再调用未经改动的 `assertClassTokensInOutput`：本轮 `text-xs` 匹配 `wtu-1gr1ye4-b`，旧轮次 `efbec914-eb36-474e-9c79-52d6f22bfb56` 丢失动态行高的产物仍拒绝。没有修改归档、过滤声明或替换断言。
- 两个源文件按 PostCSS 项目配置关闭 `noCheck`，通过 TypeScript API 逐文件获取 strict 语法和语义诊断，均为零；此结果不代表全包类型检查。
- 三个 TypeScript 文件执行 `eslint --no-ignore`；提交前执行 `pnpm agents:check`、`git diff --check`，保留正常提交 hook。

主流程将修复整合为 `d0f3d5b3b` 后，完成新预检、当前会话后台 computer use 的真实输入/点击/截图、verify 与领取复查。轮次 `004ca84c-cf6c-4c69-a312-decedb1f7e63` 的微信 IDE 3 项通过；完整 watch 的模板、脚本基础任意值/复杂集合/HEX 增删，以及新增类阶段继续推进，但在同类名字面量 setup 时触发原有 420 秒总超时并退出 1，尚未执行后续 `text-xs` 替换，不将保存产物的证明通过改写为真实 watch 通过。

运行前主机为 16 个逻辑 CPU，load average 为 80.292/81.304/70.798。保留的首批非初始 plugin total 共 18 项，中位数 4141ms、范围 2104–12114ms，18/18 超过原有 500ms；未改变预算或自动重跑。高负载与超时同时发生，不能仅据此排除代码性能问题，也不能把本轮耗时直接用于证明修复的速度变化。

日志、进度报告、原始性能样本和 92 份取消时产物保存在该轮 `wechat-followup/`；`first-plugin-samples.json` 只提取原始 `[watch] [weapp-tailwindcss:hmr]` 行，排除初始构建和错误尾重播。`timeout-artifacts/manifest.json` 记录文件哈希与取消边界。退出后源码已恢复、prepare 与 consumer 已结束、本任务进程和临时浏览器页均为零，已有微信 HTTP 19355 的只读登录检查仍为 true。完整 Alpha 16 阶段与扩展 46 阶段均未验收通过。

## 适用边界

完整保存产物的静态证据通过不代表真实 watch 或设备已验收。独立实现阶段未操作设备、IDE、浏览器；主流程随后执行了上述新预检与复验，仍保留超时和未执行范围。

中文变更意图：补充嵌套变量中已证明永不使用的数值 fallback 等价证明，保留外层运行时变量和全部规则内容。签名模块仅供工程 watch 读取器按源码路径消费，未在公开包入口导出，因此不增加公开包 change intent 或版本提升。

未修改 demo、样式生成、产物或 static 预期，无需更新 static 基线。

## 规则评估

不新增 AGENTS。已有根变量证明、完整声明比较、先红后绿和真实链路验收规则已覆盖本次修复。
