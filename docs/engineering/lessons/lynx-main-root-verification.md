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
    sha: 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
    environment: 当前独立工作树，必须重新 prepare --extended、当前会话 computer use 和 verify
    reason: 尚未取得本轮全端环境通行证，旧 Android/iOS 报告不计为本轮证据
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
- 新正式构建基线仅限定更新 `e2e/__snapshots__/lynx-diagnostics-build.test.ts.snap`；记录实际 CSS、业务删除和 unknown，正常 padding/gap 展开单独断言全部数值。原 ReactLynx 示例的 static evidence 未改写。实际报告、原始输入、TASM、解码 CSS 与 bundle 留在 `e2e/.artifacts/lynx-diagnostics/`。
- 发布计划通过 `pnpm release status` 检查；本轮中文 intent 只登记 PostCSS/Lynx，其他既有 intent 和依赖传播由 repoctl 决定，未执行发布。
- 普通 PR 的 Lynx Android 工作流增加正式构建及包回归；既有 Web 三浏览器矩阵逐引擎运行主题对照。默认静态入口只选择已安装的 Chromium，三引擎入口显式选择 all，非法引擎名称立即失败。

## 适用边界

当前结果仍为 **partial**。本轮全面验收前须重新执行扩展预检、真实当前会话 computer use 和 verify。原生主题切换、RN 的实际 served bundle/HMR 链、Image/ScrollView、RN/Lynx 注册夹具、独立转换 oracle 与尚缺的六类 Web variant，不能由上述单测或静态合同写成全面有效。跨独立 stylesheet 与运行时 inline 的不可见覆盖不在当前 AST 静态安全保证内。原生报告与 served bundle 的既有缺口继续单独登记。

## 规则评估

decoder 固定资源有独立安全边界，迁入发布包后沿用其局部 AGENTS 并登记索引；仓库其他硬规则和验收门槛没有放宽。旧复盘保留历史 SHA 与结果，只修复资源移动后的断链，不把旧证据改为本轮通过。
