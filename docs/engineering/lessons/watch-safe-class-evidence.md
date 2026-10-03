---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1002
baseline: 9cd841730a297b0f60d9e3e726c5276533674b40
regressions:
  - packages/weapp-tailwindcss/test/watch-hmr-class-evidence.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-regression.unit.test.ts
---

# Watch 产物的 safe class 证据

## 症状

uni-app x VDOM 的 template watch 轮次等待原始转义类 `text-_b23_d000040px_B` 超时。实际 WXML 已消费 `wtu-dpkldy-0`，组件 WXSS 也存在对应 `font-size: 23.000040px`；旧断言只认 utility 的转义字符串，不能识别组件本地 safe class。与此同时，用户复现场景的正文也含 utility 名称，对整份 WXML 做字符串包含判断会产生假阳性。

## 根因与纠正

断言需要验证 token、产物类名与 CSS 规则之间的关系。共享证据层从 WXML 的真实 `class` 属性或 JS AST 字符串候选提取完整 token，并将 safe class 的 CSS 与原 utility 参考规则比较。CSS 解析与选择器签名位于 `packages/postcss`，私有 watch 工具只编排产物和阶段。参考 CSS 沿已登记样式产物的相对 `@import` 获取，不猜测主样式文件名或 alias hash。

签名保留选择器结构、条件、声明顺序、`!important` 和同选择器规则的层叠顺序；scope 必须来自对应属性组，且仅能从目标 alias 所在的同一 compound 消除。拒绝缺失参考规则、缺失 alias 规则、空规则、错误声明及正文、注释、其他属性中的假 class。重复的完整规则块按最后一次保留，不交换不同声明块的顺序。

初版 `9cd841730` 的 scope 消除没有区分 compound，交叉复审发现 `.data-v-a1 .alias` 和 `.alias .data-v-a1` 会因首尾空 compound 被解析器折叠而误当成 `.alias`。消费节点上的 scope 不能证明祖先、兄弟或后代有同一 scope。新增负例先确认两项失败，再将消除范围收紧到 alias 的同一 compound；未证实的其他节点条件保守保留，不推导任意 DOM 结构。

template、script、userReported、added-class、main-style 和 same-class-literal 共用证据；回滚保存先前成功阶段的全部匹配 alias，不能从回滚后的 CSS 重新推导旧类，否则 CSS 已删除、旧 alias 仍留在代码时会漏报。基线已有类和明确保留的 utility 不计为回滚残留。added-class 与 same-class-literal 的回滚改用现有严格等待接口，防止语义断言失败后仍凭 mtime 放行。

## 验证

本次仅运行定向、无设备回归：

- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-class-evidence.unit.test.ts test/watch-hmr-class-baseline.unit.test.ts test/watch-hmr-regression.unit.test.ts test/watch-hmr-runner.unit.test.ts test/watch-hmr-style-only.unit.test.ts test/watch-hmr-comment-carrier.unit.test.ts --update=none`。
- `CI=1 pnpm exec tsc --ignoreConfig --noEmit --target ESNext --module ESNext --moduleResolution bundler --skipLibCheck --esModuleInterop tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class/evidence.ts`，以及改动实现文件的 ESLint 检查。
- `pnpm agents:check` 与 `git diff --check`。

初版上述 6 个测试文件共 167 个用例通过，其中新增证据回归 33 个。scope 归属修正后另增 8 个正反例，同一 6 文件复验共 175 个用例通过；新模块类型、实现文件 ESLint、规则与 diff 检查也通过。回归覆盖原转义类、正确 alias、错误或缺失 CSS、伪类、后代、媒体条件、层叠顺序、scope 归属、正文与注释假命中、多 alias、CSS 删除后的代码残留，以及各 watch 断言入口。旧 added-class 生命周期 fixture 改为合法 JS 字符串，继续验证回滚编译稳定窗口。

## 适用边界

这是编译产物验收修复，不证明设备已渲染或保留页面状态。JS 证据是解析后的静态字符串候选，不是一般性的跨函数数据流或运行时绑定证明；真实消费仍需 IDE/live 门禁。本轮未启动 HBuilderX、微信 IDE、浏览器或设备，未修改 case 验证开关、实时页面例外、demo 源码和 static 基线，因此记录为 partial。

同轮观察到 `space-y-2.5` 被替换成 safe class 后缺少对应 CSS，属于独立产品缺陷。本断言必须继续拒绝此输出，不能用另一 token 的成功、最低命中数量或任意 `wtu-*` 放行。产品修复与重新预检后的真实 watch 验证由主任务另行完成。

## 规则评估

不新增 AGENTS 规则。现有产物证据、解析器归属、持久回归和全端预检约束已覆盖本问题；缺口通过共享断言及回归修复，不扩大例外或降低验收要求。
