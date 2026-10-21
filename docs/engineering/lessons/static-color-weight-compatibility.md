---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: a529f6bcb090c97e8babda1f02af41832f0465a8
regressions:
  - e2e/tailwind-mini-program-alpha-limit.test.ts
  - e2e/color-mix-static-root-browser.test.ts
  - packages/postcss/test/color-mix-alpha-semantics.test.ts
  - packages/postcss/test/color-mix-static-supports.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/v4-incremental-compat-context.test.ts
---

# 静态颜色权重与增量资格失效

## 症状

用户只授权将未知运行时颜色权重登记为小程序限制，要求保留静态百分比支持。新增完整生成回归确认，明确的 root `--weight-zero:0%` 及完整别名链仍只输出原色 `rgba(255,0,0,.4)`，没有乘以权重。该范围不能套用动态限制。

修复完整生成后，另一个真实增量回归失败：首次折叠为 alpha `0.2`，随后新增 `[--weight:25%]` 或 `[--alias:25%]` 局部覆盖时，增量仍保留旧 rgba。相同候选的独立完整生成已经撤销静态资格。删除覆盖后恢复、再次新增覆盖也需分别核对，不能只证明首次加载。

## 根因与纠正

第一层是 resolver 忽略已收集的安全静态变量表，直接对 `var(--weight)` 进行百分比解析。现在复用完整依赖分析后的变量替换，再检查严格的百分比类型、0–100 范围并乘以原色 alpha。未知、局部、媒体、supports、注册、冲突、循环及未解析 fallback 依赖继续拒绝静态化。

第二层是 Tailwind 4.3.3 的生成结构包含基础色 fallback，以及嵌套的准确正向 `@supports (color: color-mix(in lab, red, red))` 分支。只转换声明仍会被后续清理删除，最后留下错误基础色。小程序生成链现在仅对这一准确能力查询降低完整可证明的分支：直接子节点只能是普通、完整且可解析的 mix 声明与评论；祖先只允许普通规则、layer、media 和根。保留原位置、前后声明、重复属性、important、所有评论及外层条件。未知、否定/组合条件、动态子声明、自定义属性、keyframes、scope 等均不提升；Web/Lynx 默认入口不启用该选项。

第三层是增量失效只额外比较 calc 上下文，`cssCalc:false` 时不会撤销旧颜色兼容结果。缓存现在保存完整生成产物的静态兼容资格，新增候选改变值或资格时重新转换已有规则，与 calc 开关独立。原始签名或 calc 已经要求全量时不再额外分析；可追加路径仅分析新的完整 CSS 一次，并把同一张表传入增量转换，避免反复分析旧/新上下文。新增、删除、再次新增均与独立完整生成严格比较。

## 验证

以下均为基于 `a529f6bcb090c97e8babda1f02af41832f0465a8` 加本轮未提交修复的 macOS arm64 定向验证，Node 24.18.0、pnpm 12.14.0、Tailwind 4.3.3：

- 完整生成正向首次 1 项失败、5 项通过；低层静态别名首次 5 项失败、51 项通过。原始红例日志分别为 `.tmp/static-root-alpha-red.log` 和 `.tmp/static-root-alpha-unit-red.log`。
- 先修 resolver 后完整生成仍失败，才定位到 supports 清理；没有把错误 fallback 放入期待值换取通过。
- 增量首次 2 项失败、3 项通过；修复后 4 文件 54 项通过。命令：`CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/tailwindcss/v4-incremental-compat-context.test.ts test/tailwindcss/v4-style-context.test.ts test/tailwindcss/v4-incremental-artifact.test.ts test/tailwindcss/v4-incremental-config-mutation.test.ts --update=none --coverage.enabled=false`。
- PostCSS 包 154 文件、1,818 项通过，3 项既有跳过。命令：`CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none --coverage.enabled=false`。
- 完整生成与三浏览器颜色回归 3 文件 15 项通过。命令：`CI=1 LYNX_THEME_BROWSER=all pnpm exec vitest run --config e2e/vitest.e2e.config.ts e2e/color-mix-static-root-browser.test.ts e2e/tailwind-mini-program-alpha-limit.test.ts e2e/color-mix-alpha-browser.test.ts --update=none`。后台浏览器均在 finally 关闭。
- 主包 Tailwind、升级和架构定向回归 63 文件、507 项通过，1 文件、7 项既有跳过。命令：`CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/tailwindcss test/v5/tailwind-v4-upgrade-generator-coverage.test.ts test/ci/architecture-contract.test.ts --update=none --coverage.enabled=false`。
- 现有 Lynx static、RN static/Metro 三端导出与 CI 合同 3 文件、54 项通过，没有更新历史报告或 static 基线。命令：`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-capabilities-ci.test.ts e2e/lynx-static-evidence.test.ts e2e/react-native-compatibility.test.ts --update=none`。RN 的导出不是原生宿主运行。

新浏览器测试最初还把原始 Oklab 计算值重新写入 Canvas，与独立 rgba 逐字节比较；Chromium 的 25% 样本 red 为 245/255，WebKit alpha 为 25/26，而原始计算透明度均为 0.1。诊断保存在 `.tmp/static-root-alpha-browser-diagnostic.log`。这条 round trip 包含浏览器色彩转换与量化，不作为生成器输出 oracle：最终测试对生成 rgba 与独立 rgba 的 Canvas 字节精确相等，同时单独精确验证原始 mix 的计算透明度。未改既有像素门槛，也不声称原始 mix 的 round trip 字节等价。

本轮新增隔离生成夹具，没有修改 demo 或共享能力清单；既有 static 身份不应因测试代码变更而更新。完整生成断言包含前置基础色及随后正确 rgba 的全部有序声明，不能只检查正确颜色存在。包构建使用本工作树，正式全面流程仍需新扩展预检，不能复用此前 lease。

## 适用边界

上述证据覆盖生成、转换、浏览器计算值/Canvas 参考及增量资格生命周期，不是微信 IDE 或原生设备运行结果。未知运行时权重限制、候选级诊断及统一转换 oracle 的缺口保持；也不等于所有 CSS 数学函数或第三方插件都可静态化。PR、main、完整验收与性能结果须分别绑定实际 SHA，旧提交通过不能代替新提交。

## 规则评估

不新增 AGENTS 规则。已有完整依赖、先红后绿、支持预期和证据分层规则已覆盖本次失效；修复应落到负责的 resolver、小程序兼容和增量缓存模块。
