---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1307
baseline: 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
regressions:
  - packages/postcss/test/lynx-theme-safety.test.ts
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

管线回归 26 项通过，包含真实三浏览器、Firefox 超高页面分片、missing 采集和 none 严格比较；改变真实颜色后三引擎比较失败且黄金字节未变。类型、ESLint 与规则检查通过。这些合成图只验证管线；网站完整候选仍须独立采集、实际视觉审查、安装和禁止更新复验。黄金来源的历史 HEAD 不要求等于未来 HEAD，否则会失去回归意义；渲染环境或截图合同变化则明确阻断，不能静默复用。

## 适用边界

来源修复后的 `CI=1 pnpm e2e:lynx --update=none` 为示例 205 项、E2E 39 文件 775 项全部通过；`style.css` 来源与 static 基线在禁止更新模式下通过。核心类型、架构、源码行数和文档 14 项合同也通过。

当前结果仍为 **partial**。本轮全面验收前须重新执行扩展预检、真实当前会话 computer use 和 verify。双端主题覆盖已有上述提交的运行证据；新 head 原生执行仍待通过。RN 的实际 served bundle/HMR 链、Image/ScrollView、RN/Lynx 注册夹具、独立转换 oracle 与尚缺的六类 Web variant，不能由上述单测或静态合同写成全面有效。跨独立 stylesheet 与运行时 inline 的不可见覆盖不在当前 AST 静态安全保证内。原生报告与 served bundle 的既有缺口继续单独登记。

## 规则评估

decoder 固定资源有独立安全边界，迁入发布包后沿用其局部 AGENTS 并登记索引；仓库其他硬规则和验收门槛没有放宽。旧复盘保留历史 SHA 与结果，只修复资源移动后的断链，不把旧证据改为本轮通过。
