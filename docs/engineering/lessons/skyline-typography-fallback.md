---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 35762afa58b7bdd665324e46e23011106d2727fb
regressions:
  - e2e/skyline-typography-ide.test.ts
  - e2e/skyline-typography-static.test.ts
---

# Skyline 字体变量 fallback、初始化范围与兼容边界

第二阶段已在最终插件生产管线完成定向验收：使用缺失变量引用及组件本地初始化，保留嵌套 fallback、工具类和手动覆盖。第一阶段的复现与自引用失败证据继续保留；原生项目及 test-copy 实验只作为可行性证据，生产验收另列。`verified` 仅指下文指定的开发者工具模拟器、基础库与用例范围，尚无真机证据。

## 症状

来源为本次用户提供的 uni-app / Skyline 问题，没有对应的 GitHub Issue。
在微信开发者工具 `2.02.2608080`、基础库 `3.10.3`、iPhone 12/13 (Pro) 模拟器中：

```css
.sample {
  font-size: 20px;
  line-height: var(--tw-leading, var(--text-header-md--line-height));
}
.initial { --tw-leading: initial; }
```

主题行高为 `32px`，同一段两行文字在 WebView 高 `64px`，Skyline 高 `56px`。
将 fallback 直接写成 `32px` 仍可复现，不能把问题仅归因为嵌套 `var()`。
uni-app v4 demo 使用共享组件的两个页面，页面 JSON 分别声明 `skyline` / `webview`。
测试核验实际 `getCurrentPages()` 的 renderer、route 及本轮构建的唯一 dataset marker。

## 根因与纠正

已定位首次差异在 Skyline 对自定义属性 `initial` 的运行时处理，尚未定位微信内部实现。
不能删除 `--tw-leading` / `--tw-font-weight` 消费端，否则会损坏工具类和动态变量覆盖。
作者空值是合法的空内容，与 guaranteed-invalid reset 不同，不应全局替换。
兼容开启前，插件补齐的空默认值也会使字体 fallback 不生效，需要与引擎的 `initial` 问题区分。

首个候选为自引用：

```css
.cycle {
  --tw-leading: var(--tw-leading);
  --tw-font-weight: var(--tw-font-weight);
}
```

局部 `.cycle` 在两个 renderer 中均恢复 `64px`，内联设置 `44px` 后为 `88px`，清除后恢复 `64px`。
但把完全相同的两个 reset 加到全局初始化范围会触发更严重的问题：

```css
view,text {
  --tw-leading: var(--tw-leading);
  --tw-font-weight: var(--tw-font-weight);
}
```

独立原生项目只增加上述规则后，WebView 仍能完成 `64 → 88 → 64px`；
切换 Skyline 后白屏，`App.callFunction` 无响应，开发者工具显示：

> 模拟器长时间没有响应，请确认你的业务逻辑中是否有复杂运算，或者死循环

原生 computer use 同时核验了 `当前渲染模式: Skyline` 与 `skyline_renderer` 的页面路径。
自动化因 marker 等待超时而没有得到该轮 Skyline 的运行时 identity JSON，不能伪造计算样式或身份返回。
这些证据证明了白屏和协议无响应，尚不能证明微信内部崩溃或死循环的具体实现根因。

**第一阶段因此停止全局自引用转换方案，撤回当时的候选实现和 `cssOptions.skyline` 配置。**
仅局部类规则通过，不能作为全局 preflight 转换安全的依据；定向单测通过也不能替代真实渲染验证。

第二阶段采用不同的 reset，不恢复自引用：

```css
view,text {
  --tw-leading: var(--weapp-tw-invalid-reset);
  --tw-font-weight: var(--weapp-tw-invalid-reset);
}
```

该表达式引用必须保持未定义的内部变量，在计算时得到无效值。原有消费端 `var(--tw-leading, var(--text-header-md--line-height))` 不变，保留工具类 setter 和内联覆盖。纯 `initial` 与插件拥有的默认值可转换，作者空值仍是合法输入，不能据此推断为插件默认 reset。

仅在主样式中生成上述 reset 还不够。uni-app 编译结果的 test-copy 对照中，全局 `view,text` 的直接样本为 `64px`，但组件内祖先 setter 下的子节点仍为 `96px`；将初始化放在组件自身样式中后，直接样本和子节点均为 `64px`。这是组件样式作用域及变量计算边界，不能通过删除消费者 fallback 或冻结主题值来修正。

当前实现约定为默认 `false` 的嵌套 `cssOptions.skyline`，按微信构建目标显式开启。uni-app Vite 在组件本地业务样式前补初始化，作者有效值继续覆盖它。运行时初始化与视觉 preflight 分开，因此 `cssPreflight: false` 不能把它清空，scoped preflight 和 root/import coverage 去重也不能把它当作根样式已覆盖的重复规则删除。CSS AST 变换和保留判断归 PostCSS 包；构建器只传递已解析目标、样式及产物关系。

保留变量 `--weapp-tw-invalid-reset` 不得被声明或注册，包含只定义该变量而不使用字体工具类的资产。校验须在注册、条件规则、preflight 等清理前执行，并在最终资产阶段再次执行；语法兼容兜底不得吞掉这类契约错误。运行时内联样式及未处理的第三方输入仍由应用保证不定义该名称。开启兼容时，显式 `cssRemoveProperty: false` 或 `atRules: { property: false }`（包括旧版顶层配置）必须拒绝。

## 验证

### 第一阶段历史复现

原生观测值（两行、字号 `20px`、主题行高 `32px`）：

| 输入 | WebView | Skyline |
| --- | --- | --- |
| 缺失变量，嵌套 fallback | 64px | 64px |
| `initial`，嵌套 fallback | 64px | 56px |
| `initial`，字面量 fallback | 64px | 56px |
| 作者空值 | 56px | 56px |
| 有效 `44px` setter | 88px | 88px |
| 局部自引用，嵌套 / 字面量 fallback | 64px | 64px |
| 直接主题变量 | 64px | 64px |
| 全局自引用 | 可渲染、可覆盖和恢复 | 白屏、协议超时 |

Skyline 的 SelectorQuery 未返回 `line-height` / `font-weight` 计算字段；该端结论主要使用文字矩形尺寸与原生基准。
WebView 同时记录了计算样式。独立字重探针使用 Arial 与原生 400 / 700 对照，未把中文字体外观当作字重计算证明。

可审阅的观测字段保存在 [evidence.json](./assets/skyline-typography/evidence.json)，其中移除了本机绝对路径与系统权限字段。
局部规则截图：[Skyline](./assets/skyline-typography/scoped-skyline.png)、[WebView](./assets/skyline-typography/scoped-webview.png)。
完整日志、输入项目和截图保持原始形式留在忽略目录；全局失败没有可用的自动化截图，使用原生 UI 核对了白屏和无响应提示。

持续保留的入口：

```sh
# uni-app 生产输出：验证修复及保留的独立引擎差异
CI=1 E2E_IDE=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/skyline-typography-ide.test.ts --update=none --coverage.enabled=false

# 原生局部 reset 矩阵，记录 default / override / restored
pnpm exec tsx e2e/skyline-typography-native.ts

# 独立手动诊断入口：已知可能使本次 Skyline 模拟器无响应，不纳入默认自动化
SKYLINE_GLOBAL_RESET=1 pnpm exec tsx e2e/skyline-typography-native.ts
```

脚本只连接已开启且已登录的 IDE；每次生成独立项目并通过原绑定服务关闭本次项目。
原始日志与截图保留在忽略的 `e2e/.artifacts/skyline-typography*`，原生脚本同时保存完整输入和 CSS SHA-256。
首次局部成功记录为 `0326a0b9-33d6-4eac-8530-38d143b9517d`；
首次全局失败记录为 `a3b82e7d-d258-4576-8424-f02de2f6c1a9`，两轮均已完成项目清理。
首次 uni-app 修复前 Skyline 回归为 `ef6897f7-e538-4241-8cab-ece2c767ede0`，测得 `56px`，原生对照 `64px`。

最终 uni-app 复现回归 `4d6ad2c5-9880-4cc7-8dd0-a855643682be` 通过，两端均核验了本轮唯一构建标识并完成清理。
持久原生脚本的局部矩阵复验 `3c2e2eff-5a85-42cd-802f-382b851dd61d` 完成两端 default / override / restored 观测并清理。
Skyline 作者空值清除覆盖后仍保留 `88px` 的异常也被记录，未用转换作者空值来掩盖它。

第一阶段复现提交的本地检查（历史记录，不代表第二阶段生产修复已通过）：

- 两个 static 入口共 3 项通过，限定 `uni-app-vite-tailwindcss-v4` 更新 18 个基线后，以 `--update=none` 再次通过。
- `e2e/wechat-session-boundary.test.ts` 的 5 项会话边界回归通过。
- `UNI_BUILD_STRICT=1 pnpm --filter @weapp-tailwindcss-demo/uni-app-vite-tailwindcss-v4 build:h5` 与 `build:mp-alipay` 均通过，检查真实 `.css` / `.acss` 产物保留嵌套变量链。
- 第一阶段候选实现曾通过定向单测和包构建，但随后真实运行失败，已全部撤回；第一阶段提交没有包源码差异，不能将候选单测作为第二阶段修复通过证据。

### 第二阶段实验：缺失引用与组件本地初始化

下列实验均使用上述 DevTools / 基础库组合。原生项目或手动调整生成产物的 test-copy 用于控制变量，不是插件生产输出；观测摘要及原始 JSON 的 SHA-256 保存在 [feasibility-evidence.json](./assets/skyline-typography/feasibility-evidence.json)，不包含本机绝对路径或系统权限信息。

| 实验 | 运行标识 | 已观察结果及限制 |
| --- | --- | --- |
| 原生 reset 策略对照 | `3b30cbb8-f947-44b5-baf3-166c4c4b2985` | 缺失引用的默认 / 内联 `44px` / 清除得到 `64 → 88 → 64px`，较小主题样本恢复 `40px`；作者 `initial` 与空值对照仍有原异常 |
| uni-app 初始化范围 test-copy | `4bc7354e-34dd-433f-83d2-189f9fbd416b` | Skyline 全局标签初始化的组件子样本为 `96px`，组件本地标签初始化后为 `64px`；没有据此声称构建插件自动注入已通过 |
| uni-app 本地样式动态 test-copy 重试 | `5c3b3a03-3f0d-489c-88bf-7c18a63fce36` | 两端默认 / 内联 / 清除为 `64 → 88 → 64px`，工具类 / 清除为 `72 → 64px`；小主题为 `40px`；Skyline 祖先主题覆盖清除后仍为 `80px` |
| `env()` 维度及已知值对照 | `113b5e2b-b333-4d42-a52e-30a5300d695f` | Skyline 的 `env(viewport-segment-width)`、`env(safe-area-inset-top 0)` 默认均为 `56px`，不能替代 reset；已知 `env(safe-area-inset-top)` 对照为 `47px` 行高、两行 `94px`，说明不能将失败概括成完全不支持 `env()` |
| 主题依赖与直接消费对照 | `85ff23b6-4940-40ab-baa1-e4e0167f4ced` | `line-height: var(--lh)` 的直接及深层节点也出现 `64 → 80 → 80px`，第二轮 `72px` 覆盖移除后仍为 `72px`；局部别名、链式引用没有消除此异常 |

动态 test-copy 的第一次连接失败及重试过程均保留原始记录，摘要只引用实际存在的 `retry-evidence.json`，不将 `inputs.json` 中计划但未观测的组合阶段计为通过。字重样本的相同矩形高度不能证明 `font-weight` 相同；Skyline 未返回的计算字段仍不补造。

主题移除异常在没有 `--tw-leading` fallback 的直接消费中也存在，因此属于独立的 Skyline 依赖更新问题。根节点 setter 刷新后，直接节点可能恢复而深层节点继续保留旧值，同样不能当作通用恢复方案。作者空值被临时 setter 覆盖再清除后的残留也继续保留为独立问题，不通过改写作者空值掩盖。

### 第二阶段生产管线验收

最终 production IDE 运行标识为 `fb753925-be6b-4216-8d0b-f156937e348c`，唯一构建标识为 `b6fe01bf-fb2f-4e89-ae25-9241161611b8`。该轮由正常 `build:mp-weixin` 编译当前 demo，没有改写生成产物。两端各 11 个阶段，共 22 条记录；每轮核验 route、实际 renderer、构建标识及布局，保存 15 个 WXSS 的 SHA-256 和两端 default / theme-clear / reset 共六张截图。成功后通过原绑定服务关闭项目；当前会话原生 UI 再次确认 IDE 已返回项目列表，登录态保留。

源码身份以第一阶段提交 `4c94ab4b4d14464dca9cc8cd67fbdeed816e688b` 加本轮生产源码 manifest 绑定，manifest 指纹为 `2223bced70ade07a0d7ec9bc8cd382dd50759861a551161d8aa09919dad76f45`。相对路径、逐文件摘要、原始 JSON 摘要及观测值保存在 [implementation-evidence.json](./assets/skyline-typography/implementation-evidence.json)。这份 manifest 不包含后续文档和截图，避免证据自引用；最终提交中的对应文件可逐项校验。

动态驱动为 **App-Service 调用真实源码组件公开 action，与源码按钮共用**，不是原生 `tap()`。较早的 `8f221e7f-1cd9-4359-bea8-da7ce22b9f5c` 因 automator 的 `page.$()` 返回 `null` 失败，不能据此宣称选择器或字体修复失败；改用源码明确公开的 action 后再完成全部布局断言。没有把旧 test-copy 注入的 bridge 计为生产证据。

| 阶段 | 两行大主题 / 小主题 | 字重 |
| --- | --- | --- |
| 默认，含祖先污染及无样式 / scoped / 外部样式嵌套组件 | 64 / 40px | 匹配原生 700 |
| 内联 `--tw-leading:44px` | 88 / 88px | 匹配原生 400 |
| 清除内联 | 64 / 40px | 恢复 700 |
| `leading-[36px] font-normal`，含与内联组合 | 72 / 72px | 匹配原生 400 |
| 清除内联但保留工具类 | 72 / 72px | 匹配原生 400 |
| 清除工具类 | 64 / 40px | 恢复 700 |
| 祖先主题更新 | 80 / 48px | 匹配原生 400 |
| 祖先主题移除 | Skyline 仍为 80 / 48px，WebView 恢复 64 / 40px | 与直接主题负控一致，独立异常未修复 |
| 主题移除后再用工具类 / 最终 reset | 72 / 72px → 64 / 40px | 400 → 700 |

`leading-[36px]` 自身直接声明 `line-height:36px`，因此与内联变量组合时两行基准为 `72px`，不能误用 `88px`。Skyline 仍未返回行高 / 字重计算字段，使用矩形和原生对照；Arial 的 700 / 400 宽度分别约为 `263.2` / `241.9px`。

生产截图：[Skyline](./assets/skyline-typography/production-skyline.png)、[WebView](./assets/skyline-typography/production-webview.png)。截图包含本轮构建标识，顶部状态栏遮住了部分标题，不影响文字样本核对；嵌套组件的完整测量以 JSON 为准。

| 验证入口 | 结果及范围 |
| --- | --- |
| PostCSS 定向回归 | 6 文件、146 项通过；AST、条件、顺序、`!important`、重复处理、作者空值、注册需求与契约错误 |
| 主包定向回归 | 7 文件、88 项通过；目标开关、SFC、首次编译 / HMR hook、缓存、覆盖去重、Vite slots 及架构契约 |
| 配置兼容回归 | 7 文件、56 项通过；配置快照、编译目标及 handler 选项透传 |
| 最终资产契约 | Vite / Webpack / Gulp 的跨资产保留名冲突、注册冲突与错误传播由定向测试覆盖；没有宣称三套构建器均做 IDE 运行验收 |
| 默认关闭及 `cssPreflight:false` | 由 PostCSS / 主包定向测试覆盖；本次 IDE demo 使用默认视觉 preflight，不能冒充关闭 preflight 的运行证据 |
| 受影响包构建 / 类型 | 两包 `build`（包含类型生成）、主包 `tsd` 通过 |
| static | 仅更新 `uni-app-vite-tailwindcss-v4` 的 23 个基线，审查后两入口共 3 项以 `--update=none` 通过 |
| H5 / 支付宝 | 最终源码严格构建通过；9 个 `.css` / 13 个 `.acss` 无内部 reset 引用，保留嵌套字体 fallback；仅产物验收 |
| 文档与工程 | 四页经 Docusaurus 实际编译及 JSX 解析；配置文档、架构边界和 agents 检查通过，ESLint 无错误 |
| 物理设备 / 原生 App | 未验证，无 App 构建或设备证据 |

static 审查曾发现局部后处理先删注册导致非字体默认值丢失，已用 `handler(isMainChunk:false) → finalizer` 回归固化失败，再将需求收集移到删除注册之前。最终基线保留原有 shadow、ring、gradient 等非字体初始化；上述 production IDE 与 static 结果均来自顺序修正之后。

真实 watch 证据位于 `e2e/.artifacts/skyline-watch-implementation/retry/`。同一 `uni -p mp-weixin` 进程中，修改无样式组件，依次经历无样式、增加 `36px`、改为 `42px`、改为 scoped `38px`、删除样式；等待真实 WXSS 改变后 `reLaunch`。两端大样本为 `64 → 72 → 84 → 76 → 64px`，小样本始终 `40px`，本地 reset 每阶段都存在。首次运行因 IDE 自动编译后回到启动路由而失败，重试在路由 / renderer 变化时重新定位，并保留首次错误。这是增量编译验证，不宣称保留页面状态的 HMR。两次均恢复源码、关闭项目，watch 进程已终止。该 watch 证据早于最后的非字体注册收集顺序修正；之后已重跑最终 production IDE 和 static。

本轮使用 Node `24.22.1`、pnpm `12.15.0`、Tailwind CSS `4.3.3`，主要命令如下，均从仓库根目录执行：

```sh
CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/skyline-typography.test.ts test/skyline-contract.test.ts test/skyline-generator-plugin.test.ts test/mini-program-css.test.ts test/mini-program-generated-css.test.ts test/webpack-css-transforms.test.ts --update=none --coverage.enabled=false
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/context/skyline-typography.test.ts test/bundlers/uni-app-skyline-typography.test.ts test/bundlers/vite-skyline-css-reuse.test.ts test/bundlers/vite-skyline-typography-target.test.ts test/bundlers/vite-css-memory.test.ts test/bundlers/vite-plugin-slots.unit.test.ts test/ci/architecture-contract.test.ts --update=none --coverage.enabled=false
pnpm --filter @weapp-tailwindcss/postcss build
pnpm --filter weapp-tailwindcss build
pnpm --filter weapp-tailwindcss exec tsd

# 基线更新单独执行一次 -u；审查后只运行禁止更新的复验
CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_PROJECT_FILTER="^uni-app-vite-tailwindcss-v4$" pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-vite-tailwindcss-v4.test.ts e2e/skyline-typography-static.test.ts --update=none --coverage.enabled=false
CI=1 E2E_IDE=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/skyline-typography-ide.test.ts --update=none --coverage.enabled=false
UNI_BUILD_STRICT=1 pnpm --filter @weapp-tailwindcss-demo/uni-app-vite-tailwindcss-v4 build:h5
UNI_BUILD_STRICT=1 pnpm --filter @weapp-tailwindcss-demo/uni-app-vite-tailwindcss-v4 build:mp-alipay
pnpm architecture:check
pnpm agents:check
```

## 适用边界

本次只验证上述 DevTools 模拟器与基础库组合。未验证物理设备、其他基础库或其他平台运行时。
H5、支付宝仅做构建产物验证，不推定其运行时语义。实现阶段没有开展全仓全面验收。用户随后要求全部检查通过后合并，因此交付后继续跟进 PR CI，合并状态以最新提交为准。
动态覆盖、主题切换及工具类按钮继续保留，验收结论来自本轮真实产物和布局观测。
第一阶段提交 `4c94ab4b4d14464dca9cc8cd67fbdeed816e688b` 只交付复现，没有公开包行为变化。第二阶段交付缺失引用 reset 及组件本地初始化，对 `@weapp-tailwindcss/postcss`、`weapp-tailwindcss` 各记录中文 patch change intent。

## 规则评估

现有“先固化真实失败、再同用例复验”规则有效；需要核验初始化范围和组件边界，不能把局部 CSS 的成功外推到全局样式。
不新增全仓规则，不删除动态能力，不使用扩大选择器范围或硬编码产物路径来掩盖问题。

## 合并前检查跟进（2026-10-30）

提交 `7b787355006f071877a66287283efeef59427080` 的首轮检查暴露了两项代码问题：Compiler 转换闭包捕获整个 services 容器，导致关闭后仍保留缓存 AST；Webpack 资产编排文件超过既有 500 行门禁。分别改为仅捕获并释放所需平台字段，以及提取 CSS 收尾操作，保持原有检查和阈值。

性能日志确认存在重复解析：输入结果缓存命中前仍进行完整校验，多个资产收尾边界反复校验相同文本。命中缓存后直接返回已验证结果，未命中时复用默认解析器的 AST；保留 `from`、上游 source map、自定义 parser/syntax 与 Root 输入契约。资产校验仅缓存通过的完整文本，按上下文弱引用管理，限制 64 项和共 200 万字符，不保留 AST。每次仍先检查实际目标和配置，新增冲突仍报错。未启用且没有已登记初始化块时，不读取 HMR 源码；已有初始化块仍可撤销。

定向验证：PostCSS 缓存、Root、Skyline 共 6 文件 81 项通过；主包 Skyline、组件初始化、目标、真实 GC 和行数门禁共 5 文件 64 项通过；Webpack 与架构共 3 文件 182 项通过。两个公开包构建（含类型）及主包 tsd 通过。demo 两个 static 入口共 3 项在 `--update=none` 下通过，未刷新基线。

首轮 Expo iOS 在 dark 场景第二帧期间耗尽整个 case 的 10 秒采集预算，未出现样式断言失败，完整 artifact 下载失败，因此不能确定进一步原因。Lynx iOS 在 `simctl launch` 阶段超时，artifact 记录宿主为 3 核、load average 350.6、剩余可用内存约 104 MiB；boot/install 已成功，尚未进入应用场景。保留失败门禁，不增大超时，也不将未完成测量记为通过。

原始 IDE 运行证据和源文件清单继续绑定 `7b787355006f071877a66287283efeef59427080` 的实现，不能作为后续提交重新执行 IDE 的证明。后续单测、构建、static 和 CI 分别记录，不替换历史失败记录。

### 局部生成与复现入口收尾

额外初始化块暴露了既有 SFC 合并边界问题：`HelloWorld.vue` 的 scoped `@reference` / `@apply` 与独立 reset 被拼成生成输入，导致约 479B 的局部 CSS 混入约 30KB 全局工具类。现在由本轮模块生成归属证明 apply 已完成，直接后处理真实编译资产，保留 reset、scope、媒体条件、作者声明及顺序；含普通导入或根生成指令的来源仍走生成链路。归属证据参与转换及共享缓存，真实 Vite/Vue watch 回归验证仅修改引用主题时也立即失效。该回归使用真实 Vue 插件，不冒充 uni-app 编译器运行证据。

性能对照还发现输入负载混杂：新增两页及组件后，主模块处理数由 34 增至 41。对照页现位于同一 demo 包的 `fixtures/skyline-typography`，通过独立 `UNI_INPUT_DIR`、输出目录和显式开关运行，默认 `src` 与日常生成输入恢复。H5 HTML 主模块通过 Vite `transformIndexHtml` 切换到同一 fixture，避免只更换 manifest 而仍编译默认页面。入口与操作见 [fixture README](../../../demo/uni-app-vite-tailwindcss-v4/fixtures/skyline-typography/README.md)。未改变版本对照采用各 ref 实际项目的规则。

默认 demo 与独立 fixture 的 static 基线已单独更新并审查，两个入口共 3 项以 `--update=none` 通过；另在 `E2E_IDE=1` 下单独复验 fixture static，确认不误走通用 helper 的默认 dev 项目。根目录 `twExtract` 仍扫描 fixture 并保存 token 来源报告，这与默认 CSS 的显式 `@source` 生成输入不同；默认生成 CSS 已无探针字体与 reset。

最终生产 IDE 运行 `3ac91a9d-72ca-4a84-875e-dd2b43085393` 在上述独立入口完成两端 22 阶段，9 个 WXSS 摘要及 71 个生产源文件指纹保存在 [followup-evidence.json](./assets/skyline-typography/followup-evidence.json)。运行前后逐文件摘要一致，源码指纹为 `90842621068205f2738bf665cad78edf215a0192d6c5f9d0dd70e0e952aff689`；项目已关闭，登录态保留。H5 / 支付宝严格构建分别核对 5 个 CSS / 8 个 ACSS，存在探针主题嵌套 fallback，且无内部 reset 引用；仍仅属于产物验证。

该轮截图：[Skyline](./assets/skyline-typography/followup-skyline.png)、[WebView](./assets/skyline-typography/followup-webview.png)。

本轮补充回归包括主包转换与真实 Vue watch 6 文件 59 项、GC / 开关 / 行数契约 4 文件 53 项、PostCSS 4 文件 63 项。指令分析的重复解析仅缓存完整文本、有效配置及布尔结果，限制 64 项 / 200 万字符，不保留 AST。尝试过的规划阶段 root coverage 缓存没有获得实测收益，已撤回。

版本对照重复出现两侧共同的首轮修改或回滚丢失，不能将其 CLI 成功退出视为性能通过。runner 现在等待 uni 明确就绪，并复用仓库 watch 验收的 600ms 编译稳定窗口后再发送下一次保存；该等待位于测量区间外，插件耗时、成功条件和预算均保持原口径。保留此前真实性能失败与无有效样本的报告，最终性能结论单独记录。

最终本地对照命令为 `pnpm perf:guard -- --baseline-ref 35762afa58b7bdd665324e46e23011106d2727fb --build-runs 3 --hmr-runs 3 --timeout 180000 --poll-interval 30 --only demo-uni-app-vite-tailwindcss-v4__mp-weixin --result-dir e2e/.artifacts/skyline-implementation/local-benchmark-final-settled`。当前实现完成三次构建（插件 1503 / 877 / 901ms）及三次真实 HMR（插件 195 / 75 / 73ms），基线在首轮修改超时，故没有有效的两侧对照，性能结论仍待验证。报告将基线失败排除后显示通过，不能据此宣称性能门禁已经通过，也不将当前实现的单侧数据与此前不同负载的基线拼接。最新提交推送后继续核对远端的有效对照及全部检查；未满足前不合并。

收尾时主包构建、tsd、ESLint、`pnpm architecture:check`、`pnpm agents:check` 和 `git diff --check` 均通过，benchmark runner 定向回归为 2 文件 11 项通过。本地性能子进程已正常退出，没有遗留本轮 IDE 项目或临时浏览器资源。

### 独立入口命名复验

提交 `ac4755e6babaa1112184600c6022e66c02d880fc` 的 Demo Watch Diagnostic 在执行真实矩阵前失败，原因是目录检查将 `build:skyline-typography` 当成未注册的平台。专属入口现使用 `skyline-typography:build` / `skyline-typography:dev` 命名空间，同步对应 prehook、IDE/static 调用及 README，保持既有平台目录的完整性检查。现有 `matrix.test.mjs` 9 项通过，新的构建命令在 `--update=none` 下通过 fixture static，产物基线无变化。

同一提交的 Agent Workflow Contract 两个已创建任务均成功，最终 gate 未创建；工作流页面报告 `Internal server error. Correlation ID: de1fb85f-03c7-4564-8bfd-8a4c971d60a2`。这是 Actions 基础设施失败，不修改代码或门禁规避。入口更名后会由新提交自动触发该工作流，不额外重跑过时 head。

此次更名不修改编译器、插件、Vite 配置或复现组件。`followup-evidence.json` 仍保存原运行的准确源码清单；其中仅 demo 的 `package.json` 因四个脚本名称变化而与后续提交不同，其余 70 个文件摘要一致，不能将历史记录改写成再次执行了 IDE。
