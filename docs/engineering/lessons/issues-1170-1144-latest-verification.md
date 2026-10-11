---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1170
baseline: 46411420c24eb56678759151d80367040286a893
regressions:
  - e2e/issue-1170-web.test.ts
  - e2e/issue-1144-alpha.test.ts
  - e2e/issue-1144-static.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/vite-style-requests.test.ts
---

# 最新主分支对 #1170 与 #1144 的独立验证

## 当前判定

#1170 已在 Windows HBuilderX 5.24、5.25-alpha 取得旧版首次保存失败、最新版 LF/CRLF 全部通过的证据，
支持 #1169 修复了这条生命周期根因。#1144 Options 和原始 setup 在两个 Windows IDE 版本均完成
16 次保存、2 次刷新。第六轮补验前仅增加失败现场采集，没有修改样式实现或启动行为；
因此第四、五轮 setup 启动超时属于非必现的启动异常，不能把第六轮通过归功于某个样式补丁。
这些历史失败及其归因边界仍保留在下文。

| 环境 | #1170 修复前 | #1170 最新 | #1144 最新 Options | #1144 最新 setup |
| --- | --- | --- | --- | --- |
| Windows Server 2025 + HBuilderX 5.24 | CRLF 首次保存静默丢样式 | LF/CRLF 各 9 次保存/刷新通过 | 16 次保存、2 次刷新通过 | 第六轮 16 次保存、2 次刷新通过 |
| Windows Server 2025 + HBuilderX 5.25-alpha | CRLF 首次保存静默丢样式 | LF/CRLF 各 9 次保存/刷新通过 | 16 次保存、2 次刷新通过 | 第六轮 16 次保存、2 次刷新通过 |
| macOS + HBuilderX 5.24 | LF 首次保存静默丢样式 | LF 9 次保存/刷新通过 | 16 次保存、2 次刷新通过 | 16 次保存、2 次刷新通过 |
| macOS + HBuilderX 5.25-alpha | LF 首次保存静默丢样式 | LF/CRLF 各 9 次保存/刷新通过 | 16 次保存、2 次刷新通过 | 16 次保存、2 次刷新通过 |

Windows 是实际 IDE、内置编译器和浏览器运行，并非只模拟路径；宿主为 Server 2025，不是用户的 Windows 11 原机。
样式源码基线为 `46411420c`，不代表 npm 已发布同样的修复。本次继续修复的独立 Windows 进程参数缺陷见
[进程边界记录](hbuilderx-windows-process-boundary.md)，没有把 runner 修复冒充 #1169 的样式修复。

## 症状

2026-09-08 获取 origin/main，主 checkout 从 `6873b33a5` 快进至上述提交，
再创建独立工作树 `codex/verify-1170-1144-latest`，冻结安装并重新构建主包及依赖。

- [#1170](https://github.com/sonofmagic/weapp-tailwindcss/issues/1170)：5.5.2、Tailwind 4.3.3、Windows、HBuilderX 5.24；首次加载正常，只改 `.uvue` 文字后样式消失，没有错误或警告。
- [#1144](https://github.com/sonofmagic/weapp-tailwindcss/issues/1144)：除原始完整 SFC 被送入 PostCSS 外，后续还反馈真实 `pt.root` 多轮修改不生效、important 引发 Sass 错误和 style 子请求失败。验收包含这些后续反馈，没有只检查最初的 Unknown word。

#1170 未提供完整仓库。本轮按其截图重建空 `script setup lang="uts"`、空 `style lang="scss" scoped`、
`text-xl text-[#f7fbff] bg-[#102938] w-[200px]` 页面，复用仓库 #1144 demo 的合法构建配置。
该 demo 显式定义 `--text-xl: 20px`，因此运行时以 20px 验收，不假定其它工程的 theme 数值。
页面事先放置无 utility 的 marker；前六轮只改变文字，class 与 style 块保持不变。

## 根因与纠正

最新主分支包含 #1169。Web pre HMR hook 在框架 scoped 预处理和 Vue 描述符比较前完成 SFC 转换，
让首次编译与 HMR 看到一致的生成 style 块；post hook 保留原始源码事务，
script/template/custom 子请求不会再清空同文件的作者和生成样式状态。
已删除的生成 style 索引返回空 CSS，后续作者块复用索引时优先采用作者内容。
详见 [原生命周期分析](issue-1144-style-lifecycle.md)。

独立构建修复前 `be518d94790c29aad401220b5cdb2a5d23173d5f`，
使用相同 #1170 用例、同一 HBuilderX alpha、相同 Tailwind 4.3.3 对照。
对照只移植验收用例和 Web runner 清理逻辑，产品源码保持修复前版本。
首次加载通过，第一次纯文字保存后 marker 已更新，但样式失效：

| 属性 | 首次加载及最新修复 | 修复前第一次保存 |
| --- | --- | --- |
| width | 200px | 1280px |
| color | rgb(247, 251, 255) | rgb(0, 0, 0) |
| backgroundColor | rgb(16, 41, 56) | rgba(0, 0, 0, 0) |
| fontSize | 20px | 16px |

修复前浏览器 errors、warnings 均为空，DOM 文字为 `Hello Tailwind on uni-app save-1`，
safe class 已更新而对应样式没有生效，符合 #1170 的无报错丢样式现象。
最新代码同例完成六轮纯文字保存、三轮宽度替换/恢复，每轮均刷新浏览器后再次检查计算样式。
这组修复前失败、修复后通过的证据支持 #1169 覆盖了 #1170 的同类根因，不能把它仅归为错误消息修补。

## 验证

环境：macOS、Node 24.18.0、pnpm 11.25.0、Chrome 152.0.7977.77；
HBuilderX 5.25.2026082902-alpha、host HBuilderX、内置 Vite 5.2.8，日志确认 Web VDOM、样式隔离 2.0。
主包实际解析到本工作树 `packages/weapp-tailwindcss/dist/vite.cjs`，
PostCSS 解析到本工作树 `packages/postcss/dist/index.cjs`，Tailwind 为 pnpm 安装的 4.3.3。
这是最新源码本地构建，manifest 仍为 5.5.2，不代表 registry 的同版本含有此次修复。

```sh
pnpm install --frozen-lockfile
pnpm --filter weapp-tailwindcss... run build
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/uni-app-x test/bundlers --update=none
CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none
CI=1 E2E_ISSUE_1144_ALPHA=1 HBUILDERX_CHANNEL=alpha HBUILDERX_HOST=HBuilderX pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1144-alpha.test.ts --update=none
CI=1 E2E_ISSUE_1170_WEB=1 E2E_HBUILDERX_WEB_TIMEOUT_MS=45000 HBUILDERX_CHANNEL=alpha HBUILDERX_HOST=HBuilderX pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1170-web.test.ts --update=none
```

- 主包及依赖完成实际构建；未使用 Turbo 缓存替代，未构建全仓 demo/文档站。
- uni-app x/bundler：125 文件、1517 测试通过。
- PostCSS：64 文件、709 通过、3 个既有跳过。
- #1144：Options/setup 各 16 轮保存、2 次刷新，共 32 轮保存、4 次刷新；真实 pt 消费、important、组件 style 删除/恢复、marker、class、CSS、计算样式均通过，浏览器错误和警告均为空。
- #1170：9 轮保存、9 次刷新通过，截图及计算样式与预期一致。Web 专项运行显式跳过独立 static case，static 已另行执行。
- runner/matrix：43 项通过。

新增 #1170 样式回归已单独生成对应生产 static 基线，再以禁止更新模式复验。
#1144 的 Options/setup 生产产物也重新构建，既有快照无变化。

```sh
CI=1 E2E_ISSUE_1170_STATIC=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1170-web.test.ts -u
CI=1 E2E_ISSUE_1170_STATIC=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1170-web.test.ts e2e/issue-1144-static.test.ts --update=none
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1144-runner.test.ts e2e/e2e-matrix.test.ts --update=none
CI=1 pnpm exec eslint e2e/issue-1170-web.test.ts
pnpm agents:check
git diff --check
```

static 共 3 项通过。ESLint、规则检查和 diff 检查通过。
`CI=1 pnpm typecheck` 未通过；在已构建相同依赖的修复前工作树运行同命令，旧基线 438 条、最新 437 条。
按仓库路径、错误码和消息归一化后无新增，少一条 `src/uni-app-x/vite.ts` HMR hook context 错误；不能写成全仓类型检查通过。

原始日志集中于忽略目录 `e2e/.artifacts/verify-1170-1144/`。
其中 `1170-before/` 保存旧基线第一次保存失败的日志、页面、diagnostics 和有效截图；
`typecheck-comparison.json` 保存类型对照。
最新 #1144 Options/setup 逐轮证据分别位于
`e2e/.artifacts/web-hmr/issue-1144-uni-app-x-web-1788871875066` 与
`e2e/.artifacts/web-hmr/issue-1144-uni-app-x-web-1788871933215`；
最新 #1170 首轮成功证据位于 `e2e/.artifacts/web-hmr/issue-1144-uni-app-x-web-1788872174926`。
目录名称来自复用的 demo，具体 Issue 以 marker 和测试日志区分。

首次 #1170 新用例错误继承了原主题页 `.bg-page` 的 CSS 断言，虽然实际初始样式正确仍无法继续；
纠正为精简页适用的 preflight 检查后重跑。旧对照另有一次 Web 服务未启动；该轮仅有版本日志，
不计入缺陷复现。有效失败来自后续已完成首次加载的同服务纯文字保存。

## 适用边界

本轮支持在上述 macOS alpha Web VDOM 链路上，两项问题的生命周期根因均已修复。
用户继续要求补测边界后，检查 alpha 无打开的编辑文件及运行任务，退出并切换到 HBuilderX 5.24.2026081301。
稳定版 #1170 完成 9 次保存和刷新；#1144 Options/setup 各 16 次保存和两次刷新，全部通过。
稳定版使用 `E2E_ISSUE_1144_STABLE=1 HBUILDERX_CHANNEL=stable` 与 `e2e/issue-1144-stable.test.ts`，
#1170 复用相同用例并设置 `HBUILDERX_CHANNEL=stable`；日志为 `1144-stable.log`、`1170-stable.log`。
Windows HBuilderX 的真实运行与边界补验证据见下节。
Vapor 和用户未提供的完整 #1170 项目仍未验收。
未发布 npm、未向 Issue 发送评论、未关闭 Issue。

## 边界补验（2026-09-08）

- macOS 稳定版 5.24 同样完成修复前对照：首次正常，第一次纯文字保存后静默丢样式。
  证据在 `e2e/.artifacts/verify-1170-1144/1170-before-stable/`；随后恢复本机原有 alpha IDE。
- #1170 加入 LF、CRLF 参数化源码，已有 marker 的替换不改变换行符。
  alpha 实际 IDE 两种源码各完成 9 次保存、9 次刷新，合计 18 次保存和刷新。
  日志为 `1170-line-endings.log`；新增边界后的 static 单独 `--update=all` 生成、
  再以 `--update=none` 验证，基线无变化，日志为 `static-line-endings-update.log`、`static-line-endings-check.log`。
- 样式归属生命周期覆盖 POSIX、Windows 正反斜杠、中文加空格目录、UNC、盘符根目录、POSIX 根目录与相对路径，8 组通过。
  每组包含三轮变更、script/setup/template/custom 子请求、生成索引移除和作者复用，未用路径启发式兜底。
- 中英文 IDE 编译器日志回归共 11 项 runner 测试通过，错误编译器大版本和 Vapor 模式仍拒绝匹配。

Windows 使用官方 5.24、5.25-alpha ZIP，在 GitHub 托管 Windows Server 2025 10.0.26100 上安装
`uniapp-cli-vite`、`uniappx-launcher`、`compile-dart-sass`，浏览器为 Playwright Chromium。
这是真实 Windows IDE 进程；不等价于用户 Windows 11 原机，也不等价于 Web Vapor 或原生端验收。

第一轮 [34231077851](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34231077851)
暴露验收环境问题：alpha 的内置插件命令尚未注册时 `installPlugin` 输出错误但退出 0；
稳定版 #1170 已完成全部 9 轮保存与刷新，最终被只匹配中文编译器日志的断言误判，
随后复用 IDE 的会话未能再次启动服务。这些不算产品缺陷复现。
启动脚本已等待插件命令注册、检查安装结果与真实编译器文件；
验收日志同时支持中英文而保留版本与 VDOM 模式约束。

第二轮 [34232870829](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34232870829)
分别因冷启动 `cli help` 阻塞与插件安装超时未进入页面；随后改用有界实际安装重试。
第三轮 [34233924823](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34233924823)
成功安装两种官方 IDE，但强制重启后的 CLI 就绪不稳定。
稳定版修复前独立工作树已完成 CRLF 原例复现：首次加载正常，第一次文字保存后
宽度 1280px、颜色黑、背景透明、字号 16px，正文与 marker 均更新，浏览器 errors/warnings 为空。
`windows-third-stable/issue-hbuilderx-windows/before/comparison.json` 的 `reproduced` 为 `true`，
并有 `initial.png`、`final.png`、服务身份和完整请求日志。
该运行的稳定版对照步骤成功；alpha 的重复初始化未完成，已停止被后续会话方案取代的剩余任务。
真实编译器使用内置 Node 22.22.2、Vite 5.2.8；runner Node 为 24.19.0。

第四轮 [34235453291](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34235453291)
使用独立 Vitest 进程与项目别名，保持 IDE 正常运行，分别验证 LF、CRLF、Options、setup，
并在修复前构建前提前上传最新源码的证据。
5.24 与 5.25-alpha 均已通过 #1170 LF、CRLF 各 9 次保存和刷新，以及 #1144 Options 的
16 次保存、2 次刷新；每个 IDE 共 34 次保存、20 次刷新，浏览器 errors/warnings 均为空。
对应目录为 `windows-fourth-stable-current/`、`windows-fourth-alpha-current/`。
两者的 setup 场景均在 Web 服务启动前超时，没有进入样式断言。
第五轮 [34236790675](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34236790675)
通过 `runtime_case=1144-setup` 在新 IDE 上单独补验该边界，避免重复已通过的场景。
第五轮两套 IDE 仍在约 120 秒后报 `等待路径超时`；完整诊断没有编译日志、请求和首次截图，
不能判定为样式断言失败，也不能写成 setup 通过。原始材料为 `windows-fifth-stable-current/`、
`windows-fifth-alpha-current/`。

第四轮的两项修复前对照步骤均成功复现旧版缺陷，`comparison.json` 均为 `reproduced: true`，
材料为 `windows-fourth-stable/issue-hbuilderx-windows/before/` 与
`windows-fourth-alpha/issue-hbuilderx-windows/before/`。
整个 workflow 因 setup 超时呈失败，需按场景与对照 JSON 阅读，不能把 workflow 总状态当成 #1170 的结论。

另试验了官方 `launch web --ui true`，该命令立即退出并要求用 `logcat` 取日志；
本机加入日志快照轮询后仍提示尚未启动项目，未取得可用界面运行证据。
该替代方案没有推广到 Windows 或保留为正式验收入口；日志为 `1144-ui-alpha.log`。
最终保留已实际运行的 Windows 独立场景入口，不添加未经验证的界面模式兜底。
对照只有首次加载正常、首次保存 marker 与正文更新、背景透明且浏览器无错误才算复现；
构建或服务启动失败不能作为修复前失败证据。

## 第六轮与持续回归

[34239968019](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/34239968019) 在相同的
Windows stable/alpha 上单独运行原始 setup，两者均完成 16 次保存、2 次刷新，并取得完整截图、CSS、
服务身份及空浏览器 errors/warnings。目录为 `windows-sixth-stable/` 与 `windows-sixth-alpha/`。
该提交只增加超时后的原生进程、端口、窗口与日志采集，成功路径没有改动。
所以此前“setup 无法验收”的结论已被新证据补齐，但超时的具体 IDE/IPC 责任点仍未建立。

正式入口现为 `.github/workflows/uni-app-x-regression.yml`：
三系统 × Node 22/24 运行 runner、uni-app x 与路径回归；Windows 两个官方 IDE 每次各重复两轮
LF/CRLF、Options/setup，项目别名位于中文、空格与 `&` 路径中，失败不得重试为绿色。
手动 `compare_before=true` 可以独立构建旧版本复现首次保存丢样式；常规 PR 不重复安装旧版依赖。
`latest.json` 逐项持久化，即使后续进程超时也保留已完成的结果；IDE 超时现场在清理前采集。

## 规则评估

不新增 AGENTS 规则。现有真实 IDE、同例修复前后验证、首次加载与增量区分、static 基线要求已覆盖本次工作。
新增持久 #1170 用例记录纯文字保存也可能改变生成样式身份这一回归边界。
