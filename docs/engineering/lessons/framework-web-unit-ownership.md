---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: 35762afa58b7bdd665324e46e23011106d2727fb
regressions:
  - packages/postcss/test/generated-web-units.test.ts
  - packages/weapp-tailwindcss/test/bundlers/framework-web-units.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-web-units.integration.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-web-units.integration.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-web-rpx-finalizer.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-web-css-stage.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-web-independent-entries.integration.test.ts
  - e2e/apps-generator-mode-compare.test.ts
---

# Web 单位转换必须保留框架所有权

## 症状

依赖升级合并后，main 的 Taro Web 生成器校验失败。原始 CI 产物证明，大量 rem 值放大为基线的 1.25 倍，且同一规则同时包含两个尺寸；小程序 CSS 与基线一致。

## 根因与纠正

生成阶段先执行用户的 px→rpx 配置，再按通用除数 32 将 rpx 转为 rem，导致 Taro H5 无法按实际 PostCSS 配套除数 40 处理。已经由框架处理的组件 CSS 与生成侧 CSS 也无法按相同值去重。

Web 流程调整为 calc、rpx 属性语义纠正、显式单位规则、真实框架 PostCSS、剩余 rpx 兜底。不能把整个 rpx 兼容能力关闭：Tailwind 的 inline 候选仍可能将 `text-[32rpx]` 生成为 `color:32rpx`，必须在单位改变前纠正为字号。runtime 候选的 length hint 与 inline 候选还原后可能重复，应保留最后的有效级联位置。

未处理作者 CSS 与生成 CSS 使用相同的显式单位流程；已处理的 Web 作者 CSS 标记为 processed，不能重复执行非幂等规则。小程序的作者处理路径保持原行为。

Vite 在实际 PostCSS 配置末尾安装带内部 Symbol 标识的 OnceExit 收尾插件；字符串配置目录先完整解析，保留 parser、syntax 等选项。Webpack 从当前模块的真实 loader 链确认收尾边界，在所有 PostCSS loader 执行后、css-loader 消费前兜底。仅凭同一个 owner 曾捕获过框架配置不能授权延后转换。

Webpack 的字符串、source map 和 metadata 必须同步：postcss-loader 会返回 `meta.ast.root`，css-loader 优先采用该 AST。只更新字符串而透传旧 AST，会让无单位插件场景重新输出旧 rpx。无变化时保持原数据身份，转换后同步新 AST 并保留其他 metadata。

## 验证

本地 macOS、Node 24.22.1，验证源码为 `24cac70bb584373121d0981a05b3c546a5c4c677` 上的未提交修复。

- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/generator-css.unit.test.ts test/bundlers/shared/generator-css/user-css.test.ts test/bundlers/generator-author-functions.test.ts test/bundlers/framework-web-units.test.ts test/bundlers/vite-framework-web-units.integration.test.ts test/bundlers/framework-postcss.unit.test.ts test/ci/workflows.test.ts --update=none`：7 文件、262 项通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/webpack-web-units.integration.test.ts test/bundlers/webpack-web-rpx-finalizer.test.ts --update=none`：2 文件、22 项通过，包含真实 Webpack、css-loader、postcss-loader、显式及外部配置、AST、source map 和释放会话。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/generated-web-units.test.ts test/unit-conversion.test.ts test/local-utility-order.test.ts test/rpx-candidate-compat.test.ts --update=none`：4 文件、28 项通过。
- `pnpm --filter @weapp-tailwindcss/postcss build`、`pnpm --filter weapp-tailwindcss build`、`pnpm architecture:check` 通过。

真实 Taro Web 产物需要逐项目更新并复验 static 基线。已审查的 Vue Vite 样例只有 `29rpx`、`31rpx`、`55rpx` 三个值从除以 32 改为除以 40，其余节点、顺序和选择器均不变。禁止接受原先整组放大和重复声明作为新基线。

Webpack 样例还纠正了作者 CSS 的源顺序：统一单位后，card/loading 规则在原导入位置保留完整声明，删除末尾重复规则和早期错误尺寸。React 样例的 `.issue-940-app-class` 现在遵守源码中位于 card 之后的覆盖关系，不能把这类差异描述成所有组合样式均与旧基线相同。

四个 Taro Web 项目使用 `CI=1 E2E_PROJECT_FILTER='^taro-(vite|webpack)-(react|vue3)-tailwindcss-v4$' E2E_GENERATOR_PLATFORM_FILTER='^web$' E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/apps-generator-mode-compare.test.ts -u` 定向重生成；审查后将 `-u` 改为 `--update=none` 复验，11 项通过。小程序和其他项目基线未更新。

### 紧凑模式必须单独同步

后续准确 head `e159fe9c497a3fd4c4b1e6ce1e1c72403738999f` 的普通 CI 在 Taro Webpack React `web-compact` 基线失败：实际产物已按框架除以 40 换算，紧凑模式基线仍保留除以 32 的旧值。此前仅筛选 `^web$`，遗漏了独立的 `web-compact` 目标。串行构建在首个断言处停止，其余三个紧凑模式不能因此视为已验通过。

本地 Node 24.22.1 与 CI Node 22.23.4 的该目标五份正规化 CSS 全量字节及 SHA256 相同，稳定复现总字节数 443880 → 443764。四个 Taro 紧凑模式限定重生成后的差异与普通 Web 已审查的单位、作者顺序和重复规则去重一致；选择器、文件集合和兼容性指标保留。四个目标总字节分别减少 116、80、153、6，不把这些变化解释成无语义的大小漂移。

定向命令沿用上述项目过滤，将平台过滤改为 `E2E_GENERATOR_PLATFORM_FILTER='^web-compact$'`；`-u` 生成后审查 CSS 与汇总报告，再使用 `--update=none` 复验，11 项通过。Web 单位流程变化必须同时盘点普通与紧凑模式，不能用一种模式的证据覆盖另一种模式。

### 生成缓存不是框架处理后的资产

后续 head `fd36ffb3d` 的 Android App 比基线多 2,004 字节。本地准确复现后发现，Vite 生成器在真实框架 PostCSS 之前把 `tracedCss` 登记成 processed。框架把来源 `theme.css` 合成到另一输出时，collector 不能用新资产覆盖原来源记录，最终注入又追加原始规则，将已经转换的 rem 覆盖回 rpx；原生 HTML preflight 选择器也绕过了 DCloud 的改写。

Web 生成阶段只保留 clean/traced/classSet 缓存和来源身份，processed 记录由实际框架资产采集建立。非 Web 仍保留原来的生成结果重放。删除同一分支内重复登记，不新增单位重算、文件名特判或后置源码读取。

新回归串联真实生成缓存、PostCSS、collector 与注入，模拟框架改名输出，分别验证默认和自定义单位比例、作者 `3rem` 与颜色、原始 `button::after` 改写成框架选择器。原生产源码下两种单位场景均在最终资产多出 `20rpx`，修复后只保留框架结果；未产生框架资产时也不把模块缓存注入无关输出。

修复后 Android 与 iOS 的正规化 App CSS 相同，主文件由 93,370 减至 86,336 字节，总 CSS 由 108,546 减至 101,512 字节。相对旧快照减少的 7 组规则均为重复的框架处理前 preflight；逐条映射到现有的 `uni-progress`、媒体组合、表单组合、`uni-textarea` 与按钮框架选择器，原声明、顺序和重要性保留，`appearance` 另保留框架的两项前缀。其余 AST 规则没有新增或丢失，`@property` 定义完整；其余减少来自重复定义与注释。原 HTML 选择器不作为 App 语义替代品保留。

先保留原失败产物和完整 AST 审计，再限定生成：

```sh
CI=1 E2E_PROJECT_FILTER='^uni-app-vite-tailwindcss-v4$' E2E_GENERATOR_PLATFORM_FILTER='^app-(android|ios)$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/apps-generator-mode-compare.test.ts -t 'builds retained demos' --update
```

生成后审查两份主 CSS 和对应报告。将项目过滤扩为 Uni v4 和四个 Taro v4、平台过滤扩为 `^(app-(android|ios)|web(-compact)?)$`，使用 `--update=none` 复验，12 个构建目标、11 项测试通过；其他 Web/compact 基线无变化。生成缓存、Web 单位、只含 CSS 与非微信重放回归共 8 文件 102 项通过；核心构建、架构检查、修改源码及测试的显式 ESLint、规则检查和 diff 检查通过。真实 App 构建产物只能验证 CSS 链路；不能替代 IDE、原生基座或设备验收。

### 快路径的生成就绪与资产就绪必须分开

`13520c530` 移除 Web 模块提前登记后，普通 CI 的 Generic Web 生产回归失败：post hook 以 processed 记录数量判断是否已生成，首次构建走进完整 bundle snapshot，读取禁止访问的 JS code getter。本地在准确源码重现。生成就绪现来自模块生成缓存或已登记的最终结果，只有最终资产登记才可用于重放；来源追踪仍要求完整 bundle 管线。

Generic Web finalizer 在结构条件允许后，先保留用户 matcher 选中的真实 CSS 资产及原文，再只收集这些资产；本阶段不传小程序输出 resolver、主样式注入规则或兼容转换，避免跨入口搬移与重复转换。marker 清理必须保留准确 `onUpdate` 的前后内容。来源别名和物理资产记录映射到同一真实资产时，以该资产的框架处理结果为准；需要重放的冲突仍回退。专用 `vite/web` 入口同样移除生成阶段的提前 processed 登记。

扩展到普通作者 CSS 时，Rollup 允许的裸 `Uint8Array` 暴露出读取边界问题：`.toString()` 会产生逗号分隔数字而非 UTF-8 CSS。采集和快路径统一复用真实资产的 UTF-8 解码，覆盖非 ASCII 内容、Buffer 和带 offset 的子数组。修复前裸数组及子数组两项准确失败，修复后包含这些场景的四文件263项通过；共享 collector/ownership/replay/cleanup/planning 五文件76项通过。

新增真实 Vite 多入口回归沿每个 entry 的 `imports` 与 `viteMetadata.importedCss` 闭包验收，覆盖普通、哈希及混合目录、主入口和专用入口、真实 PostCSS 选择器/数值改写、无关作者样式入口。混合目录加来源追踪准确复现：secondary 的消费图只剩作者规则。collector、CSS 复用和最终覆盖清理原先把根目录 CSS 推断成其他入口可用的全局样式。Web 默认不应用这种隐式覆盖，最终阶段继续消费框架显式 opt-in；Uni App WebView 现有策略保持有效。不能要求每个资产各自含完整 Tailwind，合法共享 CSS 仍由实际消费图证明。

此前只比较独立入口普通构建的旧/新输出时，两者均通过；这不能证明旧 watch 基线缺样式。上述 mixed/source-trace 红测证明的是具体覆盖边界，watch 的准确旧/新最终消费图仍需独立核实。宿主原始 watch 本轮在配置写入后约 14 秒才收到文件事件，未到最终静态断言；保留失败，不增加预算或改 polling，不将定向测试代替完整验收。


### 独立消费资产的 Uni Web 基线

本次禁止更新复验先通过四个 Taro v4 的 Web 与紧凑模式八个目标，随后 Uni Web 的独立组件 CSS 比准确 `13520c530` 基线增加 187 字节。普通 Web 六份 CSS 中五份逐字相同，只有 `assets/index.5.css` 从 1,937 增至 2,124 字节；差异为四条空 layer 声明、末尾空 layer 和 `--tw-content` 的 `@property` 注册。删除这些片段即可严格还原旧字节，六条作者规则的声明、顺序、important、层归属和来源注释均未改变，主 CSS 已有相同 layer 顺序与逐字相同的属性注册。

紧凑模式不能归类为空元数据：该资产从 1,923 增至 2,062 字节，增加 `*,::before,::after,::backdrop` 的 `--tw-content:''` 全局回退及同一属性注册。主 CSS 已有同样的选择器列表和该声明，但其 reset 块还包含其他变量。其余五份 CSS 逐字相同，作者规则保持不变；删除新增片段同样严格还原原字节。这些证据支持保留独立资产自己的生成结果，不证明所有动态加载时机均无差异，也不能代替真实 Web/HMR 验收。

审查后限定 Uni v4 和 `^(app-(android|ios)|web(-compact)?)$`，使用上述 `builds retained demos --update` 入口生成，只有 Web/compact 的两份 CSS、两份 README 和三份汇总报告改变，Android/iOS 无差异。以相同过滤移除 `-t` 并改为 `--update=none`，四个目标、11 项测试通过。相关核心回归先运行 13 文件 364 项；追加 marker 回退通知用例后，受影响的四文件 260 项通过，不把两次执行写成最终完整集合重跑。

## 适用边界

这些定向证据不代表本地全面验收完成。宿主文件事件服务恢复后，仍须重新执行全端预检、当前会话 computer use、verify 和全面入口。远端 CI 与部署也须绑定更新后的准确 SHA。

本轮旧 head 的 static 第二分片因累计构建超出 15 分钟而被平台取消，调整为六个完整分片，保留原时限、串行和测试集合。Expo iOS 另有双帧采集超过 10 秒的失败，原件证明进程和流已收尾，宿主存在强资源压力；不能把首次帧通过或清理完成算作双帧验收通过，也不据此放宽预算。

## 规则评估

不新增 AGENTS 规则。现有构建图、CSS 所有权、原始产物证据、基线审查和全端预检规则已经覆盖本次风险，用持久回归落实阶段边界。
