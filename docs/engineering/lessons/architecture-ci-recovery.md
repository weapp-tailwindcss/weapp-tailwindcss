---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1228
baseline: d3a7df78b83a96ea53319dbd9d0274faad762dc6
regressions:
  - packages/engine/test/v4.module-cache.test.ts
  - packages/engine/test/module-requests.test.ts
  - packages/tailwindcss-config/test/reload.test.ts
  - packages/weapp-style-injector/test/index.test.ts
  - packages/weapp-tailwindcss/test/context/handlers.test.ts
  - packages/weapp-tailwindcss/test/tailwindcss/v4/rpx-theme-warning.test.ts
  - packages/weapp-tailwindcss/test/vitest/vite.test.ts
  - packages/weapp-tailwindcss/test/ci/verify-packed-packages.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-watch-dependencies.test.ts
  - packages/engine/test/extraction.project-concurrency.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-source-scan-css-entries.test.ts
---

# 架构重构后的 CI 修复

## 症状

PR Gate 的三个单测 shard 与 Release Gate 失败。测试仍 mock PostCSS 根入口、断言旧发布包数量或遗漏新增 types 子路径。Vite 的第二次构建快照仍预期空 CSS，与稳定缓存必须保留样式的行为冲突。

性能门禁同时报告 Mpx 插件耗时增加 85.40%，Taro Webpack 构建和 HMR 内存超限，uni-app Vite 插件耗时增加 8.53%。首次本地三次构建、三次 HMR 对照也复现 Mpx 插件 487ms 到 882ms，不能归因为远端偶发波动。

## 根因与纠正

修正测试使用的能力入口及发布清单。Vite 用同一输入连续构建，直接断言两次 CSS 非空、包含预期样式且完全相同，再更新旧空快照。

此前为修复配置变更关闭全部 Jiti 缓存，并将所有绝对模块请求转成相对请求。Tailwind 对相对请求执行 cache-busting 和依赖遍历，多次编译、扫描及 design system 加载重复付出成本。现保留 Jiti 按源码哈希缓存的转换结果，执行结果仍不缓存。

仅恢复转换缓存后，Linux CI 的 Mpx 冷构建插件仍从 1272ms 增至 1763ms。进一步检查发现强制转译 CommonJS 仍会引入转换器冷启动，而且禁用 Jiti moduleCache 不能清除原生 require 的间接依赖缓存。最终改为读取前清理配置及本地辅助模块图，CommonJS 原生加载，ESM/TS 由 Jiti 按语法决定转换。Jiti 包装父节点可能只被原生辅助模块的 parent 引用，清理时补充该关系；不清空已安装第三方依赖。

引擎以稳定绝对路径标识本地 config/plugin，在异步调用上下文内复用最多 128 个模块，按本地依赖文件内容计算指纹。首次 CommonJS 加载复用已加载的 require 依赖图；ESM、TS 及变更后的模块通过 Tailwind 原有加载器处理。每次复用仍向编译器报告依赖，显式会话失效清空对应加载状态。原有全局加载 hook 被保留，引擎外请求不受接管。

回归覆盖 CJS、MJS、TS、配置的间接依赖，以及保持文件长度和 mtime 不变的内容更新。ESM 的原生缓存协议通过构建后的 CJS 引擎验证，避免 Vitest 模块执行器代替真实 Node 加载器。

新提交在 Linux/Windows 的默认工具类回归中暴露无 package.json 目录的边界：Node findPackageJSON 返回模块文件本身，不能直接按 JSON 读取。只在返回路径确为 package.json 时判断 type，其他情况交给原生模块加载和 CommonJS 依赖图判定。增加无清单目录的 JS 配置重载回归；同一主包失败用例修复前失败、修复后通过。

提交 8860422a9 的 Linux 性能门禁再次报告 Mpx 插件冷构建变慢；同一 SHA 有限重跑仍从 1135ms 增至 1694ms，不能归因为偶发噪声。CPU 对照发现新增 AsyncLocalStorage 在生成调用完成后一直保持启用。Node 22.23.2 的独立 Promise 微基准分别为未启用 7.7ms、调用结束但未停用 22.6ms、显式停用后 6.8ms。生成缓存现记录并发调用数量，最后一个调用结束后才执行 disable，成功和异常路径均释放；这只证明消除了上下文持续跟踪，实际构建收益仍以 demo 性能门禁为准。

释放上下文后，三个 demo 各三次构建和 HMR 对照中，Mpx、Taro Vite 通过原判定，Taro Webpack 总构建仍慢 7.32%，HMR RSS 也超限。进一步对比真实 compilation 发现，新增目录依赖直接取配置来源的 base，将整个项目根目录纳入 Webpack 递归快照；CPU 采样同步出现额外文件哈希与 realpath 开销。现通过共享扫描包展开 brace 和 glob 静态前缀，监听真实来源目录，并把不存在的目录注册为 missing dependency。Taro 对照确认根目录监听被替换为配置指向的 src，未硬编码项目目录布局。

## 验证

提交 9aaf6fe92 的 Linux 门禁仍报告 Mpx 插件中位数 1612ms 到 2660ms，以及 Taro Webpack 插件耗时和稳态 RSS 超限；Taro Vite、uni-app Vite、weapp-vite 分片通过。不能用此前本地 Node 22.19 的通过结果覆盖这次失败。与 CI 相同的 Node 22.23.2 本地三次对照也复现 Mpx 627ms 到 1021ms。

分阶段诊断发现：候选报告逐文件 await 读取，使 Webpack 并行编译的同步工作反复插入扫描过程；CSS 来源缓存命中时仍等待异步 stat，进一步延迟来源准备。现候选读取以每批最多 32 个文件并发执行，按枚举顺序提取并记录读取失败；配置元数据使用与 CSS 读取相同的同步边界。70 文件回归先在串行实现失败，再验证并发有界、读取乱序、单文件删除及报告顺序；缓存回归覆盖配置修改、删除和重建。

本轮使用 Node 25.6.1、pnpm 12.4.1，在独立 worktree 执行，正常 Vitest 运行均设置 CI=1 和 --update=none。

- 原失败的 context、rpx warning、packed manifest 定向组 36 项通过；injector 导出组 89 项通过。
- Vite 构建组 4 项通过，2 项已有条件跳过。真实 Webpack/Rspack/Gulp 及主包/PostCSS 来源生成契约通过。
- engine 定向包测试 173 项通过；补充模块格式与扩展名省略后的缓存和路径组 13 项通过；配置包 11 项通过。受影响 engine/config 构建、engine 类型检查及修改生产文件 ESLint 通过。测试文件按仓库配置不参与 ESLint。
- Mpx、Taro Webpack、uni-app Vite、weapp-vite 四个 static 目标运行 -u 重建 44 份快照，无版本库差异；随后相同目标以 --update=none 复验，19 项通过。
- 正式性能复验使用 perf:guard、基线 5e96fdc16ffe5a9c872ebb243e47372c2f2b09ed、三个原失败目标、build-runs=3、hmr-runs=3。Mpx 插件中位数 511ms 到 600ms，样本差异未满足阻断置信条件；Taro 插件稳态 P95 717ms 到 783ms，另有 Taro/uni-app HMR 内存四项超限，门禁未通过。
- 对相同构建产物执行 current 到 baseline 的反向顺序 HMR 定向复测：内存超限未再现，Taro 插件稳态 P95 774ms 到 878ms，继续定位，不能将整体性能门禁记为通过。原始报告保存在忽略目录 .tmp/architecture-ci-performance-fixed。
- pnpm architecture:check：34 个包、1280 个生产源码文件通过；pnpm agents:check、pnpm release status 和 git diff --check 通过。
- 使用 Node 22.19 复验全部 engine 测试，178 项通过；主包 v4-engine.test.ts 的 62 项通过。engine 构建、typecheck、源码 ESLint 及架构和规则检查再次通过。
- 与 CI 相同主版本的 Node 22 下，Taro 三次 HMR 的稳态插件 P95 为基线 898ms、当前 888ms，未再现 Node 25 的耗时超限；该次 RSS 仍超限，需结合远端独立复测判断，不记为整体通过。
- 配置加载器本地依赖图修复前，CJS/ESM/TS 的间接依赖更新用例失败；修复后配置包 15 项通过。主包 v4 engine、主包/PostCSS 共享来源与真实构建器共享来源共 97 项通过；配置包构建和源码 ESLint 通过；架构检查覆盖 1281 个源码文件。
- 原生配置加载修复后，Node 22.19 的正式 perf:guard 对照通过：三个目标各三次构建、三次 HMR，沿用原阈值与统计规则，零阻断项。插件冷构建中位数 Mpx 596ms 到 548ms、Taro Webpack 4340ms 到 4330ms、uni-app Vite 1097ms 到 1127ms；总构建时间仍有波动，未宣称每个原始样本都更快。报告位于 .tmp/architecture-ci-performance-native。
- 后续 CI 新增失败的 Taro Vite 使用同一隔离产物补做三次构建、三次 HMR，并用原 evaluatePerformanceGuard 评估通过；插件构建中位数 3047ms 到 2991ms，稳态 HMR P95 1755ms 到 1669ms。

上述批次有重叠，不累加为全仓测试数量。新提交远端门禁状态另行记录。

- 异步上下文释放回归修复前失败，修复后 Node 22.23.2 的引擎 179 项测试、构建、类型检查、源码 ESLint 和架构检查通过。回归同时验证一个并发调用结束不会使另一个调用丢失配置上下文，以及异常结束仍会释放。
- 来源目录回归修复前错误监听项目根，修复后 watcher 与 runtime classset loader 共 20 项通过；真实 Webpack/Rspack/Gulp 及主包/PostCSS 共享生成契约 35 项通过。主包构建、修改源码 ESLint、架构检查、agents:check 和 git diff --check 通过。覆盖多目录 brace、绝对 glob、重复目录去重、负规则、缺失目录、禁用自动扫描及默认扫描。
- 有限并发读取修复后，Node 22.23.2 的 engine 180 项测试、类型检查和构建通过；主包来源/缓存/真实构建器组 35 项与 CSS 来源/生成组 39 项通过，新增配置生命周期组所在文件 6 项通过。修改源码 ESLint、架构检查及规则检查通过。
- 使用同一 perf:guard 隔离工作树更新 engine/主包产物后，执行 run-matrix.mjs，Mpx 与 Taro Webpack 各三次构建、三次 HMR。Mpx 插件中位数 602ms 到 426ms，Taro Webpack 4412ms 到 4161ms；Taro Webpack 原 evaluatePerformanceGuard 判定通过。Mpx 首次 RSS 超限，保留于 .tmp/scan-concurrent-performance.json；一次反向顺序确认的插件中位数 633ms 到 420ms，RSS 样本不再满足阻断置信条件，原判定通过，报告 .tmp/mpx-memory-confirmation.json。确认附带 Jiti/进程退出诊断，不将本地 RSS 波动解释为内存已改善，最终仍检查独立 CI runner。
- 性能修复后，Mpx 与 Taro Webpack 独立 static 文件的 12 项通过。额外生成模式对照发现 Taro Webpack H5/compact 分片补出源码中的有效 border 候选及依赖变量，原报告未覆盖；限定 E2E_PROJECT_FILTER=^taro-webpack-react-tailwindcss-v4$ 执行 apps-generator-mode-compare.test.ts -u，重建 21 份基线，仅 7 个文件有差异，再以 --update=none 复验 11 项通过。保留主包和分包隔离断言，未修改 demo 源码。
- static 初次误用聚合脚本时，部分测试未消费项目过滤变量而扩大调度，已中止且不计为通过；后续直接传入具体 Vitest 文件。设备/IDE 全面预检仍未通过，不以该中止批次或定向 static 替代全端验收。

## 适用边界

提交 1a67f5066 的性能分片首次 uni-app 构建耗时失败，一次失败项复测后耗时通过，但 HMR 峰值和稳态内存均超限，反向顺序确认仍失败，未继续重跑同一提交。本地分配采样显示重复 CSS AST 和 Tailwind 编译对象分配；会话在候选删除时重建编译器的同时重复创建 design system。现在仅重建累积候选的编译器，同一会话复用未失效的 design system；源码和依赖失效仍完整刷新。

新增回归先确认删除候选重复加载 design system，再验证复用、删除后样式消失、重新添加恢复和依赖失效刷新。Node 22.23.2 的 engine 181 项、构建、类型检查和生产源码 ESLint 通过。uni-app 三次构建、三次 HMR 的原 evaluatePerformanceGuard 判定通过：插件构建中位数 1160ms 到 1186ms，HMR RSS 峰值 906.22MB 到 801.27MB、稳态 886.88MB 到 789.06MB。保留 .tmp/uni-session-memory.json 原始数据；本地通过不能替代新提交的 Linux CI 结果。

Lynx iOS 首次在 simctl launch 阶段失败，一次失败项重试通过，未修改设备兼容性断言；新提交仍需检查独立工作流结果。

缓存属于生成引擎的模块加载，不共享候选集合或 CSS 会话结果；会话释放仍独立进行。使用 Tailwind Node 的加载 hook 与依赖缓存协议，升级 Tailwind 时需要复验这些测试。未放宽性能阈值、跳过失败用例或改回官方样式生成插件。

本地全端预检仍受微信 AppID、HBuilderX 实例和设备环境阻塞，未执行全面设备与 IDE 验收。PR 保持 Draft；定向 static 不替代设备验证。

## 规则评估

不新增 AGENTS 规则。现有先复现、补回归、静态基线复验、性能有限复测及按当前 PR head 追踪 CI 的规则已覆盖本次问题，补充持久测试与证据即可。
