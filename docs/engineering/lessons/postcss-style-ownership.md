---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1216
baseline: 821f4dd4bea8c8b9426248ed56d5bb2717a6c821
regressions:
  - packages/weapp-tailwindcss/test/uni-app-x/web-class-identity.test.ts
  - e2e/demo-visual-h5-theme.test.ts
  - e2e/demo-visual-hmr-source.test.ts
  - packages/postcss/test/tailwind-directive-injection.test.ts
  - packages/postcss/test/native-compiler.test.ts
  - packages/postcss/test/tailwind-v4-user-css.test.ts
  - packages/postcss/test/style-transform-ownership.test.ts
  - packages/postcss/test/processed-css-transforms.test.ts
  - packages/postcss/test/webpack-css-transforms.test.ts
  - packages/postcss/test/css-source-trace.test.ts
  - packages/postcss/test/source-candidates.test.ts
  - packages/postcss/test/tailwind-source-analysis.test.ts
  - packages/postcss/test/rewrite-imports.test.ts
  - packages/postcss/test/css-entry-source.test.ts
  - packages/postcss/test/rpx-candidate-compat.test.ts
  - packages/weapp-tailwindcss/test/bundlers/css-entry-analysis.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/tailwind-v4-source-analysis.unit.test.ts
  - packages/weapp-tailwindcss/test/ci/architecture-contract.test.ts
  - packages/weapp-tailwindcss/test/bundlers/generator-css.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-processed-css-assets.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack.v5.unit.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/style-reference-paths.test.ts
---

# 样式转换归属迁移与解析复用

## 症状

主包已经不再直接依赖 CSS parser，但仍通过 PostCSS re-export 实现样式转换。共享生成流程、Vite 产物处理、Webpack 兼容和 Harmony apply 混合了构建图编排与 CSS AST 操作，造成重复处理和边界难以检查。

本次重构从 rpx warning PR 的实现提交分出独立分支，不扩大原 PR 的交付承诺。生产转换归属与剩余编排已审计，真实构建/HMR 完成两轮性能对照；完整多端验收仍未完成。

## 根因与纠正

转换依赖来自 PostCSS 包，不等于转换实现归属已经收敛。迁移按数据边界拆分：

| 位置 | 负责内容 |
| --- | --- |
| PostCSS `compat/tailwindcss-v4/user-css/` | 作者层、生成标记、作用域去重、框架样式组合、指令处理 |
| PostCSS `compat/processed-css/` | import 清理与恢复、空 at-rule 清理、作者样式合并 |
| PostCSS `compat/scoped-css/` | 声明覆盖索引、scoped/preflight 判断与规则删除 |
| PostCSS `compat/webpack-css/` | 保持现有 Webpack 链路语义的 CSS 兼容策略，不依赖 Webpack API |
| PostCSS `compat/uni-app-x/` | Harmony apply 替换和 reference 声明改写 |
| PostCSS `source-scan/` | CSS 候选提取、inline 展开与入口指纹；配置文件名通过调用方回调取得 |
| PostCSS `syntax/` 与 `utils/css-source-trace.ts` | import 请求改写、CSS 合法性判断、源码追踪注释 |
| 主包 | 平台与选项判断、bundle 遍历、产物写回、模块及文件身份、SFC 提取、运行时 classSet 策略 |
| PostCSS `/native` | CSS 到原生样式规则转换，不处理 manifest ID 或运行时 |
| PostCSS `/experimental/lightningcss` | 实验 AST/选择器转换，不加载 LightningCSS 引擎，不从稳定入口导出 |
| injector | 配置、源文件过滤、WXML 依赖追踪；纯指令插入调用 PostCSS |

主包保留原导入路径的 facade。reference/import 由主包提供路径解析回调，PostCSS 包只处理声明；构建插件仍通过 bundle/loader 等原有 API 返回结果。没有新增产物阶段源码读取或输出目录写入。

性能调整限定在可以证明输出等价的路径：

- apply 源码的选择器与规则性质在一次解析中得到；scoped apply 过滤复用输出 Root。
- 同一规则的作用域签名前缀按本次调用缓存，避免每个选择器重复计算声明体；不建立跨 HMR 的可变 AST 缓存。
- Vite 覆盖索引对每条规则只构造一次声明键；清理尾部 trace 注释复用 Root，保留原触发条件。
- Harmony 对生成规则建立只读索引，只在实际替换时克隆声明。500 个未命中规则的用例确认没有预先克隆；多次应用保持独立结果。
- loader 的 theme 厂商 keyframes 清理与既有 PostCSS 实现共用 Root 入口。
- Webpack preflight 复用选择器判断和已见属性集合，移除生成 layer 清理中完全相同的重复分支。
- 运行时 apply 候选从两次解析缩减为一次，保留原有上下文判断、候选顺序与 important 处理；生成器仍沿用原来的 token 拆分语义。
- Vite 每次入口选择缓存本次源码分析，显式指令与指纹共享 Root，原始输出只解析一次。缓存不跨调用，源码更新后的入口选择有独立回归。
- 删除主包重复的 inline-source 展开、config/source 参数解析和 config 指令组装；复用已有 PostCSS 实现。source-scan 的文件、glob、符号链接规则仍留在主包，没有用较旧的 PostCSS 扫描副本覆盖它们。
- import 改写统一接收解析回调，主包保留包位置和文件路径计算。替换字符串使用函数，确保文件名中的美元符号不会被当成 replacement 模板展开。
- 入口扫描的依赖签名和缓存 miss 解析共用一次 CSS 分析。先只读 config 请求，实际需要扫描时才计算 source/inline 信息，避免缓存命中与 config-only 查询额外展开候选。配置文件变化仍参与缓存键，没有跨 HMR 保存 AST。
- Vite/Webpack 的 config 请求改写共用回调入口；rpx 长度候选兼容、选择器恢复、生成标记片段替换和行尾空白清理由 PostCSS 实现。主包保留目标 classSet 的生成策略和模块身份匹配。

迁移时发现两个不能直接合并的边界：空白 CSS 与纯注释 CSS 的返回语义不同；trace 注释清理带有既有文本触发条件。均保留原行为。此次不顺带重写历史 fallback 正则或扩大启发式匹配。

## 验证

迁移前运行对应定向回归，迁移后扩大到共享生成、Vite、Webpack、Harmony 和 v4 引擎：

- `CI=1 pnpm --filter @weapp-tailwindcss/postcss test --update=none`：84 文件，824 通过，3 个既有用例跳过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/shared/generator-css test/bundlers/generator-css.unit.test.ts test/bundlers/generator-css-class-selectors.unit.test.ts test/bundlers/framework-css-composition.unit.test.ts test/bundlers/rpx-theme-warning.integration.test.ts test/bundlers/vite-processed-css-assets.unit.test.ts test/bundlers/uni-app-x-web-runtime-cleanup.test.ts test/bundlers/vite-css-output-imports.test.ts test/bundlers/runtime-classset-loader.test.ts test/bundlers/webpack.v5.unit.test.ts test/uni-app-x/style-asset.test.ts test/uni-app-x/style-reference-paths.test.ts test/uni-app-x/harmony-scss-comments.test.ts test/tailwindcss/v4-source-options.test.ts test/tailwindcss/v4-engine.test.ts test/ci/architecture-contract.test.ts --update=none`：25 文件，659 通过。
- `pnpm --filter @weapp-tailwindcss/postcss build` 和 `pnpm --filter weapp-tailwindcss build`：JS 与声明构建通过，保留既有 mixed exports 警告。
- 新增内存输入回归，没有修改 demo、IDE 复现页或 static fixture；没有更新输出快照。
- 新 benchmark 初次使用旧版顶层 `bench` 导出失败，已按当前 Vitest 5 的 test context `bench(...).run()` 修正。
- 持久 benchmark 入口修正后 2 项通过；`pnpm agents:check` 为 0 errors，`pnpm release status` 确认两包中文 patch intent，`git diff --check` 通过。
- 最后的 Webpack 简化再次运行 loader/资产回归：186 通过，PostCSS 定向用例 4 通过，PostCSS 构建通过。

后续源码分析迁移的验证：

- `CI=1 pnpm --filter @weapp-tailwindcss/postcss test --update=none`：88 文件，849 通过、3 个既有跳过。最后补充 config 与 CSS 合法性入口后，`test/tailwind-source-analysis.test.ts` 的 12 项通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/css-source-trace.unit.test.ts test/bundlers/generator-css-candidates.unit.test.ts test/tailwindcss/runtime-factory.unit.test.ts test/tailwindcss/v4/runtime-factory.test.ts test/tailwindcss/v4/runtime-factory.integration.test.ts test/ci/architecture-contract.test.ts test/bundlers/tailwind-v4-source-analysis.unit.test.ts test/bundlers/vite-helpers.unit.test.ts test/bundlers/shared/generator-css test/uni-app-x/style-asset.test.ts test/uni-app-x/harmony-scss-comments.test.ts test/bundlers/css-imports.test.ts test/tailwindcss/v4-source-options.test.ts test/tailwindcss/v4-source-package-resolution.test.ts test/tailwindcss/v4-engine.test.ts test/tailwindcss/source-scan.unit.test.ts test/tailwindcss/source-scan-path-identity.test.ts --update=none`：26 文件，319 通过。
- 最后复用 config/source 参数后，`CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/tailwindcss/source-scan.unit.test.ts test/tailwindcss/source-scan-path-identity.test.ts test/bundlers/vite-source-scan-css-entries.test.ts test/bundlers/vite-css-output-imports.test.ts test/bundlers/generator-css.unit.test.ts test/ci/architecture-contract.test.ts --update=none`：6 文件，203 通过。
- 新用例直接覆盖非法 CSS、无上下文候选、1000 条 apply 的完整扫描、注释幂等、Windows/POSIX 请求、插件选项指纹变化及 HMR 调用间不复用旧分析；没有修改 static fixture。
- 两包 JS 与类型构建再次通过，迁移源码 ESLint 通过；`pnpm agents:check` 检查 48 个规则、41 份文档、309 个命令入口，0 errors，`git diff --check` 通过。

入口扫描缓存与剩余字符串变换：

- 新增 `test/bundlers/css-entry-analysis.unit.test.ts` 先在迁移前失败：首次入口扫描实际解析 2 次，预期 1 次。迁移后通过，并验证同源码缓存命中、配置内容变化后的新结果。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss test --update=none`：90 文件，858 通过、3 个既有跳过。最后补充模块片段和行尾空白清理后，`test/rpx-candidate-compat.test.ts` 的 5 项通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/css-entry-analysis.unit.test.ts test/bundlers/vite-source-scan-css-entries.test.ts test/bundlers/vite-source-scan.unit.test.ts test/tailwindcss/source-scan.unit.test.ts test/tailwindcss/source-scan-path-identity.test.ts test/ci/architecture-contract.test.ts test/bundlers/css-imports.test.ts test/bundlers/vite-helpers.unit.test.ts test/bundlers/generator-css.unit.test.ts test/tailwindcss/v4-engine.test.ts --update=none`：10 文件，316 通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/webpack.v5.unit.test.ts test/ci/architecture-contract.test.ts --update=none`：2 文件，173 通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-plugin.bundle.unit.test.ts --update=none`：1 文件，210 通过。两包构建和声明检查通过。

微基准基线为上述 SHA 中主包的 `generator-css/scoped-rules.ts`。提取旧实现到临时目录，仅将 PostCSS import 重定向到与新实现相同的运行时；已核对其余源码完全一致。使用 `pnpm exec tsx` 执行比较，先断言新旧输出相等，再各预热 20 次，交替执行 30 组采样，每组 10 次：

| 输入 | 旧实现中位耗时 | 新实现中位耗时 |
| --- | --- | --- |
| 15,840 字节，500 个选择器，每规则 30 条声明，scoped/unscoped 对照 | 16.30 ms | 7.02 ms |

热点耗时约降低 57%。此前同配置样本为 16.65 ms / 7.11 ms。该结果只证明此输入上的热点改善，不代表真实框架构建/HMR 或峰值内存已改善。持久 benchmark 入口为 `pnpm --filter @weapp-tailwindcss/postcss exec vitest bench test/tailwind-v4-user-css.bench.ts --run`。

## 适用边界

进一步审计了主包剩余的 parse/walk，保留以下编排操作：

| 入口 | 保留原因 |
| --- | --- |
| `compiler/artifact.ts` | 将输入转换为带来源、顺序和 scope 的 fragment，并克隆 artifact；不执行 CSS 兼容转换 |
| `tailwindcss/source-scan.ts` | 从 Root 读取 source 后调用文件/glob 解析；CSS 参数解析已共用 PostCSS |
| `v4-engine/source.ts` | 读取本地 import 图、配置文件身份与缓存，主题分析调用 PostCSS |
| `generator/css-compat.ts` | 按 import 解析已安装 theme 文件；主题插入和转换调用 PostCSS |
| `generator/scan-sources.ts` | 读取 source 指令并解析项目根与候选扫描范围 |
| `generator-css/source-files.ts` | SFC 与本地样式依赖扫描，文件身份和解析策略留在扫描层 |
| `configured-css-entry-observer.ts` | 记录模块/import 是否进入 Vite 构建图，管理诊断生命周期 |
| `root-style-output.ts`、`entry-style-graph.ts` | 读取产物 import 边、检测环，并通过 bundle asset 组装引用 |
| `generator-css/pipeline.ts` | 每次调用创建共享 Root，串联 PostCSS 转换与 Tailwind 生成 |
| Webpack `memory-trace.ts` | 只读观测是否包含 preflight，服务内存诊断 |
| uni-app x `vite.ts` | 对已变换文本生成 sourcemap，没有额外 CSS 处理插件 |

非 AST 搜索还检查了 source-resolver、uni-app x 和 v4 source 相关字符串处理。剩余操作用于模块 query/路径、SFC/模板类名、alias 对应的 apply 输入组装、产物引用和 fallback theme 数据。它们不拥有 CSS parser 或样式兼容变换。CLI 调用 LightningCSS 的优化/map API 属于外部编译器编排，没有自定义 AST visitor；实验入口同样保留引擎加载，visitor 实现已迁移。独立 `postcss-calc` 是 PostCSS 依赖的计算器，不反向依赖主包；不能机械搬回造成循环依赖。

私有 `test-helper` 使用官方编译器建立测试对照，theme-transition 的 scripts 只生成测试/开发资产；这些不是生产 CSS 管线，本轮没有把测试对照改成调用被测转换。它们仍有测试辅助用的注释删除或声明拼装，因此不能把本轮描述为“仓库内任何 CSS 操作均只剩一个目录”。

PostCSS 内部已共用 apply 选择器分析和 specificity placeholder 归一化。generator 的精确筛选与 v4 的后缀筛选、注释处理保持不同。根入口兼容导出集中到 compat barrel，构建前后 328 个运行时导出完全一致；native 与实验子入口保持隔离。

本轮额外验证：injector 迁移前后 29 项均通过，LightningCSS 对照 20 项均通过且快照未更新；新增指令锚点、顺序和幂等回归 3 项通过，架构回归 7 项通过。两包 JS/声明构建通过；injector 的声明构建曾输出非致命 emit 提示，最终声明文件存在。PostCSS 扩大回归首次因新测试重复转义 specificity placeholder 失败（867 通过、1 失败、3 跳过）；修正测试输入后该文件 5 项通过。没有放宽实现或更新快照。

最终 PostCSS 回归为 92 文件、868 通过、3 个既有跳过；主包 generator、rpx warning、v4 engine 与架构定向回归为 14 文件、338 通过。PostCSS JS/声明构建和 ESLint 通过。规则检查为 48 个规则、41 份文档、310 个命令入口、0 errors，repoctl 已识别五个直接受影响公开包的中文 patch intent。

React Native 的 CSS 到样式对象转换已迁入独立 `/native` 子入口。Native 包继续持有 manifest ID、Babel/Metro 和运行时接口。迁移前后 `CI=1 pnpm --filter @weapp-tailwindcss/react-native test --update=none` 均为 5 文件、36 通过；`CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/native-compiler.test.ts --update=none` 为 4 通过，覆盖精确类名、important/顺序、告警和调用间独立性。两包构建及类型生成通过；架构回归为 6 通过，新增浏览器 bundle 依赖闭包检查，确认 runtime 仅包含自身代码、无编译依赖。

已迁移模块的架构测试约束主包不重新引入 AST 转换。生产转换、编排和开发辅助的归属见上表；真实框架性能对照见下文，不能用微基准代替完整验收。

2026-09-18 在 `541473366cfa459acbf3cf5f7a54e50e350b943e` 执行 `pnpm e2e:preflight prepare`，本轮 run ID 为 `39875579-98db-4280-8bcb-79e0ba3be4a8`。Node/pnpm、微信真实 DevTools、iOS、Android、Harmony 和 Web 脚本探针通过；HBuilderX `cli version --host HBuilderX` 超时，探针报告 `issue=timeout; exit=SIGTERM`。同时，当前会话 `mcp__cua_repl.js` 调用 `cua.getState()` 返回 `Browsers: Error: Codex auth token is unavailable`。

已按手册用 `pnpm e2e:preflight block --report e2e/.artifacts/preflight/39875579-98db-4280-8bcb-79e0ba3be4a8/report.json --reason "当前会话浏览器发现认证失败"` 记录阻断。该命令设计为非零退出。原始 JSON、Markdown、探针日志及截图位于同一忽略目录，没有修改门禁、关闭用户 IDE 或借用旧报告。恢复需修复当前 Codex 浏览器授权，并确认 HBuilderX 所选 host 的 CLI 可响应，然后重新 prepare；本轮报告不可复用。

上述为升级前的阻断记录。HBuilderX 升级到 `5.26.2026091802`、浏览器授权恢复后，在 `ad8ec641be457402f916ba766b625d419473e44c` 重新 prepare，run ID 为 `c117bf03-f1be-482f-99b8-aebfac670b34`。微信、HBuilderX、iOS、Android、Harmony、Web 与当前会话 computer use 均通过 verify；截图工具实际返回 JPEG，首次将其交给 PNG 专用校验器失败，保留原图并无缩放转换 PNG 后通过，没有修改门禁或证据时间。

执行 `CI=1 pnpm e2e:local:full-report --preflight-report e2e/.artifacts/preflight/c117bf03-f1be-482f-99b8-aebfac670b34/report.json --out-root .tmp/postcss-full-acceptance`：

- `build:ci` 通过；Mpx、Taro Webpack React/Vue3、uni-app Vite、weapp-vite 五套完整 watch 回归通过，含测试已有的 Web、分包与回滚场景。weapp-vite 使用既有构建回退入口，不能据此宣称原生 HMR 性能。
- 五套进程树 HMR 峰值 RSS 依次为 4242、4279、3862、2641、3059 MB。这是功能回归运行中的观测值，包含子进程，不是前后性能比较。uni-app memory build 阶段被既有 guard 跳过，不能把该阶段的 1 MB 采样当作真实构建数据。
- uni-app 的 14 项平台产物检查通过；H5 dev 为 2 通过、1 个过滤跳过。未更新 static 快照。
- visual 阶段发现 HBuilderX Vue3 Web 第二步停留 step 1，以及 uni-app x Web 主题不生效，停止后续 Android/iOS/Harmony 验收。完整报告位于 `.tmp/postcss-full-acceptance/2026-09-18T12-48-15-156Z/`，不是全端通过。

在独立 checkout 的基线 `821f4dd4bea8c8b9426248ed56d5bb2717a6c821` 用同一锁文件复现两个 H5 失败。第一项来自 visual 脚本累积插入多个同类探针，而断言始终读第一个；复用 `e2e/hbuilderx-local/web/source.ts` 的原位替换逻辑，新增回归先失败（两个探针），修改后通过，并验证 CRLF 与原始源码恢复。`CI=1 pnpm exec tsx scripts/demo-visual-e2e-report.ts --h5-only --filter '^uni-app-vite-vue3-hbuilderx-tailwindcss-v4$' --fail-on-incomplete` 真实三步 HMR 和截图通过。没有放宽断言。

第二项基线缺陷：浏览器 DOM 的变体类为 `dark_cbg-zinc-950` / `dark_cbg-_b_h3498db_B`，加载的 CSS 选择器仍为 `dark\\:bg-zinc-950` / `dark\\:bg-\\[\\#3498db\\]`，无法命中。修复位于模板/JS 编排边界：Web 保留原始类名，局部样式收集器继续消费精确候选，JS handler 继续处理模块引用。新增静态 class、绑定表达式、script/script setup、未知候选和小程序兼容回归；先复现 2 项失败，修正后 uni-app x、Web cleanup 与架构共 231 项通过。

同时 issue #1091 手动示例期望蓝色 `[52, 152, 219]`，不能沿用通用“接近黑色”的预期。H5 视觉检查复用项目已配置的颜色，同时保持根节点变暗与文字变亮的断言；新用例先失败，修正后视觉脚本 26 项通过。两处为基线既有问题，单独记录，不能归因为纯 CSS 迁移，也不能更换生成器或跳过主题检查。

继续真实 H5 验证后，手动主题的计算背景为 `rgb(52, 152, 219)`、文字为 `rgb(250, 250, 250)`；后续检查暴露出 visual 脚本与共享用例漂移：390px 截图视口却使用 375px 基准尺寸，属性采集遗漏 padding/边框颜色/scope，且未执行步骤的 `sourceMutation`。改为显式 375px 视口，复用已有属性读取、匹配、源文件修改和恢复函数，热更新与刷新后均检查持久断言。新增回归覆盖所有涉及源码的恢复及 CRLF，没有修改产品尺寸。

第一步热更新浏览器实测为背景 `rgb(16, 41, 56)`、margin-top `800px`、width `173px`。直接 CSS 使用 `calc(var(--spacing) * 200)`，原检查只接受 `calc(0.25rem * 200)` / `800px`；增加合法变量形式并保留运行时精确尺寸断言。最后一步接受生成器保留的原始 Web selector，同时仍校验 `0.3125rem`，不接受错误尺寸；超时错误补充 URL 与具体未命中规则。

迁移后五项目 static 验证：`CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/mpx-tailwindcss-v4.test.ts e2e/taro-webpack-react-tailwindcss-v4.test.ts e2e/taro-webpack-vue3-tailwindcss-v4.test.ts e2e/uni-app-vite-tailwindcss-v4.test.ts e2e/weapp-vite-tailwindcss-v4.test.ts --update=none`，5 文件、23 项通过，快照无变化。没有把该 static 验证当作设备运行证据。

最终定向 H5 验证通过：`CI=1 pnpm exec tsx scripts/demo-visual-e2e-report.ts --h5-only --filter '^uni-app-x-vdom-tailwindcss-v4$' --fail-on-incomplete` 在默认隔离与 v2 隔离下各完成 5 步 HMR、刷新与截图检查。此前截图失败因 800px margin 将探针推到内部滚动容器视口外；新增滚入可见区域和边界检查后，保留原像素差异门槛并通过。HBuilderX Vue3 的同入口定向复核也通过。视觉脚本与矩阵回归最终为 4 文件、63 项通过。

按规则用 `CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_PROJECT_FILTER='^uni-app-x-vdom-tailwindcss-v4$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-x-vdom-tailwindcss-v4.test.ts -u` 重新生成该项目 static 基线。HBuilderX 5.26 生成的 `main.wxss` 仅改变框架 reset 列表中 button/checkbox/picker-view/radio/slider 的顺序和一处空白，声明未变；其余 16 个输出文件无 diff。该差异来自升级后的框架输出，作为本轮基线记录。

随后相同命令改为 `--update=none` 复核，1 文件、1 项通过。产品修正与验收脚本分别提交为 `f3ba345`、`baa57d7`，已推送 PR #1217。

在 `baa57d7ce8f9eead9f72ee89208d69a3599b4b81` 重新执行全端 prepare，run ID 为 `3662e7cf-57b3-42f6-a8a0-092c056b7261`。base、微信、HBuilderX 5.26、iOS、Android、Harmony、Web 全部脚本探针通过；当前会话 `cua.getState()` 再次返回 `Browsers: Error: Codex auth token is unavailable`。已立即通知用户，并调用 `pnpm e2e:preflight block --report e2e/.artifacts/preflight/3662e7cf-57b3-42f6-a8a0-092c056b7261/report.json --reason '当前会话 cua.getState() 浏览器发现失败：Codex auth token is unavailable'` 保存阻断。命令按设计退出 1。

本轮完整报告未启动，没有用刚完成的定向 H5、旧 computer use 或旧报告替代门禁。Android/iOS/Harmony 的完整产品验收仍未执行；环境探针通过不等于产品验收通过。恢复只需先恢复当前 Codex 浏览器授权，再新建 prepare；不需要再次升级 HBuilderX。当前目标保持进行中。

### 浏览器恢复后的完整验收

2026-09-18 在 `4603ee84876e26ee369fca637285e6ac3533b79b` 新建预检 `0dc8d5b0-3879-4d1a-a445-72774f2af964`，全部脚本探针和当前会话 computer use 通过。浏览器 `setValue` 后点击没有完成回执；改为键盘输入后，页面显示本轮完成标识。保存实际工具调用、输出、时间和截图，原始 JPEG 无缩放转换为 PNG，未修改门禁。

执行 `CI=1 pnpm e2e:local:full-report --preflight-report e2e/.artifacts/preflight/0dc8d5b0-3879-4d1a-a445-72774f2af964/report.json --out-root .tmp/postcss-full-acceptance-resumed`，报告目录为 `.tmp/postcss-full-acceptance-resumed/2026-09-18T15-18-25-224Z/`：

- 18 个已执行阶段中 17 通过，visual 阶段中断并记录失败。`build:ci`、五框架完整 watch、uni-app 14 平台产物检查通过；H5 dev 为 2 通过、1 过滤跳过。五框架 watch 用时 44 分 08 秒，原有 weapp-vite 构建回退和 uni-app build guard 的证据边界仍适用。
- H5 六组项目各生成三步 HMR 截图，uni-app x 默认/v2 隔离各生成五步截图；没有重现上一轮的 H5 错误。微信运行日志记录 11 个 HMR case 通过，包括 uni-app x 两种隔离。visual runner 尚未执行最终图片汇总与跨端比较，不能把这些中间结果写成整体视觉验收通过，也不能复用旧 `report.json`。
- 普通 uni-app Vite 的 Android 初始产物和页面就绪，增量产物更新后日志再次出现 `App Launch`，触发既有纯 HMR 禁止重启回退的检查。HBuilderX Vue3 的 Android/iOS 同样记录增量后的 `App Launch`；其编译器已为 5.26，因此该现象不能全部归因为旧编译器。
- 普通 uni-app Vite 的 iOS 初始截图被版本不匹配弹窗遮挡：“本应用使用 HBuilderX5.15 编译……手机端 SDK 版本是 5.26”。实际项目依赖仍是 `@dcloudio/* 3.0.0-5010520260709002`，本地 `@dcloudio/vite-plugin-uni/package.json` 的 `uni-app.compilerVersion` 为 `5.15`；IDE 升级不会替换 CLI 项目的依赖。此项为工具链/运行时阻塞，不是 CSS 迁移失败的证明。
- 发现上述截图后停止本任务 visual runner 与其唯一活动 CLI launch，保留 IDE/模拟器，用 preflight block 保存原因。runner 在汇总前将 App 错误暂存在内存而继续调度；确认阻塞时已开始 uni-app x iOS，随后中断，Harmony 未执行，三个后续专用设备阶段均未执行。原始 launch 日志及截图已复制到本轮报告；本轮不具备完整 App 通过证据。
- 中断后仅恢复本任务确定产生的 `BindClass.uvue` 和 `manifest.json` 临时修改，恢复前逐字节确认符合测试变更，工作树回到干净状态。门禁服务关闭后外层释放会话报 `TypeError: fetch failed`，完整阶段报告已落盘；该清理错误不替代前述阻塞原因。

恢复前需对齐普通 uni-app CLI 编译器与基座版本，并独立定位 App 增量重启；不能点击忽略弹窗、放宽纯 HMR 条件或反复运行完整矩阵取得偶然通过。依赖升级会影响 demo 与 static 基线，需单独审查其范围。PR 保持草稿，完整产品验收未完成。本轮只更新证据记录，没有新增产品修复或规则。

### 对齐 CLI 编译器并隔离基线失败

以下升级及 iOS 结果为拆分前的历史证据。编译器升级已移到独立草稿 [#1220](https://github.com/sonofmagic/weapp-tailwindcss/pull/1220)；#1217 的 demo 编译器恢复为原版本，以同编译器验证样式迁移。此前 5.26 的产物和运行时证据不作为恢复后旧编译器的通过证明，HBuilderX 基座版本匹配仍需由升级分支解决。

2026-09-19 继续恢复时，通过 npm registry 确认 `@dcloudio/vite-plugin-uni@3.0.0-5020620260917001` 的 `uni-app.compilerVersion` 为 `5.26`。只将 `demo/uni-app-vite-tailwindcss-v4` 的 21 个同系列 `@dcloudio/*` 编译依赖对齐到该版本；包含原本混用 5.03 的 `uni-mp-vue`，保留 Vite 5.2.8。锁文件的 importer 只有该 demo 改变；pnpm 同时清理 15 个既有无引用的 Mpx/React Native peer snapshot，没有更改其他 importer。`pnpm install --frozen-lockfile --filter @weapp-tailwindcss-demo/uni-app-vite-tailwindcss-v4` 通过。

- `CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_PROJECT_FILTER='^uni-app-vite-tailwindcss-v4$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-vite-tailwindcss-v4.test.ts -u`：2 项通过，重新生成 13 个快照，无受跟踪产物差异。改为 `--update=none` 复核同样通过。
- `CI=1 E2E_MULTIPLATFORM_BUILD_CASE='^uni-app-vite-tailwindcss-v4 ' pnpm e2e:multiplatform-build`：15 项通过（含 14 平台构建及登记检查）；对应 H5 dev 定向测试为 2 通过、1 过滤跳过。
- 用 `CI=1 DEMO_VISUAL_REPORT_RESET=1 pnpm exec tsx scripts/demo-visual-e2e-report.ts --ios-only --filter '^uni-app-vite-tailwindcss-v4$' --fail-on-incomplete` 做一次有界恢复诊断。日志确认编译器 5.26，iOS 初始截图不再出现版本不匹配弹窗，真实页面和初始样式探针通过；差量编译后仍有 `App Launch`，最终结果为 `纯 HMR 验收失败：restarted`。没有把初始页面恢复写成 HMR 成功。原始报告、截图和 launch 日志另存 `.tmp/uni-app-526-ios/`，执行日志为 `.tmp/uni-app-526-ios.log`。
- 在独立基线 checkout `821f4dd4bea8c8b9426248ed56d5bb2717a6c821`，以同一 HBuilderX 5.26、同一 iOS 模拟器运行上述视觉命令，过滤改为 `^uni-app-vite-vue3-hbuilderx-tailwindcss-v4$`。基线同样在差量编译后再次记录 `App Launch`，相同生命周期断言失败；该断言与 App visual 实现未被本次迁移修改。日志为基线 checkout 的 `.tmp/baseline-hbuilderx-ios-lifecycle.log`。两次诊断均正常退出并恢复临时源码。

版本不匹配已解决；剩余的 App 纯 HMR 失败在迁移前可复现，不能归因为本次 CSS 归属迁移。尚未确定其在 IDE/编译器更新机制中的具体触发条件；未修改平台更新语义、断言或用户 IDE 设置，也未重新调度完整验收。此前性能比较使用的旧锁文件与旧 demo 编译器保持原记录，不将新编译器的定向结果并入性能样本。

### HBuilderX 5.26 增量同步与应用生命周期

对同一安装的编译器和 launcher 做只读检查，普通 uni-app Vue3 的重启存在明确的上游实现路径：

1. `@dcloudio/uni-app-vite/dist/vue/plugin/index.js` 将 Vue 应用入口输出为 `APP_SERVICE_FILENAME`（`app-service.js`）。页面模板和 class 变更可以改变该服务入口。
2. `@dcloudio/vite-plugin-uni/dist/cli/action.js` 的 `BUNDLE_END` 分支明确排除含 `APP_CONFIG_SERVICE` 或 `APP_SERVICE_FILENAME` 的 `hasIncrementalFiles`。这类变更不会通过普通文件增量分支输出 `FILES:`；有 `pages`、dex 等其他条件时另行分流，不能把结论扩展到所有 App 更新。
3. HBuilderX `uniapp-extension/out/index.js` 的 `compileSuccess` 根据 `PAGES:` / `FILES:` 选择更新类型；没有这两类标记时使用 `ChangeType.ALL = -1` 和空文件列表。
4. `launcher/out/main.js` 的 iOS 模拟器实现中，`isNeedFullUpdate` 在编译目录非空、文件列表为空时调用 `pushPackage(app, false)`，后者调用 `sendRefreshCmd(false, ...)`，实际写入 `<root cmd="restart">`。iOS 真机对应全量分支也显式发送 `restart`。

该路径与已保存的“差量编译 → 同步程序文件成功 → App Launch”日志、迁移前同环境复现一致，解释了普通 uni-app Vue3 的应用生命周期为何重新执行。`App Launch` 本身不证明操作系统进程退出或重新安装；当前测试拒绝的是应用生命周期重启，同样不能据此称为保持运行状态的纯 HMR。上述源码位于本机 HBuilderX `5.26.2026091802` 的插件目录，只作只读证据，没有修改 IDE 插件或基座。

[官方运行说明](https://uniapp.dcloud.net.cn/tutorial/run/run-app.html) 将动态代码同步称为“热刷新”或“热重载”，没有承诺该过程保留应用状态。不能仅凭这些术语把全量同步计为现有纯 HMR 断言通过，也不能伪造 `FILES:` 绕过编译器对服务入口变更的分类。

本轮未重跑完整矩阵、未改测试门槛。普通 Vue3 的上游路径已定位；uni-app x 的分流条件及 Harmony 尚不能据此作相同结论。继续完整验收需要确认目标平台支持保留状态的更新路径，或由维护者明确采用平台原生热重载作为独立验收标准；当前 PR 保持草稿和部分验证状态，不将两种行为混为同一通过项。

### 原生热重载独立验收

2026-09-19 维护者明确选择“按平台原生热重载单独验收”。普通 uni-app Vue3 的 Android/iOS 用例因此显式声明 `updateMode: 'native-reload'`；未声明的用例仍使用纯 HMR，uni-app x 与 Harmony 不套用普通 Vue3 的结论。观察器只统计首次运行完成后的本轮日志，允许原生热重载重新执行应用生命周期，但两种模式均拒绝更新失败和基座重装。报告写入模式、状态、`App Launch` 次数，并把原生热重载步数与纯 HMR 步数分开统计。产物、运行时样式和截图阈值没有改变。

- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hbuilderx-hmr-lifecycle.test.ts e2e/demo-visual-update-mode.test.ts e2e/demo-visual-theme.test.ts --update=none`：3 文件、39 项通过，覆盖模式默认值、跨流分片、首次启动排除、Android/iOS 基座重装、更新失败及报告计数。改动文件 ESLint 和 `pnpm agents:check` 通过。
- 有界 iOS 诊断直接调用共享 `runAppCase`，只选择 `demo/uni-app-vite-tailwindcss-v4` 的 iOS 用例，使用独立 `RuntimeContext.artifactRoot`，然后调用 `writeReport`。HBuilderX 为 `5.26.2026091802`，设备为 iPhone 17 Pro / iOS 26.5 模拟器；设备 ID `8FF8E968-BB02-4039-A25C-7C7EBCBDA402`。本轮 `hot-update` 的产物、运行时 marker/样式、前后截图均通过，生命周期为 `restarted`、`appLaunchCount: 1`，截图差异为 88,829 像素（26.99%）。只计作原生热重载。报告、截图和日志分别为 `.tmp/pr1217-native-reload-ios/report.json`、同目录 `screenshots/`、`.tmp/pr1217-native-reload-ios.log`。runner 正常退出并恢复临时源码。
- 当前会话 `cua.getState()` 的浏览器发现返回 `Browsers: Error: Codex auth token is unavailable`；已即时通知维护者，未启动新一轮完整多端验收。原生 `cua.getApp('com.apple.iphonesimulator')` 能读取本次模拟器，不能代替全端 computer use 门禁。恢复完整验收仍需恢复浏览器授权并重新 prepare，不复用已消费报告。

本次只调整生命周期验收和诊断元数据，没有修改 demo 源码或样式输出基线；编译器升级的 static 重生成与复核记录见上一节。

### 合并基线与编译器性能归因

#1216 合并后的 `main` 为 `d7feb9051c5c8f91979f583e5ac885434b81b253`，与原 #1216 head `821f4dd4bea8c8b9426248ed56d5bb2717a6c821` 的文件树完全一致。#1217 的 12 个提交已重放到该 `main`；`git range-diff` 全部为等价 patch，重放前后 head 文件树没有差异。

旧 head `0ac220a494ca2e94b440afceb761b8b883776c9f` 的性能 CI（run `35371160167`）中，uni-app 构建中位数为 7808.10 → 8900.40 ms（+13.99%），插件耗时 +6.97%，峰值 RSS +11.62%。保留首次失败，未放宽 5% 门槛。

为区分样式迁移与 demo 编译器升级，在三个独立 checkout 串行执行 `CI=1 pnpm exec node benchmark/version-compare/scripts/run-matrix.mjs --versions-file .tmp/pr1217-ci-before/compiler-versions.json --build-runs 3 --hmr-runs 3 --only demo-uni-app-vite-tailwindcss-v4__mp-weixin --out .tmp/pr1217-ci-before/compiler-matrix.json`。三个版本均无执行错误；迁移前为 `821f4dd4b`，迁移后旧编译器为 `7d785c447`，迁移后新编译器为 `aa45b6254`。后者未提交的生命周期诊断改动不参与性能构建。构建/插件/RSS 为三次中位数，HMR steady 去掉首次更新，原始样本全部保留：

| 版本 | 构建 ms | 插件构建 ms | 构建峰值 RSS MB | HMR steady ms |
| --- | --- | --- | --- | --- |
| 迁移前 / 5.15 | 3813.81 | 966 | 1064.00 | 468.63 |
| 迁移后 / 5.15 | 3708.59 | 920 | 1063.31 | 469.06 |
| 迁移后 / 5.26 | 3968.69 | 994 | 1185.11 | 642.95 |

同编译器下没有重现构建和 RSS 退化；换到 5.26 后构建耗时、RSS 和 HMR 均上升，支持将编译器升级视为独立影响因素。此实验不是新 head 的远端 CI 通过证据，也不能证明所有差异只来自某个上游函数；此前同锁文件的五框架对照仍单独保留。

旧 head 的 Expo CI（run `35371160123`）有两项环境失败：Android 安装时 `StorageManagerService.allocateBytes` 访问空的 `PackageManagerInternal`，同段 logcat 有 `DeadSystemException: The system died`；iOS 在启动测试的 pnpm hook 阶段超时，尚未进入样式断言。原始日志及 Android artifact 保存在 `.tmp/pr1217-ci-before/`，不能据此修改样式实现或宣称 Native 回归通过。

### 编译器拆分后的复核

重放后的 head `09001e180` 在 run `35376941648` 再次失败：uni-app 构建 +14.68%、插件构建 +12.69%、HMR 插件 P95 +8.61%、HMR 峰值 RSS +14.73%。结合前述三组对照，将编译器升级拆为 #1220，保留其性能成本和草稿状态。#1217 的 demo manifest 与锁文件和升级前 `7d785c447` 完全一致；锁文件中的 PostCSS 迁移依赖继续保留。

拆分后重新 `pnpm install --frozen-lockfile`，限定 uni-app 微信 static 执行 `-u` 重生成，再以 `--update=none` 复核，两次各 2 项通过、无受跟踪基线差异；`CI=1 E2E_MULTIPLATFORM_BUILD_CASE='^uni-app-vite-tailwindcss-v4 (mp-alipay|h5)$' pnpm e2e:multiplatform-build` 共 3 项通过。原日志为 `.tmp/pr1217-compiler-split-{install,static-update,static-verify,multiplatform}.log`。#1220 在独立 `main` 工作树也完成对应 install、包构建、static 重生成/复核和支付宝/H5 检查，详见该 PR 工程记录。

当前样式源码为 `6accdd36b` 加编译器拆分改动，包构建包含新迁入的 config 清理。对基线 `821f4dd4b` 串行执行 `CI=1 pnpm exec node benchmark/version-compare/scripts/run-matrix.mjs --versions-file .tmp/pr1217-compiler-split-versions.json --build-runs 3 --hmr-runs 5 --only demo-uni-app-vite-tailwindcss-v4__mp-weixin --out .tmp/pr1217-compiler-split-matrix.json`，采样时未并行其他构建或测试，全部构建与更新成功：

| 指标 | 基线 | 拆分后的 #1217 |
| --- | --- | --- |
| 构建中位数 ms | 3792.67 | 3770.61 |
| 插件构建中位数 ms | 947 | 937 |
| HMR steady 中位数 ms | 483.40 | 471.08 |
| 构建峰值 RSS 中位数 MB | 1071.64 | 1054.72 |
| HMR 峰值 RSS MB | 1290.25 | 1318.27 |
| HMR steady RSS MB | 1274.86 | 1313.16 |

使用仓库 `ci-report.mjs` 的 `buildSummary` 和 `evaluatePerformanceGuard` 对原始数据评估，参数与 CI 一致：5%、最少 2 次退化、最少 10 ms/64 MB，结果 `passed: true`、`violations: []`，保存在 `.tmp/pr1217-compiler-split-guard.json`。它证明本地 uni-app 样本未触发既有门槛，不能替代新 head 的全部远端矩阵，也不能把小幅差异宣称为稳定全框架提速。

浏览器发现再次实测仍报 `Codex auth token is unavailable`，已即时通知维护者；完整多端验收没有启动或复用旧报告。目标保持未完成。

### 真实框架性能对照

在基线 `821f4dd4bea8c8b9426248ed56d5bb2717a6c821` 与迁移后 `ad8ec641be457402f916ba766b625d419473e44c` 的独立 checkout，使用同一锁文件、Node 24.18.0、pnpm 12.4.1 和各自 workspace 构建产物。命令为 `CI=1 pnpm exec node benchmark/version-compare/scripts/run-matrix.mjs --versions-file <版本列表> --build-runs 3 --hmr-runs 5 --only <五项目 key> --out <报告>`。每个版本采样 3 次构建、同一 watch 会话内 5 次更新；steady 中位数分别去掉第一次构建、第一次更新。进程树 RSS 含子进程；构建内存取三次峰值的中位数，HMR 内存为该 watch 会话峰值。

两轮先后顺序互换，共 20 条项目/版本记录，无 error。首轮 Mpx 与部分 Taro React 时段并发过短暂 H5 诊断，保留样本但不用它证明收益；第二轮全程串行，无其他测试构建。下表为第二轮基线 → 当前，时间单位 ms、RSS 单位 MB：

| 项目（Tailwind v4 / 微信） | 构建 steady | HMR steady | 插件构建 / HMR steady | 构建峰值 RSS | HMR 峰值 RSS |
| --- | --- | --- | --- | --- | --- |
| Mpx | 5376 → 5376 | 2090 → 2073 | 497 → 502 / 632 → 628 | 1637 → 1633 | 2753 → 2742 |
| Taro Webpack React | 11569 → 11520 | 2229 → 2451 | 3767 → 3743 / 861 → 867 | 1531 → 1532 | 2247 → 2249 |
| Taro Webpack Vue3 | 11048 → 10981 | 2752 → 2737 | 2796 → 2786 / 1366 → 1374 | 1424 → 1440 | 2179 → 2183 |
| uni-app Vite | 3716 → 3719 | 504 → 486 | 913 → 910 / 173 → 166 | 1066 → 1057 | 1226 → 1293 |
| weapp-vite | 2692 → 2679 | 7025 → 7012 | 未提供插件计时 | 670 → 671 | 1478 → 1531 |

原始报告为 `.tmp/postcss-performance/matrix.json` 与 `matrix-reversed.json`。首轮 Taro React HMR 为 2422 → 2233，第二轮为 2229 → 2451，快慢顺序反转；uni-app 的 HMR RSS 首轮 1387 → 1223、第二轮 1226 → 1293，同样不能据此宣称内存稳定下降。真实构建与插件处理整体接近，没有稳定的全框架提速结论。此次确定改善的是前述局部热点和入口重复解析；没有放宽阈值或反复重跑筛选有利样本。

性能 runner 的 weapp-vite 配置为 `watch`，本次未设置 `WEAPP_VITE_E2E_WATCH_BUILD_FALLBACK`，与完整功能回归启用构建回退的配置不同；两类数字不能混用。性能采样在此次 Web 类名修复之前完成，该修复不参与上述数据。没有等待远端 CI，完整验收结束前目标保持进行中。

## 规则评估

### 边界复查补充

2026-09-19 复查发现 `bundlers/vite/rewrite-css-imports.ts` 仍拥有独占行 `@config` 指令的文本清理。此前“剩余字符串均为编排”的结论不够完整；现已将该函数迁入 PostCSS 的 `generator-plugin/config-directive.ts`，Vite 只调用导出。该函数位于预处理前，原样保留 Sass/未闭合源码兼容和行级匹配，不顺带改变历史空白行为。PostCSS 原 328 个运行时导出保持存在，新增 `stripTailwindConfigDirectives`。

先把 Vite 入口加入架构契约，旧实现为 1 失败、6 通过；迁移后 `test/bundlers/vite-plugin.rewrite.unit.test.ts` 与 `test/ci/architecture-contract.test.ts` 共 31 项通过。PostCSS 的配置清理与 rpx 兼容共 10 项通过，覆盖 LF、CRLF、多个指令、Sass、空输入、内联/字符串及重复调用。测试初始空白预期错误，已执行 `git show HEAD:<旧入口>` 中的原函数确认原行为后修正预期；没有改变实现或更新样式快照。

不新增 AGENTS 规则。已有 CSS 所有权与 bundler 生命周期规则足够；扩大架构回归覆盖已迁移模块，以代码约束落实边界。生产转换与保留编排的审计边界见上文；尚未完成的 App 验收保留为待办，不通过放宽规则将其视为完成。
