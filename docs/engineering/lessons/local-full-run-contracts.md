---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/commit/abd00dcc6
baseline: abd00dcc6f8c5dba8bd23ba88f771d43356ee897
regressions:
  - packages/weapp-tailwindcss/test/compiler/graph-generation-session.test.ts
  - packages/weapp-tailwindcss/test/bundlers/style-injector-hooks.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-hmr-source.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-content-init-coverage.test.ts
  - packages/weapp-tailwindcss/test/bundlers/css-imports.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/runtime-factory.unit.test.ts
  - packages/postcss/test/content-init-boundary.test.ts
  - packages/postcss/test/handler.root.test.ts
  - packages/postcss/test/author-functions.test.ts
  - packages/weapp-tailwindcss/test/bundlers/generator-author-functions.test.ts
  - packages-runtime/ui/test/atomic.test.ts
  - e2e/mini-program-screenshot.test.ts
  - e2e/demo-visual-live-evidence.test.ts
  - e2e/demo-visual-theme.test.ts
  - e2e/hbuilderx-hmr-lifecycle.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-css-transform-task.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-css-cache-task.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-web-layer-order.test.ts
  - packages/postcss/test/framework-pipeline.test.ts
---

# 全端测试中的编译结果与内部类型契约

## 症状

严格类型检查最初有数百条诊断，涉及 Vite 钩子、Babel NodePath、可选字段、只读生成结果和 PostCSS AST。graph 管线最终化后丢失编译 snapshot；Uni 组件样式在去除根样式覆盖的工具类后仍携带全局 content 初始化。

## 根因与纠正

内部上下文改为复用真实 StyleHandler 和规范化属性匹配项；bundler 来源元数据保留在适配层。合并层接受只读结果，需要可变集合时显式复制。最终化保留当前 revision 的 snapshot，回归检查两次生成的凭据彼此独立。

Vite 委托需支持函数和对象两种钩子，并保留 this、真实构建参数和同步/异步 HMR read。框架分包配置在委托入口校验；未定义选项不显式传给外部的严格可选属性。主包显式声明 catalog Vite 开发依赖，不改变 demo 的 peer 版本。CSS 入口同步和平台选择从超长工厂抽出，配置优先级不变。

类型诊断还揭示了运行时错误：Webpack loader 使用了不存在的 tailwindRuntimeOptions，导致显式 CSS 入口失效；裸任意值配置从不包含该字段的 resolved source 读取，导致候选校验漏传选项。分别改为读取 tailwindcssRuntimeOptions 和真实运行时选项，回归均先复现失败再验证修复。

PostCSS 单 Root API 明确返回单 Root，拒绝插件将其替换为 Document，保持克隆与产物归属。Uni App X 向 Rollup 返回 JSON source map，保留 nullable sourcesContent，测试解码后验证原来源信息。模板处理器接受实际可选参数，不把调用方没有提供的字段声称为必填。

### 被全量回归推翻的清理假设

最初认为 preflight 不应为没有局部 content 消费者的 CSS 添加初始化，并排除了默认变量声明作为保留依据。这通过了局部测试，却使完整回归出现 11 项失败：根样式、增量产物和已有处理器快照要求保留默认初始化。

因此撤回 prune-generated.ts 与 variables.ts 的试验性改动，保留原有核心断言与快照。实际问题发生在组件输出去重阶段：消费者被根样式覆盖后，初始化留在组件中。最终修复仅在该阶段调用 PostCSS 清理函数；有残留消费者或作者类声明时保留内容。不能用局部通过替代全量契约，也不能为了匹配静态旧快照取消根产物职责。

## 验证

命令均在独立 worktree 执行；正常 Vitest 使用 CI=1 和 --update=none。

- pnpm typecheck、pnpm build:ci、pnpm build、pnpm tsd、pnpm lint、pnpm agents:check、pnpm agents:test、pnpm support-matrix:check 通过。
- 初轮最终完整测试：5374 通过、11 失败、47 跳过；失败促使撤回过宽清理并拆分超长工厂。修正后同组 9 文件、77 项核心回归通过，未更新核心快照。
- PostCSS 最新完整回归：74 文件通过，763 测试通过、3 跳过。
- Uni scoped/layer 真实构建的 3 项断言通过；后续选中静态回归中再次通过。
- 钩子、Webpack 配置、运行时裸任意值与 Uni App X 定向回归：4 文件、100 项通过。
- E2E 覆盖矩阵 34 项、框架矩阵 12 项、多平台构建 52 项通过；最终静态复跑 369 通过 / 31 跳过，多平台 52 通过（其中 51 个真实构建案例）。
- 静态基线按具体项目单独更新和审查。已检查的 Taro/Uni 差异为默认 content 初始化，Uni App X 另含无语义影响的选择器列表顺序和空白。该轮全量静态回归通过；跳过项目仍需独立激活验证。

## 适用边界

以上阶段性通过不代表全端验收完成。修正后的 test 与 coverage 均为 5380 通过 / 47 跳过，core 为 3583 通过 / 35 跳过；所有 demo、IDE、HMR 与设备截图仍需补齐证据。

旧 checkout 的覆盖率 Vite 超时在早期隔离核心回归中未复现，尚不能归因为具体生命周期缺陷。Harmony 曾首次启动成功，随后 HMR 失败，回退构建又遇包名/签名错误；回退错误不能证明首次 HMR 失败原因。VDOM 与 Vapor 需要独立运行时和截图证据。

## 规则评估

不新增规则。现有类型边界、独立 worktree、先复现后修复和真实端证据要求已经覆盖这些问题；本次以可执行回归和保留被推翻假设来纠正过程。

## Harmony Vapor 探针与更新边界

Vapor 页面实际显示了当前文字，但 UITest 与 ArkUI inspector 不提供文字字段。测试通过临时 UTS 探针调用 UniElement 的真实文本和布局 API，并用本轮 UUID 区分记录。DOM API 的逻辑像素按实际 pixelRatio 换算后比较行高；缺失、重复或零尺寸节点不能通过。探针日志协议避免使用会形成 Tailwind 任意属性候选的方括号加冒号结构。

系统日志刷屏会挤掉有界诊断缓冲中的早期证据。保留原有缓冲上限，另设逐行状态观察器与完整日志落盘；不能靠无限扩大内存窗口处理生命周期状态。结构与视觉测试共同使用单一受管 marker 的替换逻辑，避免旧视觉代码在已有 marker 旁再次插入节点并读取旧文字。

稳定版 5.24 的 Vapor 真实运行时已取得初始 marker、布局、模式日志和截图；Tailwind 与原生两行文字均高 52 逻辑像素。保存后 HBuilderX 重建并重新安装 .hap，进程变化，因此纯 HMR 未通过。不含 Tailwind 的原生最小项目仅修改文字，也从 PID 23132 变为 23212，复现同样行为。进一步检查 stable 与已安装 alpha 的 vite-plugin-uni/dist/cli/action.js：两者均明确禁用 Harmony bin 热更新，hasBinFiles 阻止增量文件列表输出。原生对照第二轮只改文字，GenPagesIndexIndexSharedData.bytes 的 SHA-256 发生变化、样式字节码保持不变，PID 从 13733 变为 13790。根因是安装版工具链的字节码热更新能力限制；未修改厂商文件或业务代码绕过。

## 测试调度纠正

框架包装命令中的 E2E_PROJECT_FILTER 只过滤注册项目，仍会执行 RN 等通用静态测试。独立 Expo 构建与内嵌兼容性导出重叠时，前者清理 react-native/dist，使后者的 Metro transformer 短暂缺失。这是本轮调度引入的失败，需保留原始错误并串行重跑；不改生产代码，也不把当轮框架命令写为通过。

## HBuilderX 样式导入图与作者样式回填

HBuilderX 小程序输出的 app.wxss 只是 main.wxss 的导入壳。原 IDE 测试只观察壳文件的修改时间，因此漏掉真实样式更新。测试现在沿实际 @import 图收集可达样式及修改时间，覆盖非微信后缀、循环引用和缺失文件。

修正观察后，产物中既有正确展开的 theme() 规则，也有后续回填的未编译重复规则。原断言只检查首个同名规则，无法识别该问题；现在对全部同名规则拒绝未展开的函数。根因是生成器与作者样式回填使用了不同处理阶段，后者仅做平台兼容处理，没有 Tailwind 编译上下文。

作者函数现在由本次解析的生成源和受管理的生成会话编译。语法和值处理归 PostCSS 包，核心仅编排编译；使用唯一内部选择器承载待编译值，通过明确身份取回结果，再写回原声明或媒体条件，保持原有顺序和作用域。不会用作者选择器/属性名猜测结果、删除未编译声明或后置读取源码。多个生成源给出不同值时明确报错，避免选择任意配置。内部探针不进入最终产物。

新增真实生成回归先复现两个失败，再验证普通回填和框架已处理回填；另覆盖主题修改、歧义配置、重复声明、媒体条件、字符串内容和缺失编译结果。生成与框架组合回归 179 项、语法层 3 项及 IDE 观察/断言 6 项通过；Lint、typecheck 和两包构建通过。真实 IDE 验收仍独立记录，不能由这些单元结果替代。


## UI 构建与测试的产物所有权

非 CI 模式的 atomic 测试加载 Vite 配置时触发嵌套 CSS 构建，emptyOutDir 清空 dist，导致随后 tsd 缺少 variants.d.ts。CI 跳过该测试掩盖了污染。配置现在仅声明 CSS 构建，现有包级脚本随后由 tsdown 生成 JS 与类型；CSS/WXSS 镜像通过最终 generateBundle 产物生成，不从文件系统改写输出。使用仓库自己的样式生成器并显式登记组件和测试候选源。

测试使用 write:false 返回的内存产物，不再跳过 CI，并校验磁盘目录内容哈希不变及 CSS/WXSS 完全一致。62 项 UI 测试、完整 UI 构建和根 tsd 通过。监听由 tsdown 管理 JS/声明及 Vite 样式 watcher 的进程生命周期；实际 CSS 保存、TS 保存和回退均验证通过，不能仅凭首次构建判断监听有效。

## IDE 像素坐标与静态断言

preflight 检查不应要求规则在 padding 后立刻结束：压缩器可合法合并变量初始化。断言改为检查准确选择器集和全部必需声明，并拒绝后续覆盖。渐变非空 fallback 的逗号空白不改变语义，断言接受该等价空白；空 fallback 的必需空格仍严格检查。

DevTools 截图包含状态栏和导航栏，而节点 offset 属于页面窗口。直接以整屏高除页面高会使取色位置偏移，甚至在错误节点区域得到正数。共享截图入口根据真实 getWindowInfo 的屏幕比例、screenTop 与窗口大小裁剪，保存整屏原图及几何元数据，并拒绝比例不符和越界。单位回归覆盖不同缩放和自定义导航，实际 IDE 像素验收另行记录。


## 视觉证据的失败边界

进一步检查发现旧视觉报告在截图失败后根据产物哈希生成彩色条纹，且运行时 marker 不可读时返回 artifact+visual；这些诊断结果可被汇总为通过。现移除合成图和运行时失败兜底，要求同一运行实例读到本轮 marker、取得真实截图。主题结构/截图失败不再被转换成 skipped 后继续通过，暗色目标也不能由页面其它黑色区域代替。新增失败回归验证截图异常不生成图片、旧 marker/缺失页面不通过、无关暗色像素不通过。

Issue 928 的旧比较基线裁到了标题且遗漏目标节点。修正截图坐标与长页面缩放后，只重新生成并人工核对 v4-compare.png，随后在关闭更新开关时两项真实 IDE 用例通过；where 与 root selector 的实际 IDE 用例也通过。正常运行不再自动创建缺失基线。

长页面的主题目标可能位于窗口外。主题截图需先用运行时 SelectorQuery 确认真实节点几何，必要时滚动至目标，待整个节点进入当前窗口后单独截图；不能用页面总高度压缩坐标。HMR 前后截图保持原位置，主题截图另行归档。

## Uni App X 增量产物与真实主题截图

源码生成标记需要在资源分类之前登记到源码/产物关系中，否则框架重命名后的样式会被重放到运行时未引用的虚拟输出。框架增量 bundle 省略的基础样式必须从前次真实输入保留，并响应明确的删除事件；同一目标的入口重放需要等待该轮框架贡献完成后合并，不能覆盖已经生成的布局规则。

小程序局部基础类和局部变体必须共享页面层叠。仅保留全局变体会与 scoped 基础类产生优先级差异；仅比较原作者选择器字符串又会误删主题展开后新增条件的规则。回归覆盖局部变体、Vue 作用域属性、无关生成类与后代类排除。

DevTools 的原始截图可能包含 ICC 屏幕色彩配置。直接用 PNG 像素重编码会丢失配置，导致像素断言把正确的 CSS 颜色判为失败。保留原始 full PNG，先通过支持 ICC 的解码器转换到 sRGB，再裁剪和比较；不得放宽颜色阈值。视觉用例失败不重新启动 DevTools 以代替当前运行实例。

### 小程序样式隔离 2.0 的产物边界

HBuilderX 会把框架样式 import 插入编译后的 SFC 样式。该 import 属于产物图，不能随 transient cssSources 交给 Tailwind 的源码解析器。编译输入移除产物 import，外层管线保留并重放原 import；微信、支付宝、抖音扩展名回归先红后绿。框架生成的 .a[class] 使用 .a.a 等价表达，保持匹配范围和优先级；不存在同复合选择器类约束、带属性值或命名空间的条件不能猜测改写。

### 框架增量样式回滚缓存与合并顺序

普通 HBuilderX Uni 的入口样式保存后可以生成新规则，但回滚会重新出现旧规则。诊断发现两条路径：入口重放误用已经混入框架贡献的最终产物缓存；最终合并先注入旧源码记录，再追加本轮无旧规则的结果。修复保持来源边界，从入口源码重建重放结果，在框架收集后、统一注入前替换本轮记录。vite-processed-css-replay-order.test.ts 覆盖 acss、ttss、css，修复前均失败；真实 HBuilderX 5.24 的新增与回滚短链路通过。vite-remembered-css-replay-root-shell.unit.test.ts 和 vite-framework-style-memory.test.ts 覆盖混合缓存与原始贡献失效。完整 IDE 回归仍需完成。

### App 视觉探针需匹配本轮步骤语义

失败截图中背景色相近的两个控件被合成一个全屏包围盒，导致标记文本判定错误；间距变化沿用同一颜色时，像素总量也不应要求增加。探针改为连通区域和声明几何定位，同色 HMR 比较标记区域背景像素变化，同时拒绝未变化和多候选歧义。视觉执行器补执行步骤声明的主题源码变更，并在结束恢复；后续仍必须取得新模拟器截图，旧失败截图只用于定位回归。

## Web 聚合资产的模块边界

Uni H5 的最终 CSS 资产包含 Tailwind 根模块、独立 UI import 和 App.vue 普通样式。重新生成 Tailwind 后替换整个资产会删除后两者。把这些样式移到 Tailwind 入口只能掩盖问题，已撤回该规避。生成阶段记录模块开始与结束标记，最终化只替换该模块区间，保留相邻内容；缓存键同时包含聚合资产内容，避免普通 CSS 改动而候选不变时复用旧资产。

Taro Web 的后置生成还需要重放框架 PostCSS，保留组件选择器、单位和前缀转换；Web 不应走小程序的 layer 清理。修复保持样式处理归 PostCSS 包，核心仅编排。模块区间、普通 CSS 往返更新、框架重放和 layer 顺序均有回归；Web 独立样式 E2E 六项通过。生成器基线按项目审查后更新，最终矩阵仍单独验收。

## 原生进程重启不能计作纯 HMR

HBuilderX 5.24 的 Android Uni App X 六步保存均通过 marker、颜色、几何和截图检查，但每次保存后 App Launch 再次出现。logcat 同时记录 refreashType=restart、System.exit(0) 和 PID 更换。这是有序退出重启；不能仅凭系统随后写出的 crashed service 字样判断应用异常崩溃，也不能把页面恢复成功作为同实例 HMR。

原 runner 只为 Harmony 创建持续日志观察器，因此 Android/iOS 漏检重启。观察器现在覆盖全部原生目标；只有 Harmony 等待专用热更新完成消息，Android/iOS 继续依赖产物与运行时探针，并在探针之后和下一步开始前检查重启回退。新增测试覆盖传输完成后才出现 App Launch、初始启动排除及订阅清理。九项生命周期回归通过；实际原生结果须按新标准重跑。没有修改厂商文件、放宽阈值或把重启宣称为纯 HMR。

实际复验确认 Android 首轮保存被新检查判为 restarted。无 Tailwind 的独立原生项目仅替换一行文字，也取得新 marker、重新 App Launch，PID 从 14973 变为 15124；截图仍可见调试框架重新加载提示。由此可将当前安装版本的 Android 纯 HMR 归为工具链能力阻塞，而非 Tailwind 样式转换故障。iOS 日志/产物用例通过，但尚不足以单独证明 PID 连续性和完整视觉验收。

## 框架 PostCSS 插件必须实际执行

先前归一化过滤掉字符串插件路径，让构建在缺少 preset-env 转换时成功；对旧式 transformer 提前调用也违背 PostCSS 契约。现按来源上下文解析模块，动态加载 CJS/ESM、解包 default 并保留 tuple 选项；裸 transformer 和 Processor 组合交给 PostCSS 规范化，无法解析的启用插件明确失败。`packages/postcss/test/framework-pipeline.test.ts` 使用真实 preset-env 输出前缀证明插件执行，另覆盖旧式函数、组合、无效插件及带空格的绝对和相对模块路径。

旧实现在三个回归中失败；修复后框架与加载回归 15 项通过，完整构建 66/66 通过（0 缓存）。四个 Taro 项目原范围复验定位到 Vite Vue3 Web 基线；按源 CSS 和 AST 审查 inset 降级、等价颜色、暗色规则拆分及标记清理后，仅更新该项目 Web/web-compact 8 个文件，无更新复验 10/10 通过。单项目通过不能证明其它项目偶发波动，先前此项归因已撤回。完整框架与真实端验收仍独立执行。

视觉 runner 原先仍只对 Harmony 注册该观察器。新增 `e2e/app-visual-lifecycle.test.ts` 直接调用视觉入口，覆盖 Android/iOS 保存阶段重启、截图后重启和正常更新；旧实现把两个重启场景误报为通过，修复后组合生命周期 15 项通过。共用 helper 的回归不足以证明所有调用方已经接入，必须测试负责最终状态的入口；真实端视觉结果仍需独立复验。

## 提交时的验收状态（2026-09-17）

本轮以草稿 PR 提交已实现的修复，完整全端验收尚未完成。没有修改仓库规则。

| 范围 | 本地结果 | 原始记录名 |
| --- | --- | --- |
| 完整单元 | 5440 通过、43 跳过 | final-current-unit |
| Lint、类型检查 | 通过 | final-current-lint、final-current-typecheck |
| 覆盖率 | 命令通过；语句 83.02%、分支 78.56%、函数 84.97%、行 83.17% | final-current-coverage |
| 完整构建 | 66/66，通过且无缓存命中 | build-real-framework-plugins |
| Uni、weapp-vite、H5 框架续跑 | 各子阶段通过；原完整 frameworks 命令仍保留失败 | frameworks-uni-after-reviewed-order、frameworks-weapp-after-reviewed-order、frameworks-h5-after-reviewed-order |
| 无过滤 static | 425 通过、32 跳过、1 失败 | static-current-all-projects |
| IDE 完整入口 | 框架阶段 11 通过、1 启动超时；后续阶段未执行 | ide-full-current |
| HBuilderX stable Issue1144 | Options/setup 各 16 次保存与刷新，2 项通过 | optin-issue1144-stable-current |
| Issue1170 | LF/CRLF 热更新和生产 CSS，3 项通过 | optin-issue1170-current |
| 其他显式启用回归 | 开发启动矩阵、Issue1164 Harmony/小程序及原生对照、Issue1160 小程序通过 | optin-dev-startup-current、optin-issue1164-harmony-mini-current、optin-issue1164-native-current、optin-issue1160-mini-current |
| 独立 Expo RN | Web/Android/iOS wrapper 12 项通过，含截图与两轮 HMR | rn-all-current-recorded |
| Issue951 | 11 个构建目标通过；RN bundle 与 Harmony hybrid 产物不代表设备运行 | issue951-scope-results |

static 的失败位于 apps-generator-mode 汇总报告快照。项目 CSS 基线已在此前按项目审查更新，但完整汇总仍有字节数与选择器差异，尚未闭环；单项目通过不能替代此失败。正常回归未更新快照。

IDE 首次失败为 weapp-vite DevTools 启动超过 30 秒，日志同时显示基础库 3.17.3 下载；尚不能把该相关日志认定为唯一根因。已有 relaxed visibility 或 artifact 结果不等于真实页面视觉通过。

CLI Issue1144 Options 通过，新增 setup 场景在首次渲染失败。只保留 DCloud 插件并将运行时版本对齐到 3.0.0-alpha-5020220260725001 后，仍复现 UTSJSONObject 属性描述符错误和类型导入未消除；记录为 CLI 工具链阻塞。HBuilderX stable 5.24 的独立 setup 验证通过。Alpha 启动被已有 stable 实例接管，未取得 Alpha host，因此不计通过。

Android UniX 与 Harmony 的同实例 HMR 仍受工具链重启/重装限制，无 Tailwind 对照也复现；iOS 严格视觉、完整视觉/full profile、部分本地平台矩阵与 GUI attach 仍需验收。设备在线、初始截图、VDOM 或历史结果不能替代这些证据。

原始日志、覆盖率 HTML、截图及机器可读账本保留在本地 e2e/reports/local-full-run/2026-09-15T13-34-05-764Z/；该目录不随 PR 上传。记录名用于定位对应 JSON/日志。部分后续命令原先写在父级 local-full-run/，提交时已复制归档到同一轮目录。
