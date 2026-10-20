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

## 适用边界

当前结果仍为 **partial**。本轮全面验收前须重新执行扩展预检、真实当前会话 computer use 和 verify。原生主题切换、RN 的实际 served bundle/HMR 链、Image/ScrollView、RN/Lynx 注册夹具、独立转换 oracle 与尚缺的六类 Web variant，不能由上述单测或静态合同写成全面有效。跨独立 stylesheet 与运行时 inline 的不可见覆盖不在当前 AST 静态安全保证内。原生报告与 served bundle 的既有缺口继续单独登记。

## 规则评估

decoder 固定资源有独立安全边界，迁入发布包后沿用其局部 AGENTS 并登记索引；仓库其他硬规则和验收门槛没有放宽。旧复盘保留历史 SHA 与结果，只修复资源移动后的断链，不把旧证据改为本轮通过。
