---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1214
baseline: 2e2473f7b2667b25c1961d01beff06ad3fe3ac83
regressions:
  - packages/postcss/test/rpx-theme.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/v4/rpx-theme-warning.test.ts
  - packages/weapp-tailwindcss/test/bundlers/rpx-theme-warning.integration.test.ts
  - packages/weapp-tailwindcss/test/ci/architecture-contract.test.ts
---

# rpx 主题变量的建议性诊断

## 症状

微信 DevTools 已观察到运行时 rpx 乘法与直接长度的差异，详见 Issue。构建合法并不证明尺寸正确。诊断最初只检查当前入口字符串，通过本地 CSS 导入的主题在 legacy 和 graph 两条路径均漏报。

## 根因与纠正

- 入口字符串不等于完整主题来源。复用已有源码扫描阶段的依赖图和 PostCSS Root，收集主题变量元数据传给共享生成流程；不在产物阶段为诊断重新读取源码。
- CSS 值解析和主题遍历归 PostCSS 包所有。主包只负责平台识别、来源合并、日志等级及 runtimeState 会话去重。
- 检查输出的时机在共享生成流程完成框架 PostCSS 重放和作用域样式组合之后。单独 inline 仍可能产生字面量 calc，不能只检查 var 引用。
- 迁移 v4 生成样式适配和重复的自定义属性收集到 PostCSS 包，保留主包 facade。合并变量时直接写入既有 Map，省去中间 Map；无相关标记的大输入直接返回，已有 AST 不重复解析。本次不据此宣称端到端构建加速。
- 对照日志开关时必须保留 opts 对象身份；复制 opts 会失去以对象为键保存的框架 PostCSS 上下文，造成无关产物差异。

## 验证

- 主包定向 Vitest：风险策略、真实生成、style-context、css-calc、source-options、source-package-resolution、generator-css、architecture-contract，8 文件 234 用例通过。真实生成包含 legacy/graph、导入主题、inline、静态化、其他平台、静默、重复生成和新会话。
- PostCSS 全包：80 文件，807 通过、3 个既有用例跳过。新增用例覆盖 1/3/偶数 rpx、小数、负值、紧凑乘除表达式、字符串/URL 排除、无效 CSS 和大输入快速路径。
- 执行命令：`CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/rpx-theme-warning.integration.test.ts test/tailwindcss/v4/rpx-theme-warning.test.ts test/tailwindcss/v4-style-context.test.ts test/tailwindcss/v4-engine-css-calc.test.ts test/tailwindcss/v4-source-options.test.ts test/tailwindcss/v4-source-package-resolution.test.ts test/bundlers/generator-css.unit.test.ts test/ci/architecture-contract.test.ts --update=none`。
- 执行 `CI=1 pnpm --filter @weapp-tailwindcss/postcss test --update=none`。
- 迁移相关引擎回归：`CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/tailwindcss/v4-engine.test.ts test/tailwindcss/generator-index.unit.test.ts --update=none`，2 文件 63 用例通过。
- 执行两个包的 `build`，包括类型声明检查；文档站 `build` 包含 `check:config-docs` 和 `check:docs-i18n`，中英文构建成功。保留已有 mixed exports、模块类型和字体 CSS minimizer 警告。
- 执行 `pnpm agents:check`、`pnpm release status` 与 `git diff --check`。中文 patch intent 覆盖主包和 PostCSS 包。
- 本次没有改 demo、IDE 复现页或已有 static fixture；单测直接使用临时输入并断言 CSS/classSet 等价。文档静态索引已随文档构建重新生成。

## 适用边界

仅明确识别为微信的平台和 weapp 输出触发，未知平台不推断为微信。一次提示不是全部产物的风险清单；后续 bundler 插件仍可能改写 CSS。只诊断已取得的主题源码及入口依赖图，不额外递归扫描任意业务文件。

没有相关 calc 不等于设备验证通过；内联 rpx 提示不保证表达式来自指定主题。解析失败不阻断构建。偶数 rpx 不保证安全，也不能断言微信内部采用某个四舍五入算法。本次没有新增真机、Skyline 或完整框架 HMR 验证，不宣称修复微信运行时计算。

## 规则评估

不新增 AGENTS 规则。已有 PostCSS 所有权、源码扫描边界和事实/假设区分足够覆盖本次任务；通过架构测试防止已迁移模块重新实现 AST 转换。本次迁移仅覆盖相关 v4 生成适配和变量收集，不宣称全仓历史 CSS 处理已全部迁移。
