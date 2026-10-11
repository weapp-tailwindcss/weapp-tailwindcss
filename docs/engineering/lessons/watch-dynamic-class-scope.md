---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: fd81fee3c9fc342446a669b91d89092d3959a54f
regressions:
  - packages/weapp-tailwindcss/test/watch-hmr-dynamic-scope.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-class-evidence.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-removed-rules.unit.test.ts
---

# Watch 动态 class 的消费者 scope 归属

## 症状

uni-app x alpha 微信 watch 在 `mutation=script round=baseline-arbitrary phase=add` 首次新增时失败，seed 为 `000068`。日志指出 `text-[23.000068px]` 缺少 class/CSS 证据，实际 JS 已含 `wtu-11axwgi-29`，页面 WXSS 也有带 `data-v-00a60067` 的完整 `font-size:23.000068px` 规则。主样式中的原 utility 参考规则同样存在。

当轮预检标识为 `edab1850-3352-4d60-8eb1-56ece3a3875a`。失败快照保存在该轮 `wechat-followup/watch-script-first-add`，含原始 UVue 源码和 JS、WXML、WXSS；`.tmp/alpha-wechat-cascade-final.log` 第 382 行记录自然失败。本记录保留关键结构与持久回归，不把本机绝对路径作为复现前提。

## 根因与纠正

真实 WXML 消费结构为 `class="{{['weapp-tw-border', 'data-v-00a60067', c]}}"`。旧实现按空白切分整段属性值，读到的是含引号、逗号的 `'data-v-00a60067',`，因而无法证明 alias 与 scope 在同一节点上。旧实现还把所有动态 class 的 scope 合并后用于任意 JS 字符串，这会借用无关消费节点的条件。

现在将模板表达式解析、编译绑定关联与 CSS 比较分开：

- 模板层保留静态 class 的完整 token；完整插值表达式使用 TypeScript AST 解析，只证明无条件字符串、数组及直接标识符，不通过删引号或标点猜测类名。条件、拼接、展开和语法错误均不提供 scope 证据。模板标签栈跟踪当前及祖先循环的 item/index 绑定，排除局部遮蔽；命名模板数据、WXS 模块和损坏的嵌套边界也不能作为顶层 render 绑定。WXS 原文不按标签解析，避免其注释或字符串中的伪标签提供 class 或 module 证据。
- 脚本层确认唯一 `wx.createPage` 或 `wx.createComponent` 注册消费同一 `_export_sfc` 产物，再沿其组件和 render 附件读取 `defineComponent` 的直接 `data()` 返回值，把 render 返回字段 `c: vendor.n(dataParameter.__twWatchClass)` 关联到具体字符串节点。data 参数按编译器位置识别，不依赖 `$data` 这个变量名。含展开、重复键或覆盖 data 的 export 附件不参与证明。
- scope 仅补充到该字符串在对应模板消费者上的证据组。同一字符串被不同节点使用时保留独立组，不合并出不存在的 scope 组合。重复字段、展开对象、未关联 render、不同 helper 命名空间以及同名的无关对象均不提供证明。
- 回滚沿用完整 token 提取，继续发现表达式数组中残留的旧 alias，即使对应 CSS 已删除。

这延续了[既有 safe class 证据](watch-safe-class-evidence.md)的完整规则比较与消费者边界，不改变 CSS 生成或签名语义。

## 验证

实现前先运行新增回归：真实编译结构、WXML 数组和数组内残留 alias 共 3 项失败，其余 23 项反例通过。实现后继续补充参数改名、异步和 generator data、可选调用、重复参数及损坏脚本等边界。交叉复查发现循环变量遮蔽、未注册组件和展开 render 附件三个证明缺口，追加反例先确认 7 项失败，再收紧词法归属与注册链。

- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-dynamic-scope.unit.test.ts test/watch-hmr-class-evidence.unit.test.ts test/watch-hmr-removed-rules.unit.test.ts test/watch-hmr-class-variables.unit.test.ts test/watch-hmr-class-declaration-proofs.unit.test.ts test/watch-hmr-class-baseline.unit.test.ts test/watch-hmr-regression.unit.test.ts test/watch-hmr-runner.unit.test.ts test/watch-hmr-style-only.unit.test.ts test/watch-hmr-comment-carrier.unit.test.ts --update=none`：10 文件、363 项通过，无跳过，其中动态 scope 回归 42 项。
- 最终复核另补 WXS 原文伪标签和 data 附件覆盖两个负例，修正前均失败。修正后用 `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-dynamic-scope.unit.test.ts --update=none` 验证 44 项全部通过，并重跑实现 ESLint、定向 strict 类型及真实失败快照回放；独立只读复核通过。
- 使用当前证据函数只读加载首次失败快照的源 token、JS、WXML；通过既有 `readJoinedOutputFiles` 从 app 和页面样式沿导入读取 uvue、main 参考规则：10 个 utility 全部匹配。`text-[23.000068px]` 对应 `wtu-11axwgi-29`，未修改快照或重启构建。
- 3 个改动实现文件通过 ESLint；测试文件遵循仓库配置不参与 ESLint，由 Vitest 验证。
- 新增解析与关联模块通过定向 `pnpm exec tsc --ignoreConfig --noEmit --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --module ESNext --moduleResolution Bundler --target ESNext --esModuleInterop --skipLibCheck` 检查。首次命令缺少当前 TypeScript 所需的 `--ignoreConfig`，报 TS5112 后补齐参数通过；不将参数错误当成源码错误。
- `pnpm agents:check` 与 `git diff --check` 通过。

主任务在 `bbb5c597300c0d9da6a2c42cedd5cf0f3b07b730` 完成新预检 `efbec914-eb36-474e-9c79-52d6f22bfb56`，包含当前会话后台 computer use 的实际输入、点击、截图和 verify。真实微信 IDE 3 项通过；随后 watch 的模板/脚本基础任意值、复杂集合、HEX 三轮新增与删除、已有节点 added-class 和 same-class-literal 场景完成。此前脚本首轮缺少 scope 的失败没有重现。

该轮在后续独立用户回归 `index text-xs to text-[29px]` 的基线 class/CSS 证据失败后自然退出 1，未自动重跑，不能记为整轮 watch 通过。`text-xs` 的根规则保留主题变量与动态行高，页面 alias 是静态值，需另外定位生成与证据边界；本次动态 scope 修复不放宽它。原始日志及首次剩余产物保存在 `e2e/.artifacts/uni-app-x-alpha/efbec914-eb36-474e-9c79-52d6f22bfb56/wechat-followup/`，后者注明源码已由 runner 恢复。最终主工作树组合回归为 12 文件、379 项通过（与上面集合重叠，不累计）。

## 适用边界

本次只修复私有 watch 工具的静态证据判断。它识别已观察到的 uni-app 编译绑定形态，不实现通用 JS 求值、跨函数数据流或任意动态 WXML 求值；不能证明运行时渲染、HMR 时限或页面状态保留。现有 JS 字符串自身携带 scope 的证据仍受原有静态候选边界约束。

子任务的静态回放与主任务后续真实 watch 证据分别如上；完整 watch 因另一个基线证明问题仍失败，因此记录为 partial。没有修改 demo、输出样式或 static 预期，不更新 static 基线；没有公开包行为变更，不新增 change intent。性能预算是独立验收，不能用动态 class 场景通过宣布其通过。

## 规则评估

不新增 AGENTS。现有完整 token、消费者归属、产物证据和先红后绿的回归约束已覆盖本问题，缺口由共享证据实现与持久测试补足。
