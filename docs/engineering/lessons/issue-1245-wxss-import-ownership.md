---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1245
baseline: 7dd7f53c7a82939b8c0505bbc973dd6dde5c5308
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-import-shell-rebuild.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-root-style-ownership.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-source-output-relations.unit.test.ts
---

# Issue #1245 后续：微信热更新的 WXSS 导入循环

## 症状

使用 icebreaker-forked/unibestX 的 f31cf44dd2c335ec98a83d274782e1131ef0aaca，独立 checkout 与核心 worktree。保持原插件顺序、样式隔离 2.0、组件局部样式及开发态来源追踪；微信端仍不从 App.uvue 导入 main.css，由 cssEntries 接管。未启用项目中已注释的 tailwindHmrPlugin。

原项目未提交锁文件。安装采用 pnpm 12.6.0，并把 package.json 已有 overrides 原样迁入仅本地使用的 pnpm-workspace.yaml；使用 --ignore-scripts，安装后的锁文件保存在证据目录。实际依赖为 weapp-tailwindcss 5.5.10、Tailwind CSS 4.3.3、Vite 5.2.8、Vue 3.5.43。后续只切换 weapp-tailwindcss 到同一 worktree 的构建产物，不重新解析项目依赖。

运行工具为 HBuilderX stable 5.26.2026091802、微信开发者工具 2.02.2609231，实际微信渲染模式为 VDOM。项目原 AppID 不属于当前登录用户，IDE 验收临时使用仓库已有授权测试 AppID，不改变样式配置。

## 根因与纠正

5.5.10 与当前源码基线均复现微信工具的 “a file can not import itself” 错误。真实产物是间接循环：uvue.wxss 导入 main.wxss，而 main.wxss 又导入 uvue.wxss。

首次构建，框架根资产 uvue.wxss 的内容被分配到 main.wxss，原资产变为导入壳。首页类名变化后的增量 bundle 省略 uvue.wxss，框架样式缓存把它补在 bundle 尾部。此时排在前面的 app.wxss 被错误分配到相同配置入口；它原有的 /uvue.wxss 导入随作者样式进入 main.wxss，形成循环。此前的入口选择依赖本轮资产枚举顺序，忽略了已有来源归属。

另外，当前 bundle 如果已经给出纯导入壳，旧重定向逻辑仍可把壳写入其目标，并以目标身份登记缓存、处理标记和更新通知。目标先处理、导入壳后处理时会直接覆盖目标。这是独立的同类身份错误。

连续修改主入口还暴露了来源关系的删除通知问题：observeSource 后重新登记同名输出，旧的待删除通知仍留在队列。下一次内部空 bundle 消费通知时误删 main.wxss 的框架归属，随后 app.wxss 抢占入口。删除通知现在同时检查当前 sourcesByOutput，仍有来源的输出不能被旧通知删除。真正删除和换目标仍会清理旧产物。

## 修复边界

- 在入口规划前检查已登记的框架根输出归属。其他根资产不能抢占已拥有的目标；目标本身、其所属框架资产及组件局部样式仍能正常消费配置。
- 纯导入壳先以自身身份写回和记录。目标缺席时，仅允许从可用 Tailwind 来源继续生成，不能把壳当成样式内容回放。
- 当前导入关系覆盖过期映射；多个导入不缩成单个目标，已有合法导入壳不会被最终恢复阶段重写。
- 所有资产变更经 bundle/emission API 完成，未读取输出目录补救、未增加公开 API 或配置。

## 持久回归与静态产物

vite-import-shell-rebuild.test.ts 用同一个 generateBundle 实例重现目标先于导入壳、重复构建、目标缺席、目标切换、多导入、删除恢复，以及省略框架根资产后的入口抢占。使用 bootstrap/framework/theme 等非固定文件名，同时覆盖 wxss、acss、ttss。输出基线位于同目录 __snapshots__/vite-import-shell-rebuild.test.ts.snap，包含首次构建、增量回放、删除、恢复四阶段。

vite-root-style-ownership.test.ts 覆盖 POSIX、Windows 反斜杠、盘符、绝对路径、相对路径、根路径导入、查询参数与过期目标。Windows import 字符串按 CSS 转义语义构造。

来源归属回归还覆盖入口重建后重新登记同名输出、内部空 bundle、多消费者、换目标、删除恢复与 POSIX/Windows/相对源码路径。新增三项归属测试在修复前全部失败，修复后通过；完整 generateBundle 序列也覆盖连续两轮重新登记和空 bundle 消费。

在原始核心源码上运行新增的六个序列用例，六个全部失败；恢复修复版后通过。未放宽原有断言。静态输出基线显式更新后，以 --update=none 复验。

uni-app-x-vdom-tailwindcss-v4 的 e2e static 基线已通过 HBuilderX 重新构建生成，随后用 --update=none 复验通过。17 个基线重新生成后，仅 app.wxss 少一个重复的 ./uvue.wxss 导入；已有 /uvue.wxss 导入正常保留。这来自根路径导入解析修正，避免运行入口重复补链。

## 验证

证据目录为 e2e/.artifacts/issue-1245/，包括三版构建日志、baseline-regression.log、baseline-types.log、published-failure-native.png、导入图、真实项目逐轮截图和 final-report.json。锁文件保存在 unibestx-baseline-lock.yaml。临时诊断日志代码未保留在源码。

已执行：

```sh
pnpm --filter 'weapp-tailwindcss^...' run build
pnpm --filter weapp-tailwindcss build
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-import-shell-rebuild.test.ts --update=all
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-import-shell-rebuild.test.ts test/bundlers/vite-root-style-ownership.test.ts test/bundlers/vite-plugin.bundle.unit.test.ts test/bundlers/vite-framework-style-memory.test.ts test/bundlers/vite-css-finalizer.unit.test.ts test/bundlers/vite-helpers.unit.test.ts test/bundlers/vite-remembered-css-replay-root-shell.unit.test.ts test/bundlers/vite-css-output-imports.test.ts test/source-line-limit.test.ts test/ci/architecture-contract.test.ts --update=none
pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-source-output-relations.unit.test.ts --update=none
pnpm architecture:check
pnpm agents:check
CI=1 E2E_PROJECT_FILTER=uni-app-x-vdom-tailwindcss-v4 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run --update=all -c e2e/vitest.e2e.config.ts e2e/uni-app-x-vdom-tailwindcss-v4.test.ts
CI=1 E2E_PROJECT_FILTER=uni-app-x-vdom-tailwindcss-v4 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run --update=none -c e2e/vitest.e2e.config.ts e2e/uni-app-x-vdom-tailwindcss-v4.test.ts
```

11 个测试文件、315 项测试通过；架构检查通过。源码 ESLint 通过。

类型检查命令 pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.build.json --noEmit --noCheck false --pretty false 未通过：framework-source-scan-session.ts 的 443、444 行把 undefined 赋给必填函数。还原原始核心源码后，同一命令仍报这两处错误，已保存 baseline-types.log；本次未修改该模块。共享 automator 治理脚本也存在基线问题：检查 main 函数中的 launch，而实际单次 launch 已位于 runProbe。前期 automator 连接不稳定，最终验收的阶段 1–7 使用普通微信项目窗口；阶段 8–12 因窗口焦点不稳定，使用一个新的官方 automator 会话定位页面，后续重编译均继续使用同一连接。全部截图仍由当前会话原生 computer use 采集。普通窗口 Errors 为 0；自动化窗口不展示计数，在报告中记为 null，仅记录已确认的正常渲染、无 WXSS 编译错误与无导入循环。失败的前期报告保留在 first-validation 中，不作为通过证据。

## 真实项目最终验收

2026-09-28，最终修复包接入同一 unibestX checkout 后，12 轮操作全部在 runner PID 68864、项目别名 unibestX-issue-1245-26a3b44612-68864 的同一个 HBuilderX watch 进程内完成，没有重启编译任务：

1. 首页颜色 #d14328 → #267b94 → #315c8e → 删除 → 恢复原色，共四轮。
2. Tailwind 示例标题 16px → 19px，新增局部字距 3px → 5px → 删除局部样式 → 恢复组件，共五轮。
3. main.css 新增 @utility font-semibold 字距 4px → 6px → 删除恢复，共三轮。

每轮均保存编译日志、根 WXSS、全项目导入图、循环检查结果、当前页面标识和截图。12 轮均无直接或间接导入循环，截图显示颜色、字号和字距按预期变化。最后检查局部字距和主入口字距均无产物残留，三份源码与原始备份逐字节一致。

普通全局 .font-semibold 探针只在根产物生效，不能直接影响样式隔离 2.0 的组件类名；该诊断记录保留，最终主入口验收采用 @utility 以覆盖组件局部生成和可见变化。前一次验收在主入口连续修改时捕获删除通知导致归属丢失的问题，证据保留在 utility-trace-watch.log、utility-failure-native.png 与 first-validation 中；最终验收使用修正删除通知后的包重新执行全部 12 轮。

## 适用边界

本次只验证微信热更新，不代表 Web、Android、iOS、Harmony 全端通过。未发布、未关闭 Issue、未发送评论。真实项目完整验收已通过。

## 规则评估

不新增 AGENTS 规则，现有 bundler 生命周期、来源身份、输出图与静态基线规则已经覆盖本次问题。
