---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: e0e7400c91d871e8562cbd57b7cc8a46aca97215
regressions:
  - e2e/runtime-structure.test.ts
  - e2e/runtime-structure-injection.test.ts
  - e2e/hbuilderx-ios-runtime.test.ts
  - e2e/hbuilderx-ios-hmr-completion.test.ts
  - e2e/app-marker.test.ts
  - e2e/app-visual-lifecycle.test.ts
  - e2e/hbuilderx-app-process-cleanup.test.ts
  - e2e/hbuilderx-alias-consumers.test.ts
---

# iOS 样式截图必须同时绑定独立运行时结构

## 症状

[上一轮 iOS HMR 取证](ios-hmr-completion-evidence.md)明确只证明可见样式标记，尚未读取设备节点文字。正确 PNG 即可让旧的 `waitForIosRuntimeEvidence` 返回通过，不能满足“本轮产物、运行时结构和截图同时成立”的要求。新增“正确截图缺少独立运行时结构时仍必须失败”回归，在修改前出现预期失败，确认这一缺口。

## 根因与纠正

原完成契约只消费截图分析。现在普通 uni-app 通过 renderjs 读取真实 WebView DOM 的 ID、`textContent`、边界矩形和节点数量，再经官方 `owner.callMethod` 回传；uni-app x 通过 `uni.getElementById`、`UniElement.getBoundingClientRect` 和 `UniTextElement.value` 读取对应信息。生成器不把预期文字或矩形写入回执，SDK 查询返回 `null` 时按无节点处理。

探针每次启动生成 `runId`，每次源码保存写入新 token；设备回执从真实节点属性读取 token。宿主拒绝错误身份、错误适配器、重复或倒退序号、重复 ID、不完整布局和探针错误。不同设备实例允许重新计数，宿主接收序号继续递增。每次取证要求同步之后收到的新回执，同时校验本轮文字、保存 token 和正尺寸；新的回执序号只证明宿主接收顺序，不冒充设备时钟证明。

iOS HMR 回调显式接收当前编译与同步代次。现有生命周期检查继续使取证期间的新编译、重启或热更新失败阻断通过；结构 JSON 与截图共同保存 `runId`、步骤、token、代次和接收序号。截图颜色、比例、目标区域变化等原断言保持不变。成功证据种类为 `runtime-structure-and-visual-style-marker`。

注入使用正式 Vue SFC/template AST 定位逻辑脚本与真实 view，再用 TypeScript AST 扩展对象成员；已有生命周期、methods 和 setup 返回值保留。纯模板页面允许添加适配器所需脚本，TS setup 的桥接脚本保留原语言，已有 renderjs 不充当逻辑 script。所有注入只发生在本轮临时源码，既有项目恢复事务负责回滚，观察器按任务资源生命周期释放。

## 验证

本轮在 macOS arm64、Node 24.18.0、pnpm 12.9.1 的独立 worktree 上验证；以下结果包含基线之后尚未提交的本次修复，不能把基线 SHA 当成已经包含修复的源码。

- 依赖通过任务专用 pnpm 安装，`pnpm install --frozen-lockfile --ignore-scripts --prefer-offline` 通过。新增两个 Vue 编译器 devDependencies 复用 `catalog:vue3` 的 3.5.43，锁文件仅增加根 importer 的六行，不升级解析结果。
- 定向命令：`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/runtime-structure.test.ts e2e/runtime-structure-injection.test.ts e2e/hbuilderx-ios-runtime.test.ts e2e/hbuilderx-ios-hmr-completion.test.ts e2e/app-marker.test.ts e2e/app-visual-lifecycle.test.ts e2e/hbuilderx-app-process-cleanup.test.ts e2e/hbuilderx-alias-consumers.test.ts e2e/hbuilderx-hmr-lifecycle.test.ts --update=none --silent`。9 文件、138 项通过，无跳过。
- 回归执行生成后的探针脚本，检查底层 DOM/UniElement 返回值变化、空查询和清理；使用正式 SFC 编译器检查 TS setup 桥接，覆盖注释、嵌套 template、属性中的 `>`、已有 renderjs、纯模板及当前 iOS 用例源码。CLI、设备 API 和截图进程仍由测试替身提供，不属于原生设备通过证据。
- 修改文件 ESLint 通过。`pnpm exec tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2023 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --esModuleInterop --types node e2e/hbuilderx-local/runtime-structure/index.ts` 通过。
- 对受改入口及其依赖采用相同严格类型选项比较基线与候选，补齐工作区构建产物后的最终结果均为 83 项诊断。唯一原始消息差异是未改的 `packages/postcss/src/selectorParser/rule-transformer/unsupported-pseudos.ts:58` 同一 `TS2322` 中 union 成员显示顺序变化，没有新增语义诊断；整个入口类型检查仍未通过，不写成全仓类型通过。
- 生成的 UTS 探针对本机已安装 HBuilderX SDK 的真实声明做 TypeScript 检查，生成文件无诊断；空探针基线与候选均有相同的 45 项 SDK `uni-cloud/unicloud-db/index.ts` 诊断。这只检查声明兼容，不执行 UTS 原生编译。
- 独立只读审查使用本机 SDK 的 `parseVueCode` 预处理 renderjs，再执行其 SFC `compileScript` / `compileTemplate`，三个当前 iOS 用例生成源均通过；源码清单在编译探针前后保持一致。该检查仍不等价于完整 HBuilderX 编译或设备验收，原始记录保留在本轮 artifacts 的 `sdk-compiler-review/`。
- 原始定向日志和类型差异报告位于本轮忽略目录 `e2e/.artifacts/ios-runtime-structure/`。入口收集曾因独立 worktree 缺少构建产物失败，补建 `postcss-calc`、`css-compat`、`engine`、`source-scan` 后完成上述回归。纯模板边界由既有 alias 清理回归暴露，修复后原断言通过。
- 未调整持久 demo、样式预期或 static 基线；本次只修改 E2E 取证与开发依赖，不修改公开包行为，不新增包版本 change intent。

## 适用边界

真实普通 uni-app 和 uni-app x 的 iOS 编译、首次运行、HMR 及结构 JSON/截图联合取证仍待主任务重新预检后执行。SDK 声明检查、正式解析器检查和测试替身均不能替代原生编译或设备截图；本记录保持 `partial`，不宣称本机扩展矩阵通过。

仍需同时满足本轮产物和原生命周期门禁。严格 HMR 场景发生原生重启继续失败，原本显式声明 `native-reload` 的场景按既有语义验收。本文补充结构取证边界，保留上一轮视觉证据记录的历史结论。

## 规则评估

不新增 AGENTS。已有“本轮保存标识、运行时结构与截图同时成立”的要求足够；通过适配器边界、严格完成契约和持久回归落实。
