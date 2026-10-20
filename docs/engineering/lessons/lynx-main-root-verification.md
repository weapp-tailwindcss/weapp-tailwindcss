---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1307
baseline: 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
regressions:
  - packages/postcss/test/lynx-theme-safety.test.ts
  - packages/postcss/test/property-registration.test.ts
  - packages/postcss/test/web-author-values.test.ts
  - packages/postcss/test/cssVars.test.ts
  - packages/postcss-calc/test/declaration-filter.test.ts
  - packages/css-compat/test/legacy-registrations.test.ts
  - packages/postcss/test/css-rule-evidence.test.ts
  - packages/lynx/test/diagnostics-evidence.test.ts
  - packages/lynx/test/diagnostics-safety.test.ts
  - packages/lynx/test/diagnostics-origins.test.ts
  - packages/lynx/test/decoder-failure.test.ts
  - e2e/lynx-diagnostics-build.test.ts
  - e2e/lynx-theme-browser.test.ts
  - e2e/lynx-theme-overrides.test.ts
  - e2e/lynx-theme-root-encoding.test.ts
  - e2e/lynx-theme-overrides-static.test.ts
  - examples/react-lynx/src/compatibility/native-theme-overrides.test.ts
  - packages/weapp-tailwindcss/test/ci/architecture-contract.test.ts
  - website/scripts/check-lynx-contract.test.mjs
  - packages/postcss/test/webpack-generated-css-cleanup.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-web-cascade.integration.test.ts
  - website/tests/theme-panel-colors.spec.ts
  - website/tests/full-page-images.spec.ts
  - website/tests/full-page-snapshot.spec.ts
  - scripts/ci/demo-matrix/endpoint.test.mjs
  - scripts/ci/demo-matrix/taro-production.test.mjs
  - scripts/ci/demo-matrix/taro-production-gate.test.mjs
  - scripts/ci/demo-matrix/production-path.test.mjs
  - e2e/hosted-workflow-contract.test.ts
verification:
  - claim: CSS 兼容与 Lynx 诊断的定向根因回归通过
    kind: unit
    status: passed
    sha: 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
    environment: macOS arm64，Node 24.18.0、pnpm 12.14.0，包含本轮未提交修复，不能视为原 main 已修复
    command: CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none --coverage.enabled=false && CI=1 pnpm --filter @weapp-tailwindcss/lynx exec vitest run --update=none
  - claim: 正式 Rspeedy 产物、严格构建与三浏览器对照分别通过
    kind: integration
    status: passed
    sha: 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
    environment: macOS arm64，包含本轮未提交修复；实际 template、固定 decoder、后台 Chromium/Firefox/WebKit；不是原生运行结论
    command: CI=1 pnpm e2e:lynx --update=none && CI=1 pnpm e2e:lynx:theme
  - claim: 六份双语文档、必装依赖链和当前基线事实通过定向合同与网站构建
    kind: integration
    status: passed
    sha: 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
    environment: macOS arm64，包含本轮未提交修复；Node 最低范围是依赖合同，实际执行版本为 24.18.0
    command: CI=1 pnpm --filter @weapp-tailwindcss/website exec vitest run scripts/check-lynx-contract.test.mjs --update=none && CI=1 pnpm --filter @weapp-tailwindcss/website build
  - claim: 本轮全面验收与原生主题切换仍待完整预检和实际执行
    kind: native
    status: pending
    sha: ef98ee3cca3b31685b6983ca01b58899f86ce1b7
    environment: 当前独立工作树，本轮扩展预检、当前会话原生 Chrome computer use 和 verify 已通过
    reason: 第 24/57 阶段因网站缺少已审查的截图基线停止，后续 33 阶段未执行；新修改后必须重新预检，旧 Android/iOS 报告不计为本轮证据
  - claim: 第二轮全面验收的前 23 个阶段通过
    kind: integration
    status: passed
    sha: ef98ee3cca3b31685b6983ca01b58899f86ce1b7
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0，预检 874e8a80-2208-47a4-9c63-fa91500ed390
    command: pnpm e2e:demo:workflow:local --quality --extended --baseline-ref 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5 --preflight-report e2e/.artifacts/preflight/874e8a80-2208-47a4-9c63-fa91500ed390/report.json
  - claim: 新增主题覆盖取得同提交双端原生证据并完成完整归档重放
    kind: native
    status: passed
    sha: 7945477ff51015b6369a6fad69103bb6a0978883
    environment: GitHub hosted Android API 30 x86_64 与 iPhone 16 Pro iOS 18.5 arm64，实际 checkout 为 merge 23af851c7897cfcca540313b78aefcf88c61dad1；不是后续源码的运行证据
    command: pnpm exec tsx e2e/lynx/verify-baseline-archive.ts e2e/.artifacts/lynx-baselines/baseline-7gDywG
  - claim: 生产样式语义、报告拒绝与路径边界合同通过，Vite Harmony 运行失败单独保留
    kind: integration
    status: passed
    sha: d953733aeb9de0dbe3c205f048ecbe5a444f0ac6
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0，包含本轮未提交采集器和示例配置修复；普通浏览器不能代替 Harmony 设备
    command: CI=1 pnpm test:demo:matrix
---

# 最新 main 的 Lynx 三项 Issue 根因复验

## 症状

在 main `7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5` 上重新检查 #1307、#1308、#1309。普通局部主题覆盖已有保护，但不能据此称为根本修复：转义变量身份、空首声明、元素相关函数和注册属性仍可能越过静态化边界；旧诊断从输入与 warning 推导删除，不能证明实际 bundle；Node 声明没有覆盖必装核心依赖链。

## 根因与纠正

- **#1307**：Web/Lynx 共用 CSS token 身份与完整依赖分析。转义覆盖、注册指令（含大小写及转义）、CSS-wide keyword、空声明冲突和定义元素上的 `attr()` 均阻止跨元素静态化；删除已消费定义前检查仍然存在的依赖。长链正序、倒序和重复处理有回归。
- **#1308**：`beforeEncode` 捕获输入及构建图来源，`beforeEmit` 保存与本轮输入绑定的记录，`afterEmit` 从 compilation asset 取得实际发出字节。固定 decoder 随发布包携带源码身份、补丁、许可证和 gzip 资源。选择器分支、条件和声明分别比较；warning 仍保留、部分删除、多 cssId 歧义、未知日志和解码失败均分别记录。静默删除不能被没有 warning 掩盖；padding/gap 等展开没有独立等价 oracle 时报告 unknown。strict 只让确证且未显式忽略的业务删除失败。source map 或来源绑定不能证明时不猜原文件。
- **#1309**：Node 范围对齐必装核心依赖链，声明构建插件 peer。六份中英文页面区分最低要求、当前包与示例版本、历史设备基线、编码目标和运行时版本；合同从 metadata、实际解析依赖及既有 baseline 提取，新增漂移有 mutation 回归。

纠正一项调查中的错误推断：主变量存在时，`var(--base, var(--self))` 的未使用 fallback 在本轮三个浏览器都取主值红色；不能把内联红色称为已证实的可见错误。保存完整依赖属于保守策略；另一个真正使用自循环的夹具才取 use-site 蓝色 fallback。

## 验证

- 缺陷先补失败回归：转义 `attr` 与大写注册的三条管线合计 6 项失败；无日志的 decoder/解析失败合计 3 项失败。修复后通过，未降低支持预期或证据门槛。
- PostCSS：145 文件，1,533 通过、3 跳过；跳过项不计执行成功。Lynx 包：7 文件、49 项通过。文档合同：14 项通过；中英文网站生产构建通过。
- `CI=1 pnpm e2e:lynx --update=none`：示例 201 项、Lynx 静态 36 文件 734 项通过；包含真实构建、解码与旧 static evidence 比较。随后增加正式构建中的主题依赖保留夹具，最终以专用 `--update=none` 重验。
- 三浏览器：`CI=1 pnpm e2e:lynx:theme`，显式运行 Chromium、Firefox、WebKit，真实点击切换前、切换后和恢复后均与原始 CSS 及手工颜色参考比较。浏览器由本任务创建并在 finally 关闭。
- 新正式构建基线仅限定更新 `e2e/__snapshots__/lynx-diagnostics-build.test.ts.snap`；记录实际 CSS、业务删除和 unknown，正常 padding/gap 展开单独断言全部数值。第一批修复未改写 ReactLynx static evidence；补齐主题原生夹具后通过受管 static 更新器重新生成 118 项证据，能力结论不变。实际报告、原始输入、TASM、解码 CSS 与 bundle 留在 `e2e/.artifacts/lynx-diagnostics/`。
- 发布计划通过 `pnpm release status` 检查；第一批中文 intent 登记 PostCSS/Lynx，后续核心只读 facade 同步登记 weapp-tailwindcss，其他既有 intent 和依赖传播由 repoctl 决定，未执行发布。
- 普通 PR 的 Lynx Android 工作流增加正式构建及包回归；既有 Web 三浏览器矩阵逐引擎运行主题对照。默认静态入口只选择已安装的 Chromium，三引擎入口显式选择 all，非法引擎名称立即失败。

首轮扩展预检 `28395234-c0c3-49fd-bc2d-a5cff65941ec` 被无在线 Android 与缺 Gradle 路径阻断。通过 Android Studio 启动既有 Pixel 5 API 30（未重置），使用已安装 Gradle 和 SDK 后，新预检 `162e24ce-2bcd-4277-8c39-39bec683d284` 全部脚本、当前会话原生 Chrome 交互及 verify 通过。该报告只消费一次。

`pnpm e2e:demo:workflow:local --quality --extended --baseline-ref 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5 --preflight-report <本轮报告>`：第 1/57 阶段 root build 71/71 通过；第 2/57 全量单测为 954 文件通过、1 失败、5 跳过，10,105 项通过、1 失败、1 预期失败、44 跳过。失败是 Lynx 新增 PostCSS 直接依赖越过既有架构合同，后续 55 阶段未执行。失败报告归档在 `e2e/.artifacts/demo-e2e-memory/history/162e24ce-2bcd-4277-8c39-39bec683d284/`。

后续修复不改架构合同：Lynx 经已有核心入口读取 PostCSS 规则证据，解析实现仍由 PostCSS 所有。诊断补齐每条 reason/suggestion、绑定模板依赖版本及其证据限制；不能把模板类身份当作实际 encode hook 或执行二进制验证，缺宿主版本明确 unknown。任意属性 class 的转义冒号不再触发无关的状态切换建议。

新增独立主题门禁，保留真实 `:root` 定义，无局部镜像兜底。Tailwind hex、应用 hex、应用 oklch 三分支各采切换前、后与恢复；React 同次提交 class、唯一节点 ID 和 16/24/32px 标尺，宿主观察新状态后采 9 组几何、18 PNG（27 工件）。离线验证重新核对侧车身份、bundle、字节 hash、独立颜色、完整画布和标尺，不能由自报 passed 或两图相同放行。新报告强制门禁，旧报告保留历史展示；原 118 项 catalogHash 保持原口径，独立主题 contract 进入结论比较。

把 Tailwind 分支改为真正生成的 `bg-brand` 后，再次暴露实际产物缺陷：encoder 将 `:root, :host` 整组丢弃，而主题覆盖类和变量引用仍保留。真实 WASM 编码及独立解码的回归先失败，再由 PostCSS 的 Lynx AST 转换修复；仅对纯变量声明的双分支根组保留已有 `:root`，不把业务 `:host` 移植成根规则，不改变 Web 输出。生产夹具删除手写重复的 `--color-brand` 根定义，避免掩盖 `@theme` 生成链。生成层允许原始纯根组，实际 bundle 必须保留独立根定义；缺初始 token、局部镜像或错误颜色都有拒绝回归。限定 `pnpm e2e:lynx:static:update` 重生成并审查后，原 118 项结论仍不变。

第二批修复的严格回归：PostCSS 主题兼容 41 项、原生主题 static oracle 8 项、真实编码及样式产物门禁 64 项、原架构合同 10 项均通过。重建 PostCSS、核心及 Lynx 后，最终 `CI=1 pnpm e2e:lynx --update=none` 为示例 205 项和 E2E 39 文件 762 项通过；新 fixture 尚未取得原生设备成功证据。受影响源码 ESLint、`git diff --check`、`pnpm agents:check`（66 规则、346 文档、995 命令，0 错误）和 `pnpm release status` 通过。

第二轮预检 `874e8a80-2208-47a4-9c63-fa91500ed390` 的脚本、当前会话原生 Chrome computer use 和 verify 均通过，报告已被全面入口消费并随失败收尾，不能复用。基于 `ef98ee3cca3b31685b6983ca01b58899f86ce1b7` 的全面验收通过前 23/57 阶段：根构建 71/71（无缓存），全量单测 957 文件通过、5 文件跳过，10,123 项通过、1 项预期失败、44 项跳过；lint、类型、架构、双语文档、agents、release、tsd、扩展类型、stylelint、本机 native ABI、打包消费、CSS 属性与三浏览器对照、网站脚本、SEO、Worker 本地与 Wrangler dry-run 通过。仅验证 macOS arm64 的 native binding，未部署网站。

第 24 阶段网站三浏览器首个截图失败：`desktop-viewport-desktop-screenshot-1-chromium-darwin.png` 不存在。194 项通过、1 项失败、2,388 项未执行，随后 33 个工作流阶段未调度。仓库原本忽略全部网站 index 截图，新的独立工作树中没有黄金图；主 checkout 的 192 张本地 Chromium 图也没有完整的三浏览器范围和来源登记，不能直接冒充本轮基线。失败与内存报告归档于 `e2e/.artifacts/demo-e2e-memory/history/874e8a80-2208-47a4-9c63-fa91500ed390/`。缺失截图须单独采集候选、审查后再以禁止更新模式验证，不更改平台后缀或 5 像素门槛。

同一 head 的 PR #1314 Android run `39438903272`、job `118683514470` 完成了设备采集，但在 `report-validation` 被新增主题 oracle 拒绝，尚未进入旧报告比较。真实 CSS 同时包含 `oklch(63% 0.2 40)` 和 `rgb(230, 80, 0)`；旧 oracle 只接受 `.2` 写法，本机测试的解析器又会先缩短数字，因而掩盖了差异。新增回归直接保留原始 `RuleEvidence`，先复现 4 项失败，包括无完整三个分量的字符串被错误接受。修正为核对三个独立数字；百分号本身可分隔 token，同时覆盖真实 decoder 的相邻百分比/数字形式。错误颜色、透明度和不完整语法继续拒绝。实际生成 CSS 与 bundle 的门禁前移到设备编译之前，保留报告验证时的再次核验。

该修复的独立三浏览器颜色 token 对照、真实 Rspeedy 构建与主题 oracle 共 52 项通过；最终 `CI=1 pnpm e2e:lynx --update=none` 为示例 205 项与 E2E 39 文件 775 项通过。定向样式产物及像素负向回归另有 92 项通过。受影响 ESLint、agents（66 规则、346 文档、997 命令，0 错误）和 diff check 通过。仅调整测试证据核对与编排，不改变应用夹具、颜色目标、像素阈值或 static 能力结论，因此本批不重写样式基线，也不新增公开包发布 intent。新 head 的原生执行和全面验收仍须重新运行。

网站截图先写入独立候选目录，没有导入黄金图。缩略审查并核对原图发现 `/ui`、`/llms` 深色模式的面板浅灰、文本近白，明显缺少对比；已停止候选采集并有界回收本轮浏览器和 Worker，不能把该缺陷固化为正常基线。它与“缺图”的环境准备问题分开追踪，修复并补充计算样式回归后才可重新采集和审查。

### 网站生产级联回归

网站真实主题按钮回归先在三浏览器失败。Webpack 适配器原来在 `SUMMARIZE`（1000）阶段把 loader 注册的原始 CSS 重新插入已经过框架 PostCSS 和生产压缩的资产；清理器对混合 `@supports` 采用整组判定，导致部分基础 utility 残留在 dark 规则之后。清理改为按叶子处理并保留业务规则、嵌套业务层；Web 生成改在 `OPTIMIZE`（100），成功消费 loader 生成结果时直接保留当前框架资产，不用原始 registry 内容覆盖已处理选择器、声明和 URL。已处理资产也不再从原始 registry 补回规则。

真实 Webpack + Docusaurus loader、cssnano、clean-css 的生产夹具进一步复现：即使插件不再后置写入，clean-css 的 `mergeMedia` 仍会跨越 dark 渐变声明合并 `@supports`，使 `from-sky-200/85` 重新胜出。网站明确配置相同双压缩器，仅关闭该条件块移动优化；保留 JS 压缩和其余 CSS 压缩。压缩器身份缺失或重复立即失败，避免升级后静默失去保护。

验证使用独立颜色参考，检查面板背景、渐变变量和 SVG fill 的 light → dark → light；生产优化器输出必须与最终资产逐字相同，业务 `.site-panel` 和真实 HTML 来源的高度类必须保留。真实 watch 还检查来源替换、glob 下新建/删除文件、主题值修改与恢复，分别核对移除旧类、生成新类和浏览器实际颜色/尺寸。文件系统的额外目录通知不作为本轮编辑的构建证据；临时目录按实际路径身份比较。后台浏览器、watcher 和 compiler 均独立收尾。

本批 `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/webpack-web-cascade.integration.test.ts --update=none` 两项真实生产/watch 回归通过；既有 Webpack 子集 183 项通过，PostCSS 完整套件 146 文件、1,545 项通过、3 项跳过。双语网站 `CI=1 pnpm --filter @weapp-tailwindcss/website build` 和 typecheck 通过；受管本地 Worker 上 `theme-panel-colors.spec.ts` 的三浏览器共 6 项真实主题切换通过，像素通道差为零。此处的跳过项不算通过，截图候选尚未作为黄金基线接纳，57 阶段全面验收尚未重跑。网站产物已重新生成，其他 demo fixture 与 static 结论没有修改。

### 双端原生基线审查

head `7945477ff51015b6369a6fad69103bb6a0978883` 的 Lynx run `39445561718` 实际 checkout 为 merge `23af851c7897cfcca540313b78aefcf88c61dad1`。Android job `118706750255` 与 iOS job `118706750273` 均通过运行时采集和正式证据校验，最后因历史报告缺少新增 `themeOverrides` 字段而在结论比较失败。118 个原有案例的状态、原因、失败阶段、checkpoint 与候选结论没有变化：Android 54 支持、64 预声明限制；iOS 53 支持、65 预声明限制。没有修改支持预期或删除比较门禁。

完整下载并核对原始 ZIP：Android artifact `12277146582` SHA-256 为 `e60d4a27c583ee420b681cb5b3ee325632698a1fea5b7f9e7af7ea7ac2dea238`；iOS artifact `12276299248` 为 `f58ca64abdcac5ac9f9c74e23ed130af94f4616f0d943320b5853256d1aa1716`。两端分别执行正式 `readNativeReport`，从实际 bundle、宿主侧车、原始 PNG 与几何重算验证；人工审查三分支的切换前、后和恢复画面及 16/24/32px 标尺。主题证据各有 9 帧、27 份工件。

使用正式 `pnpm e2e:lynx:update` 同时更新双端历史报告和示例基线；原始运行目录（含 Android APK/AAR）先归档，再从副本重验。`baseline-7gDywG/archive-index.json` 登记 396 个原始文件，整体重放通过，runId 分别为 Android `f9032cb8-60b6-4f35-b7fb-11f7bba12ebf`、iOS `1e0d15ac-4ab2-451d-ac0b-2d646ac93ae8`。同步六份双语文档的基线时间与 run；归档和旧 CI 不替代后续 head 的实际执行。

刷新基线后的严格回归还发现 Web 阶段调整造成正式 Rspeedy 诊断缺少 `style.css` 来源；该断言继续阻断，不能用成功解码或历史原生运行掩盖。网站候选采集在同步文档前主动取消，已确认关闭其独占 Worker 进程组；不完整候选只保留失败记录，不安装为黄金图。

### 框架 CSS 来源映射与本轮缓存

后续严格回归证实，保留框架 CSS 的文本还不够：把它包装成新的 `ConcatSource(string)` 会删除已有 map。Web 在 100 阶段处理后，Lynx encoder 在 2500 阶段消费资产；不能通过恢复旧的 1000 阶段借用 500 阶段产生的旧 map 掩盖来源缺失。修复使用原始字符串坐标登记元数据区间，由 Webpack `ReplaceSource` 精确删除，正文及其来源仍由框架 loader 拥有。

独立回归进一步复现两个分支：已处理资产会丢 map；生成注册表消费在相同 CSS、不同来源的再次编译中会复用上一轮 map。两条框架产物保留路径现在每轮消费当前 `originalSource`，不缓存其 Source 对象。LF/CRLF、多模块和 Windows 风格来源身份均检查删除后的业务 token；真实 Docusaurus loader 与双压缩器夹具还对比插件前后的 `.site-panel` 来源位置，不能仅靠 map 文件存在放行。该修复保留上游已有映射，不声明已修正生成 loader 本身的原始行号精度。

限定重生成诊断 static 快照，审查到的两处差异仅为真实 `:root` 回到原始位置、位于 `.theme-dark` 之前；业务诊断结论未变。新 Webpack 回归 191 项通过，同文本换来源的两个失败已先记录后修复。CI 另有两处夹具边界：Windows 随机端口的相邻端口可能禁绑，先有限预订可绑定端口对再验证真实 Vite fallback；Iconify 稳定后回滚污染单测独立调用真实语义接受器，不由 100ms 文件 I/O 调度决定是否到达目标分支。14 项端口回归和 150 项 Iconify/等待回归通过，生产超时、检查顺序与像素门槛未改。

### 网站黄金图的受管来源

为补齐第 24 阶段缺图，引入独立的采集、审查、安装和验证入口。候选从干净已提交工作树和实际生产构建生成，记录三引擎版本；每项通过 Playwright 原生 expected 附件绑定实际 PNG，不复制匿名命名算法。桌面三引擎与移动 Chromium 的 1,204 张截图必须首次成功，移动 Firefox/WebKit 的 602 项仍为原有显式跳过。报告、PNG 集合和字节、环境、截图合同及审查证据共同校验；候选失败不生成可安装清单，未知目录和链接均拒绝写入。

管线回归 29 项通过，包含真实三浏览器、Firefox 超高页面分片、missing 采集和 none 严格比较；改变真实颜色后三引擎比较失败且黄金字节未变。采集入口必须先生产构建，再核对源码身份并登记产物，不能把旧 build 并列记为新 HEAD 来源；构建失败、源码变化和不干净工作树有独立拒绝回归。安装先检查登记冲突，目标原子重命名成功后才发布登记，重命名失败不留可用黄金图或登记。三浏览器真实管线接入独立 CI job 和本地 `e2e:local`，普通单测不依赖 Firefox/WebKit；类型、ESLint 与规则检查通过。这些合成图只验证管线；网站完整候选仍须独立采集、实际视觉审查、安装和禁止更新复验。黄金来源的历史 HEAD 不要求等于未来 HEAD，否则会失去回归意义；渲染环境或截图合同变化则明确阻断，不能静默复用。

### 开发服务端口的实际绑定边界

后续 Windows Node 24 在 head `d953733aeb9de0dbe3c205f048ecbe5a444f0ac6` 的 demo-matrix 合同仍失败：run `39463154054`、job `118767484824` 中，预订器持有 `52075`，曾预订后释放的 `52076` 随后被 Vite 绑定时返回 `EACCES`。三处地址均为 `127.0.0.1`，没有 IPv4/IPv6 差异证据；日志也不能确定 Windows 拒绝绑定的具体宿主原因。原端口对方案不能消除释放到重新绑定之间的竞态，撤回其可靠性判断，不通过重跑碰运气放行。

先用受控监听器确定性拿走已释放后继端口，证明预订交接仍会失败；再以真实 Vite 回归记录旧绑定策略在后继 `EACCES` 时失败。修复让真实服务在 `bind` 时使用端口 `0`，仅持有错误服务器自己的端口；独立注入后继 `EADDRINUSE`/`EACCES`，验证消费完整 Local 公告、保留 hash route、排除错误服务器并核对实际正文。端口回退公告另用日志夹具验证，无 Local 的退出仍原样失败。测试不宣称重新验证 Vite 上游自增端口算法，不改变生产 endpoint、错误门禁、超时或重试预算。

本地 `CI=1 pnpm test:demo:matrix` 为 43 文件、302 项全部通过，受影响 ESLint 与 diff check 通过。红例、正式结果和原始 CI 日志分别保存于 `.tmp/endpoint-fix-red.log`、`.tmp/endpoint-fix-formal.log`、`.tmp/ci-1314-d953-endpoint.log`；此结果不能替代新 head 的 Windows CI。

### 整页截图的图片就绪与拒绝记录

head `d953733aeb9de0dbe3c205f048ecbe5a444f0ac6` 的首批完整候选执行为 1,204 项首次通过、602 项既有移动 Firefox/WebKit 跳过，但审查拒绝安装。Firefox 的 `/docs/showcase` 首次导航有 49 图，其中 39 图尚未加载；逐图真实滚动后全部可以解码。原采集器没有触发屏外 lazy 请求，整页图片可能只是 alt 或占位，不能由采集状态 passed 推定页面已经完整。

先固化屏外图片 `naturalWidth` 为零的失败回归，再让原生截图与 Firefox 分片共用图片准备：固定真实节点身份，真实滚动，等待 load/error 后 decode，并核对像素；坏图明确失败。采集沿用共享截止时间，独立短预算仅供取消监听与恢复滚动，迟到结果不得再次滚动或请求下一图。结束核对 window 与嵌套横纵滚动位置，不覆盖 iframe/shadow 内容。缺基线负例置于临时子配置，固定 `updateSnapshots: none` 并核对没有生成黄金图。

本轮未提交修复下，`CI=1 pnpm --filter @weapp-tailwindcss/website e2e tests/full-page-capture.spec.ts tests/full-page-snapshot.spec.ts tests/full-page-images.spec.ts --update-snapshots=none` 为三浏览器 42 项通过；typecheck 与受影响 ESLint 通过。真实生产 Worker 的 Firefox 定向复验为 49/49 图加载、有有效像素、无请求失败且原滚动恢复，Worker 和浏览器受管收尾。原候选及拒绝原因保留于 `.tmp/website-visual-d953733ae/review-rejected.json`；新截图合同已变化，必须重新从干净提交完整采集，不能安装旧候选。

### 循环 GIF 的首帧截图合同

新候选 `a10ef71036e9ea923da4bc79b046861c34fde81d` 审查发现首页微小差异来自 `gstar-tag-twinkle.gif`：40×40、107 帧、5,010ms、无限循环。Playwright 的 CSS 动画禁用不能冻结此媒体时钟。两帧独立 HTTP 夹具先复现红色首帧在 400ms 后变成蓝色；不能用单次采集成功或增加像素容忍掩盖相位差异。

在第 498 项受管取消本轮采集，保留 `.tmp/website-visual-a10ef71/review-rejected.json`、失败回执和首页对照。capture/Playwright 进程已结束，没有生成 manifest 或安装黄金图。仅完成 Chromium desktop 前 120 页及另 13 页的缩略粗筛；粗筛没有证明小字、逐像素或交互。

私有视觉 context 对显式 `.gif` 地址的真实成功响应使用显式 sharp 版本提取第 0 帧，响应仍须由 MIME 或字节签名确认为 GIF；保留独立颜色、尺寸和资源身份，报告绑定原字节与首帧 PNG 摘要，环境登记 sharp/libvips。其他图片保持原始请求，并检查最终成功字节；没有经过规范化的 GIF 明确阻断，不能漏检为通过。HTTP 失败仍可观察，解码错误原样失败。HTTP 缓存随 Playwright 路由禁用，功能回归继续使用原夹具；此合同不验证动画时序或 data/blob 图片。Firefox 独立 browser 生命周期继续保留。新合同变化后必须从干净提交重新完整采集、审查并禁止更新比较。

三浏览器真实回归还纠正了重定向假设：Playwright 不会再次路由最终重定向请求，WebKit 不接受 `route.fulfill` 的 302；不能自动跟随后把跨源 200 伪装回原地址。静态图片重定向走真实网络且保持请求链；GIF 地址返回重定向、无扩展名 GIF 或重定向最终 GIF 都明确拒绝视觉候选。异步字节检查必须等待并保留错误；执行、响应释放、路由收尾、附件与解码同时失败时也不得覆盖原始错误。外部共享收尾实现纳入截图合同 hash。

本轮未提交修复下，三浏览器 `visual-images.spec.ts` 与 `visual-context.spec.ts` 共 24 项通过（零重试、后台运行）；基线与入口合同 3 文件、28 项通过，真实三浏览器 missing 采集、审查安装、none 比较及错像素拒绝管线 1 项通过。typecheck、受影响 ESLint 与仅新增 sharp importer 的 frozen/offline 安装通过。这些结果验证夹具与管线，尚没有可安装的网站完整候选。

### Taro 生产样式与 Harmony 平台适配边界

head `d953733aeb9de0dbe3c205f048ecbe5a444f0ac6` 的 React/Vue Webpack 矩阵在三个宿主出现同类 H5/Harmony static 差异。Web 在框架优化前完成生成后，压缩产物不再被原始 registry 补回重复的 hex/rgb、数字前导零及原始 `4px`。React issue-998 的 `@theme --spacing:4px` 仍经框架 pxtransform 变为 H5 `0.1rem`、Harmony `0.2rem`；不能仅因快照少了原始表示就恢复后置覆盖。真实 H5 首页的绝对尺寸/颜色及 issue-998 路由的 375/750/1200 宽度、根字号和 padding 曾分别通过三浏览器定向生产探针；这些定向日志不代表整个页面的样式覆盖。

进一步消费真实 Harmony Webpack 生产页，先复现 `mt-2` 预期 10px、实际 0 的失败。`@tarojs/components@4.2.1/global.css` 由框架入口注入未分层 `*{margin:0;padding:0}`；五个示例选择 generator Web 输出，却只在 `isWeb`（H5）时启用 `webCompat`，utilities layer 因而被覆盖。修复用实际 generator target 同步选择兼容转换，保留四个示例的 `WEAPP_TW_WEB_COMPAT=0` 显式开关、原有 designWidth 和公共平台身份。没有旧产物实渲染对照，不把此问题归类为本 PR 新增或已证明的既有缺陷。

新增生产门禁直接服务本轮归档的 HTML/CSS/JS，复制前清理同任务旧 production，防止残留 chunk 伪装新构建。五个 H5 与两个 Webpack Harmony 首页检查六个探针的可见性/面积、独立根字号、`.25rem` 绝对尺寸和颜色字符串的 canvas 栅格结果，保存真实页面截图；canvas 不是节点实际截图像素。相关脚本/样式加载错误阻断；finally 只关闭自己的后台浏览器与服务。报告门禁再次拒绝缺证、错间距、部分高度丢失、隐藏探针、错误颜色及篡改参考。POSIX/Windows 归属、异盘、兄弟目录、编码路径与 realpath 链接边界分别核对。此入口只覆盖首页，不宣称覆盖 issue-998 路由或 Harmony 设备。

限定更新七份 static：两个 Webpack H5、两个 Webpack Harmony、三个 Vite Harmony；H5 去除重复颜色表示，Harmony 随显式兼容转换变为 rgb/rgba 并展开 layer。三个 Vite H5 的 static 未变。更新命令为 `pnpm e2e:demo:matrix <对应项目:目标> --build-only --update`，审查后以 `CI=1` 不带更新参数重跑。首次实效失败在 `.tmp/taro-harmony-production-red.log`，报告缺证的红例在 `.tmp/taro-production-gate-red.log`，完整定向结果在 `.tmp/taro-production-strict/`；本批基于 d953 加未提交修复，不能冒充该提交的原始结果。

十个目标的首轮严格复验为 9 通过、issue-951 H5 一项采集失败：节点可见早于 Stencil 初始化，未声明高度的探针仍返回合法 `auto`。采集器改为等待真实 custom element 定义、首次渲染与样式帧；只对三个高度 utility 要求数值，并同时核对实际 box height，其余探针仍要求正面积和可见。补组件延迟注册夹具后，issue-951 的生产、initial/replace/add/restore/refresh 全通过；其余六份生产归档也用最终几何门禁重验通过。五个 H5 均完成完整 HMR，五个 Harmony 完成禁止更新的构建/static，其中仅两个 Webpack Harmony 有本轮浏览器实效成功证据。矩阵合同最终为 46 文件、313 项通过，工作流合同 7 项通过；ESLint、diff 和 agents 通过。

额外浏览器诊断发现三个 Vite Harmony 生产页空白，登记为**已复现运行失败**，不改判 unsupported。`@tarojs/plugin-platform-harmony-hybrid@4.2.1` 的 setup 只注册 `modifyWebpackConfig`，遗漏 Vite 的组件包装/注册、Harmony API/router alias 和 rem HTML 策略；React 主示例的实际 bundle 把 Stencil View class 作为 React 函数组件调用，报 `Class constructor cannot be invoked without 'new'`。Vue 缺少 `initVue3Components`，但其空页唯一根因尚未形成完整执行对照。三个目标保留原定 `webview-build` 的构建/样式产物验收；新增浏览器合同不把它们计为运行通过。完整适配需单独实现平台 Vite 生命周期，不能只加组件 alias 掩盖其余缺口。持久诊断入口为 `CI=1 pnpm e2e:demo:matrix <Vite项目:harmony-hybrid> --build-only --production-browser`；实际页面、失败截图和资源记录在 `.tmp/taro-harmony-compat-update/`。

上述持久入口已对 `taro-vite-react-tailwindcss-v4:harmony-hybrid` 再次确定性返回失败，完整构建、加载图和失败截图在 `.tmp/taro-vite-harmony-forced/`。它是新的复现配置，不是对同配置基础设施失败的碰运气重跑；没有安装不完整的上游 alias 补丁，也没有降低既有覆盖范围或改动设备运行结论。

### d953 提交的双端复验

Lynx run `39463154292` 的 Android job `118768978411` 与 iOS job `118768978328` 均成功，head 准确为 `d953733aeb9de0dbe3c205f048ecbe5a444f0ac6`。完整下载并核验 Android artifact `12283799089`（SHA-256 `fb96dc0d80eff6c3d55decbb32de5499f992c6345dc16fe3ca8809eec82c40ac`）与 iOS artifact `12286087716`（`3288b020adf985f27a044e7154d44c0bc4d69968e87425a62aaf8d56feba58ea`），分别以正式 `readNativeReport` 从实际 bundle、PNG、宿主侧车和几何离线重算通过。

Android runId `9b6ce1aa-3c37-47b4-a466-1a372addb7f0` 为 118 案例（54 支持、64 预声明限制），iOS runId `f81826af-85b7-4b1c-82ce-e6cbfb044375` 为 118 案例（53 支持、65 预声明限制），两端各 9 主题帧。原始 ZIP 和重算日志在 `.tmp/ci-1314-d953/`。这仅是该提交的原生证据，不替代后续 head；Expo iOS job `118768064986` 因 hosted runner 容量取消，runner_id 为 0、steps 为空，属于未执行，无复测授权，未重跑。

### a10 性能门禁与有界诊断

head `a10ef71036e9ea923da4bc79b046861c34fde81d` 的 Benchmark run `39479576075`、Webpack React job `118825119029` 实际 checkout 为 merge `c0140e15ba90e422b51648a12df8c46786c9d0a9`，基线准确为 `7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5`。`mp-weixin` 构建中位数由 16,125.86ms 增至 17,097.05ms（+6.02%、+971.19ms）；满足原有统计条件，门禁失败保留，未调度重跑。原始三次样本分别为 `[15979.89,16125.86,16548.82]` 与 `[16652.45,17097.05,17670.43]`。插件、CSS 任务与等待阶段也有增量，但包含并行耗时，不能相加归因。

在独立、干净的 a10 工作树完成一次相同目标的本地双侧定向对照：`pnpm perf:guard -- --baseline-ref 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5 --build-runs 3 --hmr-runs 3 --only demo-taro-webpack-react-tailwindcss-v4__mp-weixin --timeout 180000 --poll-interval 30 --work-root <独立临时目录> --result-dir <本轮结果目录>`。实际 Node 24.18.0、pnpm 12.14.0、macOS arm64；两侧 frozen install 与 36 包构建完成后再测量。构建样本 `[9981.22,8746.96,8706.60]` 对 `[11125.30,9002.82,9478.06]`，中位数增加 8.36%；插件中位数增加 1.82%，HMR P95 增加 5.91%。本地退出 0 仅表示未同时达到 5%、严格多数及 p≤0.05 的现有联合条件，不能推翻 CI 失败或写成没有变慢。首次准备把临时目录放在源码内部，被复制自目录检查拒绝，尚未采样；修正为独立临时目录后才得到以上结果。没有扩大采样或修改阈值。

随后两侧各执行一次带 `--cpu-prof` 的真实 Taro 构建，主 isolate 与 worker 共各 21 份 profile，均保留；此命令不同于 guard，不作为追加性能通过样本。主 profile 时长分别 10,695.67ms 与 10,454.79ms，两侧主要样本均为模块读取、文件系统、CJS 编译、GC、扫描与 PostCSS。新递归清理函数没有 self 样本，既不能证明其未执行，也不能证明其解释远端增量。源码及实际 dist 的只读加载图核对还排除了 mini 意外加载 decoder/WASM 的假设：三个 Webpack loader 闭包逐文件相同，Webpack 闭包 21 文件只增加 3,292 字节，外部依赖不变；新 selector parser 由基线 transform 已经加载，未出现第二版本。没有热点证据支持针对这些路径提交性能补丁。

原始本地报告、样本与 CPU 汇总保存在 `.tmp/benchmark-a10-local-result/`，guard 日志为 `.tmp/benchmark-a10-local2.log`。宿主有其他 IDE/虚拟机及系统负载，但未终止无关进程，也不据此自动归因为环境噪声。当前性能根因保持 **unknown**，失败门禁仍需后续定位；网站截图采集与性能测量分开执行。

### 作者注册属性的序列化边界与必需 peer

再次核对 #1307 验收时发现有效反例：`@property --color-brand { syntax: "*"; inherits: false; } :root { --color-brand: #f00; } .probe { color: var(--color-brand, #00f); }`。Web 兼容步骤先删除注册，没有初值可生成全局 fallback，随后将根声明误当稳定普通变量；Web → Lynx 最终只剩红色常量。原始 CSS 中非根元素应使用蓝色 fallback。即使只给分析器传递注册名称，序列化后仍会丢失不继承及语法校验，不能根本修复。

修复仅对 Tailwind 内部 `--tw-*` 的注册默认值做既有降级，作者注册保持在 CSS 中，后续安全分析继续保留其 `var()` 依赖。没有以全局 reset 模拟任意注册。针对无初值 `syntax:"*"`、类型初值和长度 token，Web、Lynx、组合三入口先得到 6 项失败，再通过回归；三浏览器实际颜色也先得到 3 项失败，修复后在原始、Web、Lynx、组合输出上分别验证蓝 → 绿 → 蓝。此处 Lynx 输出由浏览器消费，仅证明转换保守性，**不证明 Lynx 原生支持作者注册属性**。六份双语说明、Web 兼容选项和中文 intent 同步收紧该边界。

本批基于 `02ea6af31987ecd9ec2775f10f74c60eec94d812` 加上述未提交修复：PostCSS 为 146 文件、1,555 项通过、3 项既有跳过；三浏览器定向 9 项通过。`CI=1 pnpm e2e:lynx --update=none` 的示例 205 项与 E2E 39 文件、776 项全部通过，实际 Rspeedy 产物及既有 static 没有差异，因此没有重写 static。红、绿与正式日志分别保存在 `.tmp/property-registration-*.log`。发现反例时通过本任务 capture 的 SIGINT 收尾，在第 126/1,806 声明处停止候选 `02ea6af31`；保留失败回执与拒绝记录，未生成 manifest、未安装黄金图，未遗留本轮浏览器/Worker。

#1309 的依赖合同还遗漏非 optional 的 `peerDependencies`。新增深层 dependency、必需 peer、同名 optional 排除与循环图回归，必需 peer 红例先证明旧检查器漏报，再把已解析的必需 peer 纳入递归；当前真实安装图合同仍通过，没有据此提高 Node 门槛。文档检查共 16 项通过，原始结果为 `.tmp/lynx-engines-peers-{red,green}.log`。这修正未来依赖变化的门禁，不代表原安装图已存在更高 Node 要求。

#1308 补齐真实生产双入口：各入口使用不同 CSS 来源，独立观察器在公开 `beforeEmit` hook 归档实际编码 CSS，再分别核对报告的输入摘要、最终 bundle 摘要、独立 decoder CSS 摘要与业务拒绝来源。两个摘要及控制规则必须不同，另一入口的业务诊断不得串入；生产压缩合并后的模糊 selector 仍保留 unknown。首次夹具错误地复制仅开发模式存在的 `.lynx` 调试文件而失败，已改为实际 hook 证据，不以缺文件后静默回退。最终生产双入口及开发默认/严格三项全部通过，日志在 `.tmp/lynx-diagnostics-production2.log`，逐入口原始输入和 bundle 在 `e2e/.artifacts/lynx-diagnostics/production/default/`。此项没有新增 static 场景或更新既有快照，也不证明原生运行支持。

### 70661ce91 网站黄金图的独立采集

在干净的 `70661ce91db2791377d42fda8f124535337a439e` 上重新生产构建并完成整站采集：1,204 项首次通过，602 项按既有移动 Firefox/WebKit 规则跳过，0 unexpected、0 flaky。环境为 macOS arm64、Node 24.18.0、Playwright 1.64.1，Chromium 156.0.8078.4、Firefox 157.0、WebKit 27.2，sharp 0.35.5 / libvips 8.18.7。锁文件、截图合同、实际 build 与 PNG 摘要绑定在 `website/tests/visual-baselines/darwin.json`，13 份实际查看的代表性页面/切片登记在相邻审查记录；检查覆盖首页、UI、LLM、Lynx 长文、showcase、移动长页和真实图片，不宣称逐字审查全部页面。

候选 `.tmp/website-visual-70661ce91/` 已通过正式 `e2e:visual install` 与 `e2e:visual verify`。这仅登记历史源码的视觉基线，后续 HEAD 必须由 `e2e:local` 真正禁止更新比较；不代表作者注册属性、旧 WebView 或原生能力通过。后续发现的非网站注册属性反例单独补红回归与修复，不撤销已完成且来源完整的历史基线。

### 注册描述符与默认值合同的再次纠正

`70661ce91db2791377d42fda8f124535337a439e` 仍不能称为 #1307 的根本修复。三浏览器真实反例证明：普通变量求值把 `initial-value: var(--color-base)` 改成具体颜色后，会把原本无效的注册变有效，红色继承变成蓝色初值；`prefix(tw)` 的公开主题也可使用 `--tw-color-brand`，前缀不能证明 Tailwind 内部归属。更早“非 `--tw-*` 作者注册已保护”的结论只覆盖那一批测试，不能延伸到全部作者注册。

本轮保留全部注册和描述符，Web/Lynx 写入检查完整注册祖先链，引用收集继续保留描述符所需的根变量。calc 的通用声明过滤回调由兼容调用方明确排除注册上下文。默认值兼容按名字与完整签名匹配，不是来源证明：直接描述符、真实初值是否缺省、继承、重复、未知与 important 均单独检查；同名条件或冲突注册否决默认合成。原有 127 项默认映射的形状与人工 legacy 值不变，注册签名则由实际 Tailwind 4.3.3 编译全部 1,205 个 witness 的 127 项注册双向验证，不再依赖未绑定 submodule 或只比较名字的正则。

额外失败回归证明：legacy layer 会把非法嵌套在注册内的描述符提升成有效注册，修复由 layer 内核保护注册原子边界；十六进制转义按完整前导 token 识别。合成默认块原来插到 import 前，三浏览器均拒绝该导入；现在 block 位于前导指令后，保留层时先登记独立最低默认层，并检查名字冲突与重复处理幂等。浏览器同时验证忽略注册后的默认块，避免只凭现代浏览器的原生注册支持掩盖缺失 fallback。未展开 import 内部的 layer 不能视为同一合并作用域的完整降级，仍由调用方先展开。

基于 `4186fffc5` 加本轮未提交修复，先得到注册合同 35 项失败、三浏览器各 1 项失败；layer 核心 4 项红例中一项是 PostCSS 本身拒绝前导转义的夹具解析，已纠正为可解析的等价转义，另外 3 项证明实际转换错误。最终 PostCSS 147 文件、1,611 项通过、3 项既有跳过；CSS layer 内核 135 项通过；calc 217 项通过、3 项既有跳过；核心 Web 两文件 6 项与双语文档合同 16 项通过。三浏览器定向共 12 项通过，包括无效初值、公开前缀、非法 layer 描述符、状态恢复、import 与保留层。包构建、calc 类型和 layer 类型通过；初次 layer 类型错误已按 PostCSS 的 Root/Document 父节点联合类型修正。

仅限定更新 `packages/postcss/test/__snapshots__/web-css-compat.test.ts.snap`：保留注册，未知签名不再臆造默认值；审查后完整包以 `CI=1`、`--update=none` 重验。最终重建依赖后 `CI=1 pnpm e2e:lynx --update=none` 为示例 205 项、E2E 39 文件 778 项全部通过，包含正式开发/生产双入口、真实 encoder/decoder 和既有 static 比较；既有 static 没有差异，未重写原生基线。ESLint、`git diff --check`、agents（67 规则、346 文档、1,003 命令，0 错误）和发布 intent 计划通过。原始红绿日志位于 `.tmp/property-{descriptor,layer,import,registration}-*`。这些结果证明转换和测试 oracle 的边界，不证明旧 WebView 或 Lynx 原生注册语义；全面验收仍须在提交后重新预检。未新增 AGENTS 规则，优先用可执行回归固定现有边界。

## 适用边界

来源修复后的 `CI=1 pnpm e2e:lynx --update=none` 为示例 205 项、E2E 39 文件 775 项全部通过；`style.css` 来源与 static 基线在禁止更新模式下通过。核心类型、架构、源码行数和文档 14 项合同也通过。

当前结果仍为 **partial**。本轮全面验收前须重新执行扩展预检、真实当前会话 computer use 和 verify。双端主题覆盖已有上述提交的运行证据；新 head 原生执行仍待通过。RN 的实际 served bundle/HMR 链、Image/ScrollView、RN/Lynx 注册夹具、独立转换 oracle 与尚缺的六类 Web variant，不能由上述单测或静态合同写成全面有效。跨独立 stylesheet 与运行时 inline 的不可见覆盖不在当前 AST 静态安全保证内。原生报告与 served bundle 的既有缺口继续单独登记。

### 61d8cb1f2 网站完整候选的审查与安装

从干净提交 `61d8cb1f2f745a0990cc5e63644d9fba10dc7758` 正式生产构建后，以受管 `e2e:visual capture` 采集三引擎桌面及 Chromium 移动端：1,204 项首次通过、602 项既有移动 Firefox/WebKit 显式跳过，零失败、零重试。源码、锁文件、实际构建、截图合同和工具版本均绑定在清单；候选及原生报告位于 `.tmp/website-visual-61d8cb1f2/`。

逐图字节比较旧已审查 `70661ce91` 基线：1,188 张完全相同，16 张变化均为中英文 important 与 Lynx 文档说明变长。主代理实际查看全部 16 个变化区域，另抽查三引擎首页、移动首页/UI、Firefox UI 与 showcase 图片，共登记 23 份 PNG 审查证据；所看区域未见错位或图片缺失，不声称人工阅读了全部长页的每个像素。此前审查和相同字节的页面来源继续保留。

先以 `pnpm --filter @weapp-tailwindcss/website e2e:visual verify` 核对旧安装来源，再按本任务归属归档旧黄金目录和两份登记至 `.tmp/website-visual-70661ce91-installed-archive/`。新候选经 `e2e:visual review --directory <候选> --reviewer <审查者> --notes <中文结论> --evidence <实际查看PNG>`、`e2e:visual install --directory <候选>` 及再次 `e2e:visual verify` 通过，更新 `darwin.json` 与 `darwin.review.json`。来源验证不等于禁止更新的实渲染比较；后续全面入口仍须运行 `e2e:local`，本记录不替代原生或旧 WebView 验收。

### 作者 reset 与渐变消费图的反例修复

`61d8cb1f2f745a0990cc5e63644d9fba10dc7758` 的作者变量边界仍有反例：按六个公开 `--tw-*` 名删除显式 `initial`，使原本应阻断继承并使用 24px fallback 的元素继承到 12px；按 `--tw-gradient-position` 名改写 token，也会改变普通 `font-family` 消费。完整注册签名同样不是作者来源证明，不能据此删除作者 reset。

先持久化 Web、Lynx、组合管线回归，首次为 37 项失败、16 项通过；三浏览器真实反例各失败一项。删除 initial 名单与清理调用，渐变兼容改为基于真实 CSS token 的反向消费图：逐次保留引用身份，沿透明 alias 携带 linear/radial/conic 上下文，未知消费、typed 注册、注册描述符、未展开 import、悬空和循环均否决。审查进一步发现不含 `var()` 的 `style(--name: value)` 会直接读取变量，先补三项失败，再把容器、布尔、转义和 CSS `if()` 查询纳入保护。

单类完整消费链分别使用合法默认方向，并验证 CSSOM 的新增、替换与移除仍作用于原变量。多类梯度共用纯 `in oklab` 时无法由局部声明确定最终级联，保留原 token；不以镜像变量或局部规则猜测来隐藏问题。真实生产 encoder 能接受探针不等于旧引擎实际渲染正确，此范围仍待原生实测。

基于本地 `0595204d2332bea3b7fbdee73f4c163b9d1e2dc9` 加上述未提交修复，PostCSS 全包为 148 文件、1,669 项通过、3 项既有跳过；四份集中合同 150 项通过；重建 PostCSS 后，核心 generator 9 项通过。旧 CI 五项断言要求删除注册，已改为明确验证注册与 initial 保留，未放宽样式支持预期。`CI=1 pnpm e2e:lynx --update=none` 为示例 205 项、E2E 39 文件 779 项全部通过，正式开发/生产双入口、encoder/decoder 与既有 static 无差异，未重写 static。`CI=1 pnpm e2e:lynx:theme` 为三引擎 15 项通过。包构建、类型、定向 ESLint 和 diff 检查通过。

红绿原始日志位于 `.tmp/author-values-{persistent-red,query-red,browser-persistent-red,postcss-full,generator-green,lynx-green,browser-final}.log`。本批没有证明跨独立 stylesheet、运行时未知消费或旧引擎混合渐变效果，全面验收仍为 partial；性能门禁与 Taro Vite Harmony 空白的首次失败单独保留，不能由本批通过覆盖。

### Taro Vite Harmony 的生产空白根因

全面验收的定向补证暴露三个 Vite Harmony hybrid 项目在浏览器中没有有效页面，不能把构建成功计为运行成功。Taro 4.2.1 平台只注册 Webpack 适配，Vite 缺少平台 alias、组件初始化与应用 API 转换；框架 hooks 只匹配 H5 API；runner 没有等待异步配置钩子，SPA/MPA 又沿用普通 H5 rem 策略。这些是不同生命周期缺口，不能靠补一条样式或放宽尺寸期望解决。

四份固定版本依赖补丁从平台 getter、compiler context、框架 API load 和 HTML transform 边界接通 Vite；路由 API 排除与 Webpack 保持一致，Babel 通过 packageExtensions 明确依赖。现有不完整 loaderMeta、Windows CSS 模块字面量、盘符与相对路径归属均有失败回归。真实发行包源码同时验证开发 optimizer、生产 load 的 H5/hybrid 绑定，SPA/MPA 的实际 transformIndexHtml 验证平台 rem；普通 H5 的短边、min/max 与 resize 策略不变。

首次生命周期与 rem 回归 13 项失败，平台与 hooks 回归 6 项失败；后续元数据与 Windows 字面量又得到 3 项失败。修复后新增四文件 35 项通过，完整 `CI=1 pnpm test:demo:matrix` 为 50 文件、356 项通过。五项目十组合的报告门禁继续拒绝缺生产证据、错误颜色、缺属性和错误尺寸；Vite Harmony 三项缺证红例修复后进入默认门禁。

三个 Vite Harmony 生产产物的真实后台 Chromium 计算样式、几何和独立像素参考全部通过；两个 Webpack Harmony 与三个 Vite H5 生产对照也通过。H5 此处使用 `--build-only`，没有执行开发与 HMR，不能计为完整矩阵通过。锁文件只保留四份补丁、显式 Babel 边与对应 peer 身份，撤销安装器重解造成的无关 PostCSS、Node 类型及 optional 漂移，`pnpm install --frozen-lockfile` 成功。补丁只作用于仓库冻结安装；来源、移除条件与回归入口见 demo-matrix 手册，不随产品 npm 包发布，也不证明 Harmony 设备运行。

仅对三个 Vite Harmony 目标执行 `CI=1 pnpm e2e:demo:matrix <三个目标> --build-only --update` 重新生成 static，审查确认零差异，再以同样目标去掉 `--update` 复跑全部通过；正常流程不更新基线。原始日志为 `.tmp/taro-harmony-{static-update,static-none,production-controls,matrix-tests}.log`，完整 CSS、JS、生产截图和计算样式在 `e2e/.artifacts/demo-matrix/`。ESLint、diff、agents（67 规则、346 文档、1,005 命令，零错误）与 release status 通过。

### 当前性能证据的范围

基于干净 `26e003fe2361f60e852f1f9908d1b718b5fd2f4a` 与起始 main 的两侧新安装、新构建，仅选择 Taro Vite React 微信目标，执行带内存 preload 的阶段诊断。HMR 插件样本 `[792,742,712]` 对 `[734,768,704]`，中位数 742→734ms；构建插件中位数 2,474→2,589ms。它使用 macOS arm64/Node 24.18.0，既不同于原 CI 的 Ubuntu/Node 22，也不同于原 `61d8cb1f2` 源码。诊断改变了采集环境，不能代替正式性能门禁，不能覆盖原 CI 的 +16.64% 失败。

四个阶段钩子均实际执行，主 app CSS 生成约 520–556ms；目前子阶段只归属其中约 60ms，无法指认原来的 333ms 增量。mutation 与 rollback 日志混合且缺轮次身份，另有 task 文件标签遗漏；现有证据尚未证明选错样本。根因仍为 unknown，不修改阈值或以一次本地通过认定问题消除。报告、来源身份和逐进程 NDJSON 保存在 `.tmp/benchmark-26e003f-phase/`。

## 规则评估

decoder 固定资源有独立安全边界，迁入发布包后沿用其局部 AGENTS 并登记索引；仓库其他硬规则和验收门槛没有放宽。旧复盘保留历史 SHA 与结果，只修复资源移动后的断链，不把旧证据改为本轮通过。
