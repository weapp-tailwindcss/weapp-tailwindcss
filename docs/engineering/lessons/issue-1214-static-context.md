---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1214
baseline: f13230380e8474011ac752d578440b4d1d15caf9
regressions:
  - packages/postcss/test/calc-static-context.test.ts
  - packages/postcss/test/calc-explicit-alias-context.test.ts
  - packages/postcss/test/calc-escaped-identifiers.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/v4-calc-escaped-context.test.ts
  - packages/weapp-tailwindcss/test/compiler/core-compiler-generation-cache.test.ts
  - packages/weapp-tailwindcss/test/compiler/core-compiler.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/v4-incremental-artifact.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/v4-incremental-config-mutation.test.ts
  - packages/weapp-tailwindcss/test/compiler/core-compiler-source-cache.test.ts
  - e2e/issue-1214-layout.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/v4-calc-context.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/v4-engine-calc-cache.test.ts
  - e2e/issue-1214-rpx-calc.test.ts
  - e2e/issue-1214-rpx-calc-watch.test.ts
  - e2e/issue-1214-author-css-watch.test.ts
  - e2e/issue-1214-ide.test.ts
  - packages/postcss/test/calc-plugin-lifecycle.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-web-css-calc-units.integration.test.ts
  - e2e/demo-workflow-quality.test.ts
---

# Issue #1214：静态变量必须保留作用域和输出上下文

## 症状

#1234 合并后，单来源固定主题能够输出静态 `rpx`，但仍不能认定问题全面闭环。以本记录基线运行真实生成器：

- `:root { --spacing: 1rpx } .compact { --spacing: 2rpx }` 使普通 `.w-32` 也生成 `64rpx`，条件规则有同样问题。
- 两来源分别使用 `1rpx` 和 `2rpx` 时，eager/deferred 的同一工具类分别得到 `32rpx`、`64rpx`；哪个常量正确取决于最终 CSS 的作用域，不能仅依据单来源结果判断。
- 同一生成器的显式 Map 从 `1rpx` 改为 `2rpx`、正则白名单换成其他变量后，仍命中旧 CSS。
- 新增 `[--spacing:2rpx]` 候选后，仅追加新规则，旧 `w-32` 仍被冻结为 `32rpx`。

基线真实 uni-app 微信生产构建的局部覆盖和媒体条件覆盖也失败；固定、默认关闭等七项构建通过。这说明既有通过用例没有证明动态主题安全。

## 根因与纠正

旧收集器忽略选择器、条件和层叠，把所有声明压成最后写入优先的 Map。生成结果合并继续丢弃来源，而缓存把 Map 和 RegExp 都序列化成 `{}`。此外，`cssCalc` 隐式开启 preset-env 的全局变量展开，末端清理器又可能删除合法的运行时声明，绕过 calc 白名单。

纠正方式：

- 通用安全分析归 PostCSS 所有，使用有效主题和原始声明判断静态变量；局部覆盖、条件、来源冲突、未知值及依赖链不被强制替换。
- 保留原始上下文，区分显式值与推导声明。合并同一输出时重新判断完整级联，不能简单地各来源先算完再拼接；独立输出不共享上下文。
- 完整和增量生成采用同一规则；新增候选改变变量安全性时重算旧规则，配置变化进入全部相关缓存签名。
- Vite 先保留表达式，在最终 CSS 产物图中按入口、静态导入和 CSS 导入计算共享作用域，之后再执行单位转换。watch 只对实际复用的资产对象恢复原始表达式，不把新产物中的同值常量误认为缓存。原生 App 的嵌入样式保留即时处理。
- 作者 PostCSS 插件先完成全部 visitor，再分析 calc 上下文；单独 `.tw-root`、`:host` 和大小写不同的 `@property` 不得绕过安全判断。
- 移除 `cssCalc` 隐式开启的全局变量展开及启发式原声明删除；保持用户显式 preset-env 配置和 `preserve: true` 的独立语义。
- 保留布尔 `cssCalc: true` 的选择语义，不在 Tailwind v4 归一化时变成空白名单；顶层和嵌套配置合入同一份默认值，避免嵌套的未指定字段意外清空安全 preset。
- 增量颜色降级与 UVUE 使用独立的推导主题上下文，不重新把推导 Map 当作 calc 显式常量。作者插件内部处理器完成后，通过公开 `markDirty()` 恢复全部节点的外层 visitor，保证选择器转义和 `@property` 清理继续执行。
- 显式常量只能覆盖求值候选，不能擦除 CSS 原始声明的依赖图；动态依赖、循环、未解析别名和 CSS-wide 值仍阻止静态化。compiler 来源缓存按内容、输入类型与解析工作目录生成签名，并保存自有快照，避免调用方原地修改 source/sourceOptions 后复用旧生成器。
- 声明名、依赖、`@property`、显式 Map 和字符串白名单按 CSS token 统一转义身份；等价拼写的局部覆盖不能绕过安全判断。名称保持大小写敏感，正则匹配使用独立实例，既不读取也不改写调用方的 `lastIndex`。
- 候选增量以原生编译器的完整产物核对依赖和节点顺序；新增主题、keyframes、`@property`、颜色降级结构或级联顺序变化时完整转换。不能仅靠 `candidatesToCss` 追加工具类，否则从 `block` 新增 `w-32`、清空后重加等场景会漏主题；规则集合相同但顺序不同也不能视为安全追加。
- 可选 `--quality` 把质量检查和本地 demo 多端测试放在同一个真实预检会话内，缺证或失败即停止。
- 真实 watch 进一步发现普通作者 CSS 没有进入小程序任务缓存签名，删除覆盖后仍输出旧声明；现在缓存包含本轮完整 bundle 原文，普通兼容处理结果也不能登记为生成来源。导入关系变化由实际模块图驱动。

## 验证

定向命令均使用 `CI=1`；正常验证使用 `--update=none`。本次 static 基线来自真实 uni-app 构建，更新仅限 #1214 用例，更新后再执行不更新验证。局部、条件及独立作者 CSS 的基线保留 `calc(var(--spacing)*N)`；未解析的别名继续保留 `--spacing: var(--runtime-spacing)`，不提前将工具类改成内部依赖名。

```bash
pnpm --filter weapp-tailwindcss exec vitest run test/tailwindcss/v4-calc-context.test.ts test/tailwindcss/v4-engine-calc-cache.test.ts test/tailwindcss/v4-engine-css-calc.test.ts test/tailwindcss/v4-style-context.test.ts --update=none
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1214-rpx-calc.test.ts e2e/issue-1214-rpx-calc-watch.test.ts --update=none
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow-quality.test.ts e2e/preflight-gate.test.ts --update=none
```

真实构建使用本工作树的 `weapp-tailwindcss` 产物：uni-app `3.0.0-5020620260917001`（Compiler 5.26 vue3）、Tailwind CSS 4.3.3、Vite 5.2.8、Vue 3.5.43、Node 24.18.0、pnpm 12.5.1。固定 `1/2/3/8rpx` 与小数、负值通过。watch 覆盖同一服务中初始输出、主题修改、类名删除与重新添加；另一同进程用例覆盖作者 CSS 未导入、加入导入、移除覆盖、恢复覆盖、删除导入、重建导入、再次移除覆盖七阶段，生成基线后不更新复验通过。逐声明排除旧值，不同产物中的同值重复不当成陈旧样式。

全面验收入口为 `pnpm e2e:demo:workflow:local --quality --preflight-report <本轮-report.json>`，`e2e:ide:full` 显式包含 #1214 尺寸探针。初次 browser discovery 的 `Codex auth token is unavailable` 已恢复，后续完成真实 computer use 六步操作。预检另发现 HBuilderX 中文未启动提示被误判为 host，已补回归修复；Alpha CLI 与活动稳定版实例不匹配后，重新固定稳定版 5.26。Pura、Pixel_5、iPhone 17 Pro 的脚本探针和真实 computer use 在新一轮预检全部通过。

首次全面工作流的 `pnpm build` 为 68/68 任务成功、0 缓存命中。根脚本沿用跳过交互式 Taro/uni 构建的设置；这个汇总不能代替对应 demo 的实际构建或设备验收。随后工作流把内存报告写进未忽略目录，门禁正确识别为源码变化并阻断后续阶段。报告已迁入 `e2e/.artifacts/demo-e2e-memory/`，新增真实临时 Git 仓库回归，证明反复写报告不改变源码身份，而修改源码仍会被检测；41 项报告、矩阵与门禁回归通过。修复后需重新预检和执行完整工作流，不复用该轮报告。合成门禁回归不能充当设备证据，定向通过也不代表全面通过。

根构建还暴露 Gulp 启动脚本引用已不存在的 `tsx/dist/loader.cjs`，随后尝试一系列未安装的替代加载器。现在通过 Node 的公开 `--import tsx` 入口启动 Gulp，starter 微信/抖音构建、demo 抖音构建通过；`E2E_PROJECT_FILTER=gulp-tailwindcss-v4 pnpm e2e:static:u` 重新生成 14 份 static 产物，与受管基线无差异，随后不更新复验通过。Lynx 兼容性 catalog 的不支持选择器仍按现有文档记录，不把 encoder 丢弃的规则视为运行时支持。

第二次真实预检后，根构建再次 68/68 通过；全量单测为 6215 通过、16 失败、43 跳过，后续阶段未启动。失败揭示了布尔配置和嵌套默认值不一致、增量颜色上下文缺失、旧 fallback 合同以及测试受宿主 IDE 环境/工作目录影响的问题。分别修复并补回归，未降低断言：HBuilderX mock 每例隔离并恢复宿主配置，作者 watch fixture 显式指定框架并覆盖包目录/仓库根目录，未知 fallback 保留原式而固定变量仍求值。独立复核另补作者插件 visitor 回归。随后 PostCSS 全包 105 文件、1037 测试通过，3 个既有跳过；配置定向 51 测试通过。全部跳过仍不计为通过，最终全面结果以新的预检轮次为准。

第三次真实预检后，根构建 68/68 通过，全量单测 657 文件、6245 测试通过，5 文件及 43 测试为既有跳过。lint 随后发现英文诊断表格 5 处列宽错误，已手动对齐并定向复验通过；未运行 Prettier。独立复核的 32 项顶层/嵌套配置、调用时覆盖和兼容上下文组合验证通过，兼容 Map 中的间距不能绕过 calc 安全判断。

第四次真实预检后，根构建、6245 条全量单测、lint（0 错误、3 个既有警告）、类型检查、架构检查、中英文文档构建、规则检查、release status 和 diff check 在同一门禁内通过；矩阵 34 条通过。static 完成全部 124 文件，644 条通过、4 条快照失败、34 条跳过，后续平台构建与设备阶段未启动。#1214 的 11 项真实构建与两种 watch 均通过。

static 差异逐项对照后同步对应基线，不批量接受未知输出：Taro Webpack React 的 `app.wxss` 与 issue-998 页面移除了仍有对应 `var()` 声明的静态重复值和旧浏览器前缀，并恢复径向渐变 `at center`；分包声明未变化。限定项目更新后 `--update=none` 重新构建 10/10 通过。uview-plus 的微信/支付宝两份产物各删除 19 条紧邻运行时变量的重复静态声明，经 AST 与原文对照，其余规则、声明、顺序完全相同；两端不更新复验通过。差异源于关闭隐式全局变量展开及恢复嵌套配置的安全默认值，原有语义断言均保留。生成模式报告使用同一真实产物另行核对。

生成模式的 Taro Webpack 小程序报告同步上述变化：CSS 总字节数由 322016 降为 315522，选择器数量仍为 2222，H5 两种模式未变。独立环境完整构建中全部产物快照通过，但 uni-app 两种 H5 构建因该工作树缺失 `vue-router` 失败，末尾聚合报告断言尚未执行，不能记录为整文件通过；补齐依赖后该项目 11/11 不更新复验通过。主工作树同项目小程序、H5 两种模式与 App 样式也独立 11/11 通过。下一轮完整 static 仍需验证最终聚合报告。

第五次真实预检对应提交 `f1daa415f`。九项质量检查与矩阵再次通过；完整 static 为 112 文件、648 条通过，12 文件和 34 条跳过，零失败。默认多平台构建的 51 个真实 case 与矩阵断言全部通过。微信 DevTools 的首个尺寸探针随后失败，工作流停止，后续 HMR/H5/HBuilderX 原生阶段没有运行。

本轮原始尺寸证据来自 DevTools 2.02.2608070、基础库 3.16.3、iPhone 12/13 (Pro) 模拟器，窗口宽度 390、DPR 3。主题基数 8rpx；工具类与直接最终 rpx 的宽高均为 133px，padding/gap 均为 16px，负 margin 均为 -16px，截图两列一致。失败来自探针自行假定原生换算偏差必须小于 0.51px：直接 32rpx 也测得 16px，与理论 16.64px 差 0.64px。微信文档未保证这一误差上限，不能据此判库侧计算失败。

修正探针使用单次 `wx.createSelectorQuery().boundingClientRect()` 取得全部 14 个矩形，避免混用 automator 整数 size 和坐标；以直接 rpx 作为原生对照，理论换算仅记录诊断。实测对照容差收紧至仅浮点运算误差，仍拒绝无效矩形、零间距与错误方向。16 项测量回归通过，新增覆盖合法原生量化和小于旧阈值的工具类独有偏差；页面与 WXSS 没有变更，无须更新 static 基线。原失败报告与截图保留，后续真实复验单独记录，不能将修订判据后重新解释的旧结果算作通过。

独立审查另发现显式常量覆盖别名会丢失动态依赖，新增 55 个组合在旧实现中 42 失败，修复后 PostCSS 1092 通过、3 项原有跳过。source/sourceOptions、扫描来源和裸任意值配置原地变更的 compiler 缓存回归与相关用例共 47 项通过，缓存键与来源快照不再保留调用方可变对象的身份引用。转义变量完整修复后 PostCSS 为 1130 通过、3 跳过，底层 calc 为 216 通过、3 跳过；主包相关及架构检查 40 项通过。上述修复均需要进入下一轮完整验收。

增量产物修复增加依赖完整性、顺序一致性、空候选重加、主题变更和 Map/RegExp 原地修改回归，相关 117 项经分组验证通过。调用次数断言证明未变候选没有新增原生生成或样式转换；有序的安全追加只转换 delta，新依赖或顺序变化仅生成一次完整原生产物并转换。另纠正本轮先前加入的颜色预期：基线完整生成在主题声明存在时输出白色，旧增量因为丢失主题而错误采用补充 Map 的黑色。新回归要求同一输入完整与增量 CSS 一致，Map 元数据仍独立保留，不改变既有完整颜色转换合同。

整合提交后三个受影响包构建通过，主包 130、PostCSS 135、测量逻辑 16 项定向测试通过，规则与 release status 通过。第六次真实预检后根构建 68/68 通过、0 缓存命中；全量单测 6405 通过、1 失败、43 跳过，后续检查与设备阶段未运行。唯一失败是既有 compiler 测试要求 `p-4` 后新增 `m-2` 必须返回 delta，忽略了 Tailwind 规则顺序。修正该断言为引擎仍复用、完整 CSS/rawCss 与独立全量生成一致，且 margin 规则位于 padding 之前；这验证级联正确性，不强迫使用追加路径。

compiler 顺序断言修正后相关 27 项通过，触及文件的 lint、规则与 diff 检查通过，提交为 `a62aabcb3`。随后第七、八轮脚本预检的平台探针均通过，但当前会话创建 browser webview 连续超时：`Timed out waiting for the Browser webview to attach for this browser-use page`。关闭本任务七个失效标签后重试及一次可见空白页诊断均未恢复；两轮通过 `e2e:preflight block` 记录阻断，未启动全面测试。报告分别为 `e2e/.artifacts/preflight/54741c32-aa55-4b0c-b9f8-4ed4c34bdd86/report.json` 与 `e2e/.artifacts/preflight/451009ff-099e-46bc-bc53-b604399e227f/report.json`。需要恢复当前 computer use 连接后重新 prepare、六步真实操作和 verify；不复用已阻断报告，不以 Playwright 代替。

浏览器连接随后通过应用自带的面板工具恢复：打开浏览器返回 `queued`，切回当前任务后，新页面约 0.45 秒成功挂载。该现象表明连接受当前任务窗口是否显示影响；没有修改认证数据或替换 computer use。原始调用保存在 `e2e/.artifacts/issue-1214-browser-recovery.json`，第九轮重新完成 prepare、六步真实操作和 verify，报告为 `e2e/.artifacts/preflight/5a4117eb-576b-4daf-805c-fd8c8dec92c1/report.json`。

第九轮对应提交 `026dcd7d4`：根构建 68/68 成功，全量单测 6406 通过、43 既有跳过，九项质量检查及 34 项矩阵断言全部通过。完整 static 为 112 文件、657 项通过，12 文件及 34 项按阶段配置跳过；#1214 的 11 项真实微信构建和两条 watch 流程通过。默认多平台的 51 个真实构建 case 与矩阵断言全部通过。

本轮新 DevTools 探针实际运行通过，证据为 `e2e/.artifacts/issue-1214-ide/run-JdWsls/evidence.json` 和同目录 `layout.png`。DevTools 2.02.2608070、基础库 3.16.3、iPhone 12/13 (Pro) 模拟器、窗口宽 390、DPR 3；单批 14 个原生矩形显示工具类与直接 rpx 对照宽高均为 133px，padding/gap 均为 16px，负 margin 均为 -16px，六项对照全部通过。截图经人工检查两列一致，理论换算偏差只用于诊断。

随后框架 IDE 套件 11 项通过、1 项失败，工作流在第 13 阶段停止。Taro Webpack React 首次瞬态错误经内置重试恢复，但重试日志未保留原始异常，无法确定首次失败阶段；不能把构建中间态缺文件推断成已证实根因。最终失败来自 weapp-vite 可见性回退中的 `reopenedContent.includes is not a function`。Taro Webpack React、HBuilderX uni-app Vue3 与 uni-app x 的既有用例仅取得产物级更新和运行时错误检查证据；实时页面可见性未验证，不计作完整 HMR 通过。其余微信 Issue/视觉用例以及第 14～21 阶段尚未启动。

当前已复现的库侧缺陷通过最新完整单测、static、多平台构建和 #1214 原生尺寸对照。全面工作流仍待修复 IDE 验收代码后继续，草稿 PR 保留未完成状态；完整日志为 `e2e/.artifacts/issue-1214-full-ninth.log`。

## 适用边界

静态分析不能预测未来 JavaScript、内联样式或外部运行时注入的变量覆盖。`cssCalc` 仍默认关闭，只应选择构建期固定变量；普通 `var()` 不会因为该配置被全局展开。显式开启其他变量替换插件的行为需另行验证。

本次修复库侧的静态化与缓存链路，不修改微信的 `rpx` 换算算法。第九轮新 DevTools 探针的尺寸对照与截图已通过；微信 Android/iOS 真机和 Skyline 均未完成。旧 DevTools 证据只保留在 [原问题文档](../../../website/docs/issues/spacing-rpx.md)，不作为本轮通过证据。

## 规则评估

沿用 PostCSS 解析所有权、构建图来源关系和本地预检门禁，不新增 AGENTS 规则。多端手册补充共用门禁的质量检查入口，未降低任何环境或截图门槛。首次修复记录标为 superseded，保留当时结果并明确纠正过度结论。
