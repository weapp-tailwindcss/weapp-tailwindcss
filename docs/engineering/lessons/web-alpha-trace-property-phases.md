---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
regressions:
  - packages/postcss/test/color-mix-alpha-semantics.test.ts
  - packages/postcss/test/css-source-trace-lifecycle.test.ts
  - packages/postcss/test/web-property-fallback-phases.test.ts
  - packages/postcss/test/web-property-framework-normalization.test.ts
  - packages/weapp-tailwindcss/test/bundlers/web-generator-fallback-phases.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-processed-css-source.test.ts
  - e2e/apps-generator-evidence.test.ts
  - e2e/apps-generator-default-precedence.test.ts
  - e2e/color-mix-alpha-browser.test.ts
  - e2e/web-property-fallback-browser.test.ts
verification:
  - claim: 混色、追踪与默认值阶段的 PostCSS 包回归通过
    kind: unit
    status: passed
    sha: c809b4ad5e2fb0352365671ef507ff9fbd9bd996
    environment: macOS arm64，Node 24.18.0、pnpm 12.14.0；包含本任务尚未提交的源码改动；1772 通过、3 跳过
    command: CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none
  - claim: 生成、框架资产、watch 默认值撤销与来源映射定向回归通过
    kind: integration
    status: passed
    sha: c809b4ad5e2fb0352365671ef507ff9fbd9bd996
    environment: macOS arm64，Node 24.18.0；包含尚未提交改动；6 文件 244 项通过
    command: CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/web-generator-fallback-phases.test.ts test/bundlers/webpack-processed-css-source.test.ts test/bundlers/vite-css-finalizer.unit.test.ts test/bundlers/generator-css.unit.test.ts test/bundlers/vite-web-css-calc.test.ts test/bundlers/vite-final-css-calc.test.ts --update=none
  - claim: 三浏览器验证完整合并资产的默认、反向与恢复间距，以及框架零长度 ring
    kind: integration
    status: passed
    sha: c809b4ad5e2fb0352365671ef507ff9fbd9bd996
    environment: macOS arm64，Chromium、Firefox、WebKit 后台运行；包含尚未提交改动；6 项通过
    command: CI=1 LYNX_THEME_BROWSER=all E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/web-property-fallback-browser.test.ts --update=none
  - claim: 当前源码的原生、全仓与独立 Tailwind 全目标验收仍待执行
    kind: native
    status: pending
    sha: c809b4ad5e2fb0352365671ef507ff9fbd9bd996
    environment: 当前工作树完成提交后，重新扩展预检与真实会话交互
    reason: 历史预检已消费，当前尚未获得新 lease；旧 CI 与合同不替代当前设备或全面证据
---

# Web 混色、来源追踪与注册默认值阶段

本记录接续[监听与原生证据复盘](lynx-native-watch-evidence-followup.md)。main 仍为基线提交；本轮结果包含未提交修复，不能描述为 main 已经全部修复。

## 症状

审查 generator 对照时，发现静态混色原色 alpha 被忽略；来源注释在压缩、规则删除及声明合并后可能丢失或错误归属。旧快照规范化器还会删除部分颜色变量，使 normalized 产物与真实 bundle 不一致。

原始 uni App 资产在 utility 前后各有 21 项默认值块。第二块晚于 `:where(.space-y-reverse > :not(:last-child))`，两者 specificity 都为零，实际会把反向值从 1 改回 0。uni Web compact 同样存在尾部默认值，覆盖 space-x/y、divide-x/y reverse 及 dotted/double；旧基线的默认块在前，这是本轮审查发现的顺序回归，不能直接更新快照接受。

## 根因与纠正

透明混色现在只在原色、字面权重与插值空间能够证明等价时降级，alpha 为原色 alpha 与权重之积。未知变量及 fallback、currentColor、动态权重、非法表达式保留原语义。静态变量收集不再采用 last-write：条件、局部、注册或冲突声明共同否决静态化。作者函数编译后再分析颜色；增量只以完整生成 CSS 为上下文，不能混入原始主题声明。

来源注释使用重要注释通过默认 cssnano，尊重显式 removeAll。真实 AST token 覆盖任意值、转义及含 pipe 的内容；删除规则同步删除所属追踪，合并声明同步迁移来源。Webpack 使用 ReplaceSource 精确编辑，Buffer 先转字符串并保留映射，BOM 使用原始字符偏移。作者说明不按模糊 `tokens:` 文本删除。

纠正先前归因：cyan/blue 并非原始生成器丢失，而是旧 snapshot normalizer 错误裁剪。已删除该裁剪，不把恢复的颜色、注册、动态变量和框架 tag 转换统称为格式变化。

默认值问题发生在构建生命周期：片段先合成 universal reset，框架合并、重放和源码顺序组装再把它放到 utility 后。修复在模块、loader 和 replay 阶段延迟合成；service 在作者 CSS 组合之后收尾，最终 Web bundle 在所有注入完成后分析注册资格。Webpack 的重生成路径与 loader 同样延迟，Lynx 编码前路径保持即时处理。

完整资产集合中的未知、冲突或条件注册共同否决默认值合成，不能只看某一个模块。结构转换只隔离最外层注册并保留原始祖先语境，同一祖先中的普通 theme/layer/nesting 样式继续转换。注册内部的非法子规则不能被拆开，否则可能把无效注册变为有效；结构插件丢失或复制占位标记时返回完整原始 CSS，不猜测恢复位置。作者同签名 reset 保持原位置，不按选择器猜测来源并删除。

延迟合成又暴露两项框架阶段差异，修复前已固化失败回归：后处理过的资产中已有独立 `::-webkit-backdrop` / `::-ms-backdrop` 规则，但新默认值未再经过 Autoprefixer；部分注册的 `0px` 已被框架转换为 `0rem` 或 `0`，严格 token 比较漏掉 ring 默认值。最终合成现在依据本资产明确的选择器证据保留独立前缀分支，不能混成遇到未知伪元素就整组失效的 selector list；仅 canonical 零长度允许标准长度字面零的等价比较，语法、继承、位置和跨资产否决仍严格。通过检查原始十进制尾数，排除 `1e-999rem` 下溢误判，不接纳百分比、时间、rpx 或动态表达式，也不改写作者 descriptor。

已收尾 CSS 没有可靠的合成来源身份，不能在 HMR 中追加新注册后沿用旧默认值；注册兼容开启时改用引擎已有的完整生成结果。最终资产 watch 缓存保存本插件处理前原文，新增冲突后撤销合成，冲突删除后重新分析。trace 生命周期同时暴露了“删除最后规则后剩空容器”的清理遗漏，现自内向外收尾空或仅注释的容器。

## 验证

最初片段与 HMR 六项回归均失败，随后补跨资产冲突、条件祖先、BOM、原始字节与 source map 回归。框架前缀、零长度和同层兄弟样式的新增回归最初为 7 失败；修复及补充非法嵌套后 21 项通过。当前包与定向测试结果见上方验证记录。三浏览器用独立 12px 参考核对计算 margin 及实际几何，覆盖触发前、触发后及恢复；ring 分别在保留注册、移除已知夹具注册以模拟不支持注册两种路径下，对比独立 2px 红色阴影。

generator schema 2 分别归档 raw Buffer 与 normalized CSS，记录原始资产名、字节数、SHA-256、源码提交、tracked diff、未追踪源码摘要、锁与旧 README 摘要。文件使用独立序号，状态固定为 `generated-unverified`。原始证据保存后再执行默认值顺序断言及 snapshot 断言，后续审查与显式基线更新仍须分别进行。

修复后再次采集的 10 组 Web 与 2 组 App 共 62 份 raw、58 份 normalized，120 份摘要及 raw 字节长度全部匹配。五处 ring 默认值恢复，独立前缀规则与标准默认声明一致，uni compact 与 App 不再有尾部 reset。逐组审查后，12 组各执行一次限定 `-u` 更新，再以相同过滤和 `CI=1 --update=none` 复验，24 步全部成功；随后 8 组小程序也在最新源码上逐组禁止更新复验成功。项目包括 Taro Vite/Webpack 的 React/Vue、小程序 uni-app、Gulp、Mpx 与 weapp-vite；Web/App 另外覆盖 uni-app 的 H5 与 Android/iOS CSS 产物。这些 App 构建不是原生运行证据。

完整命令统一为 `CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_PROJECT_FILTER="^<项目>$" E2E_GENERATOR_PLATFORM_FILTER="^<平台>$" pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/apps-generator-mode-compare.test.ts -t "builds retained demos with generator mini-program, H5 web, and App style css output" --update=none`；仅审查后的基线更新步骤将末尾选项改为 `-u`。逐组结果与日志索引为 `.tmp/generator-final-web-app-results.json` 和 `.tmp/generator-final-small-results.json`。最终注册语境恢复实现调整后，21 项框架规范化回归再次通过；没有更新运行时支持预期。

两次采集的 React Webpack compact 原始 app 仍有独立差异：旧产物多出 `.transform`、`.ease-in-out`、来自排除分包的 before-content 候选及 ease 专属元数据；分包本身仍保留对应规则。剔除这三项及本轮默认值变化后，有序 AST 一致。既有 normalizer 与回归在本轮之前已屏蔽相同候选，本次没有新增屏蔽。原始证据分别保留，不能因 normalized 相同声称 raw 全等；候选身份及扫描时序未被完整采集，具体来源范围根因仍待证明。

## 适用边界

完整单资产的顺序修复不证明独立 CSS 资产动态加载顺序安全。现有产物图没有证明所有 HTML link 或异步插入顺序，也没有全局共同 root；legacy flatten 后，后加载资产的重复 universal 默认仍可能覆盖另一资产的零 specificity utility。这部分必须保持待验证，不据单资产去重宣称全局级联已经修复。

把 `0rem` 识别为等价零长度，只证明合成的 `0px` fallback 数值安全，不证明框架改写后的 descriptor 在每个引擎中均满足 computationally independent 注册要求。作者注册保持原文；三浏览器 ring 比较不能扩展为全部注册描述符的运行时支持证明。

准确远端 head `0cc9753cb30482cbc33e6e9c0b640c17275b23a9` 的性能失败继续保留：Taro Vite React 小程序 plugin HMR P95 +33.30%。同 SHA、Node 22、同 baseline 和 3/3 采样配置的本地独立复现本次通过，但不能消除远端失败或证明其为噪声。采集协议的 build/output 关联问题仍待独立证据，不以该假设撤销原失败。

原生双端当前源码、RN 实际 served bundle/HMR、Image/ScrollView、RN/Lynx 注册夹具、独立转换 oracle、六类 Web variant 与微信登记能力仍有缺口。全面流程必须使用新一轮 prepare --extended、当前会话真实 computer use、verify；任何失败立即停止调度。本文保持 partial。

本轮只读覆盖审查进一步确认，运行不能填补尚未实现的合同：RN/Expo 每目标仅绑定 33/1293 个注册条目，微信 11/1293，Lynx 的注册映射仅 aspect/size 两项；未绑定条目明确写入 `not-run`。全部默认 completion 虽进入转换，独立 oracle 只有微信 848 项、RN 1599 项、Lynx 41 个正向及 3 个拒绝合同。inventory 保存的有限 modifiers 尚未全部展开，不能把基础候选批处理等同全部有限 modifier 组合。

Web 的 `pointer-none`、`any-pointer-none`、`contrast-less`、`inverted-colors`、`autofill`、`visited` 缺口只保存在 coverage artifact，没有进入逐例 results，因此报告全绿仍须核对 `runtime-coverage.json`。RN 三阶段真实宿主/PNG/source/encoding 已经归档并逐阶段重验，缺的是实际 served bundle 和统一 HMR 层，不能说只采了最终报告。微信 18 个样式夹具的几何尚无独立断言，像素 oracle 仅覆盖 background；29 个 Web 指令/扫描夹具尚未实现逐指令 HMR。

统一 v2 完整性验证只约束已传入的 contracts，不会发现完全没登记的能力；`assertCapabilitySuccess` 又会拒绝所有 `not-run`。所以当前未过滤的 15 目标不可能整体通过，实际执行后应将产品失败、环境阻塞和实现缺口分开记录。入口分别为 `e2e/tailwind-capabilities/report.ts`、`native-adapter.ts`、`weapp/coverage.ts`、`lynx/contracts.ts`、`web/variants/gaps.ts` 与 `inventory/collect.ts`；本段是源码审查结果，不代表执行了当前设备或最新 15 目标。

## 规则评估

没有新增或放宽 AGENTS 规则。用精确资产阶段、原始证据、语义断言和来源生命周期测试落实已有边界；不提高性能、超时、像素、支持预期或证据门槛。
