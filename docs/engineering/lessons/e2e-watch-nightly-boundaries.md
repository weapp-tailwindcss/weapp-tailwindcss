---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38085811295
baseline: e976c47772afcdaea3cbe674c84b5146f7d6edc7
regressions:
  - e2e/hosted-workflow-contract.test.ts
  - e2e/demo-workflow-command.test.ts
  - e2e/demo-workflow-process-identity.test.ts
  - e2e/demo-workflow-process-observer.test.ts
  - e2e/demo-workflow-observer-memory.test.ts
  - e2e/demo-workflow-windows-observer.test.ts
  - e2e/demo-workflow-windows-cleanup.test.ts
  - e2e/demo-workflow-sampling.test.ts
  - e2e/demo-workflow-short-process.test.ts
  - e2e/demo-workflow-native-cancellation.test.ts
  - e2e/demo-workflow-cancellation.test.ts
  - e2e/demo-workflow-cooperative-budget.test.ts
  - e2e/snapshot-source-path.test.ts
  - e2e/apps-generator-mode-compare.test.ts
  - e2e/uni-app-app-js-misescape.test.ts
  - e2e/taro-dev-signals.test.ts
  - packages/postcss/test/generated-framework-selectors.test.ts
  - packages/weapp-tailwindcss/test/bundlers/generator-css-deferred-selectors.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-universal.integration.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-uni-rule-removal.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-memory-sampler.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-web-cleanup.unit.test.ts
  - packages/weapp-tailwindcss/test/ci/workflows.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-regression.unit.test.ts
  - packages/weapp-tailwindcss/test/ci/release-metadata/git-fixture.test.ts
  - packages/weapp-tailwindcss/test/ci/watch-issue33-snapshot-gate.test.ts
---

# Watch 与 Coverage Nightly 的执行边界修复

## 症状

[E2E Watch 38085811295](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38085811295) 有 24 个失败 job。Web、主包和分包 shard 实际都从完整小程序轮次开始；Windows weapp-vite 的主包已通过，但命令在首个分包中途达到 840 秒总超时。Taro 已输出带 ANSI 颜色的 `built in …`，就绪检查仍超时。复杂 corpus 的 group 选择器没有进入最终 CSS。

[Coverage Nightly 38089432046](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38089432046) 的 Windows static 出现 20 文件、41 项失败，Linux/macOS Node 22 达到 45 分钟 job 上限而被取消。Linux Node 24 全部通过，其中 static 用时 1748 秒，随后多平台构建再用时 433 秒。

## 根因与纠正

- Watch 的 nightly step 漏传矩阵的执行 profile。PR 与 nightly 改为共用 YAML anchor 的完整环境映射，回归直接读取实际 workflow，检查参数、artifact 身份唯一性与 shard 覆盖。
- Windows weapp-vite 的完整主包、两个分包串行共用一段命令预算。按已有 scope 拆成主包与分包 job，保留全部 mutation 与 issue33 轮次；两个分包按两段独立 workload 分配总预算，单次更新阈值保持原值。
- Coverage 的整个顶层 static 集合串行运行，新增编译器、watch 和进程生命周期回归不断累积。每个 OS/Node 组合按相同规则划为四片，保持每片串行，在不同 checkout 执行。框架矩阵和多平台构建每个 host 仅执行一次。
- Windows 对所有阶段使用 shell，导致原生 Node 命令的空参数和特殊字符被重新解释。原生命令直接 spawn，pnpm 复用现有 CLI 身份适配器。真实子进程验证空参数、中文、引号及 shell 字符。
- 进程清理不能仅凭历史 PID。采集初始出生身份，停止前再次比较启动时间；独立后代测试先确认登记成功，再释放父进程。
- 文件系统路径与快照标识混用。glob 结果在进入文件读取时还原原生路径；CSS 来源先区分 POSIX/Windows 语义，再在报告边界转为逻辑路径。跨盘、根路径、UNC、相对路径和项目外来源均有回归；JSON 输出解析后比较字段，模块路径通过 realpath 比较身份。
- Taro 就绪信号直接对 stdout/stderr 的任意 chunk 匹配，ANSI 颜色和分块会破坏 `built in …` 的边界。改为两个流分别缓存完整日志行、消除 ANSI 后识别编译、watch 与错误信号；保持原稳定窗口和超时门槛。
- Tailwind 的复杂 group 变体包含 universal 选择器。框架的 `postcss-html-transform` 在最终小程序兼容转换前删除该规则，导致 JS 中存在已转译 class，而最终 CSS 缺失。PostCSS 所有者在生成阶段展开嵌套后，仅准备带 class 的规则中的 universal 元素选择器，保留原始 utility 身份；框架过滤完成后仍由最终阶段转译 class。配置经生成编排显式传递，覆盖 legacy/nested、自定义选择器列表、`universal:false`、classless preflight 与增量组装，真实 Vite 的 weapp/alipay 构建验证框架输入及 CSS/JS 产物身份。
- watch corpus 对小程序按既有语义移除的 `@supports` 与 hover 工具类漏声明预期，但应保留的 group 规则也缺失。为实际使用 complex corpus 的 Gulp、Mpx、Taro mutation 补齐明确移除合同，继续验证这些类在消费方的身份与条件结构确实消失；group 必须保留 CSS，不能加入移除名单。Taro Vite Vue 模板恢复全量类名断言。
- Nightly 的临时 uni CLI、Lynx WASM 诊断和原生会话祖先路径问题，见[专项复盘](e2e-nightly-wasm-fixtures.md)。
- 首轮 PR head `b4239a1ea5af9b3f22d9c92ccd992b338289d6b1` 的 [PR Gate 38110762945](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38110762945/job/114386645312) 暴露 4 项已有工作流合同未同步：原 static 命令、未声明的 hot-update override、nightly 的性能确认开关和 PR 固定 Node 22 的 artifact 表达式。新增 E2E 合同通过不能替代原合同检查。同步原测试后，按解析后的 YAML 实际矩阵逐行还原环境、命令与 artifact，验证分片完整、scope 互斥、严格预算和实际 Node 版本身份，不以某一段旧表达式字符串作为行为证明。
- 后续 head `0be08166231418ea142637d028063a435edb7df1` 的 [Watch 38115113180](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38115113180) 中，Windows Node 22/24 的分包 issue33 内层均已通过，外层仍要求未执行的主包 script 快照。外层改为依据已验收报告的实际载体检查本轮增删改元数据，逐个分包验收，排除命令启动前的旧快照；主包仍保留 template/script 三阶段要求。生产者显式保存与报告一致的原始 `sourceIdentity`，显示路径继续保留用于诊断；验收三阶段均按不透明来源身份匹配，不借宿主路径或时间戳 marker 推断载体。真实失败产物重放、缺阶段及同 marker 错误来源拒绝与边界见[快照 scope 复盘](watch-issue33-snapshot-scope.md)。
- 同一 head 的 [Coverage 38115119083](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38115119083) 暴露生成器比较入口遗漏的统计基线；按实际恢复的 group 样式限定同步 CSS、README 和三份报告，详见[生成器基线复盘](coverage-nightly-generated-group-baselines.md)。Ubuntu Node 22/24 与 Windows Node 22 的差异一致，未放宽断言或改变样式生成行为。
- Windows static 的模拟 POSIX 根路径测试通过被改写的 `process.platform` 选择是否调用真实文件系统，混用了声明的平台和绑定真实宿主的 native realpath。以默认 `node:path` 实现的对象身份界定真实宿主，外平台 fixture 只解析逻辑路径。
- Windows 的“独立后代”回归实际创建非 detached 子进程，父退出时由 Job 管理终止，无法执行合作恢复。fixture 改为真正跨平台 detached/unref 后代，并在父 close 后明确验证后代仍已登记、源码仍处于修改态；只有取消触发恢复并确认退出后才通过。
- 正常短命令约 50 毫秒退出时，`runStep` 立即用 2 秒清理截止收紧已经启动的 5 秒身份采集。Windows 冷 PowerShell 的首轮扫描因此被中止。正常退出先停止新增采样，等待已开始的有界采集落定，再进入原清理预算；取消和采集失败仍立即停止。保留原采集/清理绝对截止，覆盖慢首次扫描、取消期间迟到拒绝和身份失败，不放宽预算。
- Windows shard 1 的取消夹具只报告握手文件 ENOENT，原入口忽略 stderr，无法从该日志独立还原活动 CLI 分支。确定性构造 Windows pnpm 包装入口后，证明夹具替换为原生 `node -e` 时错误继承 `shell:true` 会在写文件前语法退出；先复现 SIGINT/SIGTERM 两例失败，再以 `shell:false` 恢复原生参数语义。测试保留 error/exit/stderr，隔离与取消语义无关的活动 CLI 身份；文件握手后还等待真实采集同时登记本体与独立后代，再取消。CLI 身份仍由专门命令回归验收，没有放宽启动轮询或进程预算。
- head `de3c9f448a265bf6023f3b6a73633b598426de2b` 的 [Coverage Windows shard 2](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38117862257/job/114408980241) 在 499 项通过后仍有 1 项失败：正常短命令已经结束，首次 `Get-CimInstance` 查询超过原 5 秒采集截止；紧接的相同探针约 0.4 秒完成。此前生命周期修复只消除了 2 秒清理截止对在途采集的收紧，每次查询冷启动 PowerShell 的机制仍存在。改为业务 spawn 前准备本轮专属采集器：15 秒基础设施准备预算内完成真实 CIM 查询，并按同一 parser 验证采集器本体 PID 和出生身份；准备失败或取消时不启动业务。准备数据丢弃，运行与清理复用热采集器，每次重新查询必要身份字段，继续保留从请求入队计时的 5 秒采集和 2 秒清理绝对截止，超时后不重启续预算。所有退出路径确认采集器回收；坏响应、流错误、异常退出和迟到响应均使会话失效，空范围不能掩盖采集器故障。准备耗时不计入业务阶段报告。
- 同一 `record` 的身份采集后紧接内存采样，原内存实现也逐轮新启 PowerShell；仅复用身份查询会保留第二个冷入口。内存采样一并使用同一热会话和固定操作，身份与内存准备共享上述 15 秒总截止，运行内存查询仍受原 5 秒截止约束。测量中的 cwd/命令匹配保留原统计范围，不用于进程归属或清理。原脚本在后代遍历中赋值 `$pid`，命中 PowerShell 大小写不敏感的只读 `$PID`；统一改用任务变量 `processPid`，两个入口共用内存脚本，真实父子进程回归核对实际 PID。协议显式使用无 BOM UTF-8，保留中文诊断。
- 同一 head 的 [Taro React 完整 Watch](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38117853346/job/114406359206) 两次 Web 内容更新均超时。原文案同时覆盖图标与内容选择器断言，不能独立证明图标 CSS 丢失；真实 TSX 两阶段候选提取显示，Web 默认探针将类写入 JS 注释，而增量收集按设计排除注释。首次注入依赖完整扫描偶然读取注释，第二轮的新内容类没有进入增量生成。Web 探针改为复用真实模板载体，保留新鲜内容标识与 `CSS.escape` 精确身份断言，并保留最后一个具体缺失项及 CSS 证据；不修改产品候选收集来消费注释。
- Watch 工具的独立 Windows 内存脚本也存在只读 `$PID` 冲突，并每秒通过无截止的 `spawnSync` 阻塞 HMR 循环。采样改为异步单飞，查询仅请求原指标所需字段，按绝对截止接受结果；停止时只取消并确认持有的探针退出。没有有效样本时，case 与项目报告明确记录 `availability: unavailable`，显式 RSS 或增长预算直接拒绝验收，不能用零值放行。探针回收失败属于资源错误，必须阻断任务；Web 收尾复用既有逐项清理器，在恢复源码、关闭浏览器或停止会话失败后仍继续其余清理，并聚合原始 HMR 与回收错误。
- head `8bf8ec37565e3e0e11eb31b3743e7237acac13ae` 的 [PR Gate 单测分片 3](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38126901880/job/114437723451) 有 3107 项通过，仅临时 Git 仓库的 `afterEach` 回收出现 `.git` 的 `ENOTEMPTY`。直接调用都是 `execFileSync`，但同步命令结束不证明继承外部策略启动的维护写者已经退出。真实 Git 低阈值 incremental 策略确定性触发旧夹具的 9 个 maintenance、pack-objects 和 commit-graph 子任务；原日志未记录 Trace2/PID，不能从删除错误反推具体后台 PID。共享 helper 从首次 init 起按命令关闭自动 maintenance/gc，临时仓库持久设置同样的 local 配置，使 helper 外的原生 Git 消费方也受控。回归显式同步维护任务以安全验证旧实现失败、新实现无写者；保留原删除错误传播，不增加删除重试，不修改用户 Git 配置。

## 验证

- head `683bcb402ab7d97b57dd864451d4f263224e193d` 的 Coverage Windows 四分片完成后，仅 shard 1 的 SIGINT/SIGTERM 两项取消回归失败。测试的 25 毫秒合作窗口被直接作为热 CIM 查询预算，100 毫秒的正常查询使唯一采集会话失效，后续原 2 秒清理窗口无法核对独立后代。合作窗口改为只决定何时转入强制清理，查询仍受原 5 秒上限和预先固定的“合作起点 + 合作窗口 + 2 秒”绝对截止约束；跨边界查询消耗已有预算，不能重开清理窗口。继续等待已登记的独立后代，主进程先 close 不能提前强杀正在恢复源码的后代；默认合作期可提前确认全部退出。
- 采集器 close 在退出已确认后仍重抛历史查询 fatal，外层把同一错误误标为新增回收失败。按对象身份遍历 cause/errors 图去重，循环图不阻断查询；同文案的不同错误不合并。真正新增的 kill/reap 错误继续聚合并阻断，顶层消息和阶段报告保留 SIGINT/SIGTERM 与收尾原始原因。`e2e/demo-workflow-cooperative-budget.test.ts` 固化 25/100 毫秒失败边界、独立后代自然退出和不续借总截止；observer memory 回归覆盖历史错误与新回收错误的区别。
- Windows 内存协议单测此前仅由 Ubuntu 单测消费，Windows 专属项没有执行入口。将 `test/watch-hmr-memory-sampler.unit.test.ts` 接入原 Windows compatibility step，显式 `--update=none`，工作流合同直接读取该执行 step；先复现缺失入口，再验证接入后合同通过。真实 Watch 的非零样本证据与该单测的执行结论分别记录。
- 合作/query 分离修复的 `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow e2e/preflight-report-output.test.ts --testTimeout=30000 --update=none`：152 项通过、2 项 Windows 专属未在本地 macOS 执行。最终错误循环图补充后的 19 项定向用例、修改脚本和测试严格 ESLint、定向 TypeScript 均通过。Windows compatibility 合同与 memory sampler 定向 2 文件：61 项通过、1 项 Windows 专属未执行；`actionlint .github/workflows/ci.yml` 通过。原 `workflows.test.ts` 强制取消 ignore 的 lint 存在 46 项历史诊断，准确 `683b` 基线与新增三行合同后诊断逐项相同，新增 0；该强制 lint 不能记为全文件通过。
- 同一 `683b` 的 Benchmark Taro React 原 3 次 build/3 次 HMR、5% 阈值下，远端构建中位数 +8.54%、插件 +7.42% 失败；其余四框架与 Synthetic Gate 通过。前一 `de3` 与该提交的产品源码、demo、依赖和 Benchmark 消费入口完全相同，而同一 `e976` 基线跨 run 构建中位数也升高 32.39%。保留两轮完整原始样本，在本地 Node 22.22.3/macOS 以同配置作一次有限对照：构建 +0.40%、插件 +4.03%、HMR +0.19%、HMR 插件 +1.93%，guard 无违例，未复现远端热点差异。不据此断言基础设施噪声，也不制造性能补丁或放宽阈值；由下一准确 head 的正常 Benchmark 继续验收，不重跑旧 head 掩盖失败。
- 主工作树合入后，`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow-cooperative-budget.test.ts e2e/demo-workflow-observer-memory.test.ts e2e/demo-workflow-cancellation.test.ts e2e/demo-workflow-process-observer.test.ts e2e/demo-workflow-short-process.test.ts --testTimeout=30000 --update=none`：5 文件、59 项通过，包含真实 SIGINT/SIGTERM 父子进程取消、短命令及确定性采集预算。修改的 5 个脚本/测试严格 ESLint、`pnpm agents:check`、`git diff --check` 通过。本轮未启动本地全面测试或操作 IDE 登录态；最终准确提交的全部远端结论保存在 PR 验证记录中。
- `8bf8ec3` 的 [Coverage Windows 四片](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38126952190) 全部实际通过：static 1720 项通过、59 项既有平台/设备/专项条件跳过；修复相关的真实 SIGINT/SIGTERM、合作预算、错误分类和 PowerShell 协议均未跳过。shard 1 的框架矩阵 18 项与 54 个多平台构建及 catalog 检查 55 项通过。[同提交完整 CI](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38127089962) 的 Windows Node 22/24 compatibility 各 9 文件、358 项通过、无跳过，分别实际执行 sampler 的 17 项与真实 PowerShell 子行夹具。上述阶段证据不代替最终新 head 的全矩阵验收。
- `8bf8ec3` 的 [Uni Benchmark](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38126901739/job/114433167918) 原 3/3 配置下，插件中位数 2589→2721 毫秒（+5.09849%），runtime 阶段 411.652→516.075 毫秒，CSS 阶段仅 +7.37 毫秒；内存、产物和缓存计数门禁通过。Benchmark 直接使用自身同步采样器，不消费本次异步 observer；runtime 扫描链路与 `e976`/`683b` 相同。一次 Node 22.22.3/macOS 有限对照使用 `CI=1 WEAPP_TW_HMR_MEMORY_DEBUG=1 pnpm perf:guard -- --baseline-ref e976c47772afcdaea3cbe674c84b5146f7d6edc7 --build-runs 3 --hmr-runs 3 --timeout 180000 --poll-interval 30 --only demo-uni-app-vite-tailwindcss-v4__mp-weixin`，原 guard 无违例：构建 -4.62%、插件 -5.47%、runtime -5.30%、HMR +0.64%、HMR 插件 +3.94%。额外两项候选来自框架生成的随机 `u-i` 属性，归一化该属性后 WXML 一致，八份 WXSS 逐字节一致。错误使用 debug=0 的先行样本仅保留为诊断，不作为原配置证据。本地结果不能证明 Ubuntu 环境噪声；保留远端失败和全部原样本，不制造性能补丁、追加采样或放宽门槛，交由仅变更 Git 夹具后的正常 Benchmark 作有限确认。
- Git 夹具合入后的 `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/release-metadata/git-fixture.test.ts test/ci/release-scope.test.ts test/ci/version-pr-route.test.ts --update=none`：3 文件、76 项通过。独立实现树的严格 ESLint、定向 TypeScript 与 diff 检查通过，另有独立只读审查；最终提交重新执行 PR Gate、完整 Watch、Coverage 和 CI，旧提交成功不沿用。

- `pnpm install --frozen-lockfile`、`pnpm --filter weapp-tailwindcss... run build`：通过。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/hosted-workflow-contract.test.ts e2e/snapshot-source-path.test.ts e2e/snapshotUtils.test.ts e2e/tailwind-patch-extraction.test.ts e2e/uni-app-x-toolchain.test.ts e2e/frameworkIdeDiagnostics.test.ts e2e/demo-workflow-command.test.ts e2e/demo-workflow-cancellation.test.ts e2e/demo-workflow-native-cancellation.test.ts e2e/demo-workflow-process-identity.test.ts e2e/demo-workflow-short-process.test.ts e2e/demo-workflow-windows-cleanup.test.ts --update=none`：12 文件、135 项通过。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-app-js-misescape.test.ts --update=none`：8 项通过，真实 App/H5 构建保留业务字符串和安全类，原有快照匹配。
- Vitest 实际 BaseSequencer 的只读分片检查：223 个当时已发现文件分为 56/56/56/55，集合完整且无重复。不执行测试主体。
- `actionlint .github/workflows/e2e-watch.yml .github/workflows/e2e-coverage-nightly.yml`：通过。
- 合并后 `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-framework-universal.integration.test.ts test/bundlers/generator-css-deferred-selectors.test.ts test/watch-hmr-uni-rule-removal.unit.test.ts --update=none`：3 文件、80 项通过，含真实 Vite 两平台与 full/incremental 配置流。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/generated-framework-selectors.test.ts --update=none` 与 `test/mini-program-generated-css.test.ts`：分别 9 项、45 项通过。
- 合并后 `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/taro-dev-signals.test.ts e2e/hosted-workflow-contract.test.ts --update=none`：2 文件、17 项通过。
- `CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_SKIP_HBUILDERX=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/gulp-tailwindcss-v4.test.ts e2e/mpx-tailwindcss-v4.test.ts e2e/taro-vite-react-tailwindcss-v4.test.ts e2e/taro-vite-vue3-tailwindcss-v4.test.ts e2e/taro-webpack-react-tailwindcss-v4.test.ts e2e/taro-webpack-vue3-tailwindcss-v4.test.ts e2e/uni-app-vite-tailwindcss-v4.test.ts e2e/subpackage-uni-app-vite-tailwindcss-v4.test.ts e2e/weapp-vite-tailwindcss-v4.test.ts --update=all`：仅对这 9 个项目重生成 static，34 项通过。97 份文件重写后只有 Taro Vite React 普通分包 WXSS 增加 8 行 group utility 规则，与此前缺失样式的根因一致；其余基线不变。相同命令改为 `--update=none` 再次构建，9 文件、34 项全部通过。
- `pnpm architecture:check`、`pnpm release status`、目标源码与测试 ESLint：通过。中文 patch intent 覆盖 `@weapp-tailwindcss/postcss` 与 `weapp-tailwindcss`，不手动改版本号。
- `CI=1 E2E_WATCH_CASE=taro-vite-react-tailwindcss-v4 E2E_WATCH_MINI_PROGRAM_ONLY=1 E2E_WATCH_MINI_PROGRAM_SCOPE=main-package E2E_WATCH_TIMEOUT_MS=60000 E2E_WATCH_COMMAND_TIMEOUT_MS=600000 E2E_WATCH_MAX_PLUGIN_PROCESS_MS=10000 E2E_WATCH_MAX_ATTEMPTS=1 E2E_WATCH_SAVE_SNAPSHOTS=1 TARO_E2E_WATCH_NATIVE=1 pnpm e2e:watch e2e/watch/hot-update/demo/taro-vite-react-tailwindcss-v4.test.ts e2e/watch/taro-demo-dev.test.ts --update=none`：真实 dev 就绪与主包热更新 2 文件、2 项通过，耗时 109 秒。模板/脚本均完成 baseline、complex、hex 轮次，content 完成 issue33 增删改，样式与主样式通过；complex 轮次继续核对 group 的消费与 CSS。报告为 `e2e/benchmark/e2e-watch-hmr/2026-10-11T04-05-34-435Z-taro-vite-react-tailwindcss-v4.json`。
- `CI=1 E2E_WATCH_CASE=gulp-tailwindcss-v4 E2E_WATCH_MINI_PROGRAM_ONLY=1 E2E_WATCH_MINI_PROGRAM_SCOPE=main-package E2E_WATCH_TIMEOUT_MS=60000 E2E_WATCH_COMMAND_TIMEOUT_MS=600000 E2E_WATCH_MAX_PLUGIN_PROCESS_MS=6000 E2E_WATCH_MAX_ATTEMPTS=1 E2E_WATCH_SAVE_SNAPSHOTS=1 pnpm e2e:watch e2e/watch/hot-update/demo/gulp-tailwindcss-v4.test.ts --update=none`：真实主包 watch 通过，耗时 32 秒。模板 complex corpus 按明确合同移除条件规则，同时保留 group；模板、脚本、样式和回滚均通过。报告为 `e2e/benchmark/e2e-watch-hmr/2026-10-11T04-07-17-708Z-gulp-tailwindcss-v4.json`。
- 两轮真实 watch 完成后，`git status --short` 只剩本任务的 static 基线与复盘，源码恢复；按专属工作树 cwd 检查，无遗留测试进程。本轮没有浏览器资源。
- 首轮 PR 失败合同对应 `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/workflows.test.ts test/watch-hmr-regression.unit.test.ts --update=none`：2 文件、161 项通过，未修改 workflow 的执行门槛、预算或测试集合。
- 合入后 `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/watch-issue33-snapshot-gate.test.ts test/ci/workflows.test.ts test/watch-hmr-regression.unit.test.ts --update=none`：3 文件、182 项通过。
- 合入后 `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/snapshot-source-path.test.ts e2e/snapshotUtils.test.ts e2e/demo-workflow-command.test.ts e2e/demo-workflow-sampling.test.ts e2e/demo-workflow-short-process.test.ts e2e/demo-workflow-native-cancellation.test.ts e2e/demo-workflow-process-identity.test.ts e2e/demo-workflow-windows-cleanup.test.ts --update=none`：8 文件、107 项通过，含真实短 Node、参数透传、独立后代合作恢复和 2200 毫秒慢首轮探针。
- 显式生产者来源身份补充后 `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/watch-issue33-snapshot-gate.test.ts test/watch-hmr-regression.unit.test.ts --update=none`：2 文件、139 项通过，含 23 项快照验收与实际 metadata 工厂回归；目标文件以 `eslint --no-ignore --max-warnings=0` 严格检查通过。
- `CI=1 E2E_WATCH_CASE=weapp-vite-tailwindcss-v4 E2E_WATCH_ROUND_PROFILE=issue33 E2E_WATCH_MINI_PROGRAM_ONLY=1 E2E_WATCH_MINI_PROGRAM_SCOPE=subpackages E2E_WATCH_TIMEOUT_MS=320000 E2E_WATCH_COMMAND_TIMEOUT_MS=1680000 E2E_WATCH_MAX_PLUGIN_PROCESS_MS=6000 E2E_WATCH_MAX_ATTEMPTS=1 E2E_WATCH_SAVE_SNAPSHOTS=1 pnpm e2e:watch e2e/watch/hot-update/demo/weapp-vite-tailwindcss-v4.test.ts --update=none`：真实分包 watch 1 项通过，202.86 秒。两个分包均完成 baseline、complex、hex、issue33 增删改和新增类回归，外层通过本轮源码身份与六份成功阶段元数据验收。报告为 `e2e/benchmark/e2e-watch-hmr/2026-10-11T06-15-24-087Z-weapp-vite-tailwindcss-v4.json`；结束后源码恢复，按本工作树 cwd 检查没有遗留 Node 测试进程。
- 合入取消夹具补充后 `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow-cancellation.test.ts --update=none`：5 项通过，确定性覆盖 Windows fallback 的 shell 属性与 SIGINT/SIGTERM 真实登记后代取消；目标文件严格 ESLint 通过。
- 合入热采集器后 `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/demo-workflow e2e/preflight-report-output.test.ts --testTimeout=30000 --update=none`：19 文件、144 项通过；1 文件中的 2 项真实 Windows PowerShell 协议/父子内存采样测试在 macOS 未执行，必须由新 head 的 Windows CI 验收。17 个修改/新增脚本与测试严格 ESLint 通过。
- Web Iconify 的 18 项实际候选提取和诊断回归，以及重建当前工作树依赖后的真实 Taro React Web watch 通过；热更新 382 毫秒、回滚 330 毫秒，保持原 420 秒阶段截止。结束后源码字节恢复、headless Chromium 与构建进程全部回收，完整命令见 [真实源码消费位置复盘](watch-web-iconify-source-consumer.md)。本次探针没有永久修改 demo，无新增 static 基线。
- 合入异步内存与 Web 收尾后，`CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-web-iconify.unit.test.ts test/watch-hmr-web-iconify-candidates.unit.test.ts test/ci/watch-issue33-snapshot-gate.test.ts test/watch-hmr-regression.unit.test.ts test/watch-hmr-memory-sampler.unit.test.ts test/watch-hmr-web-cleanup.unit.test.ts --update=none`：6 文件、177 项通过，1 项 Windows 专属协议在 macOS 未执行。严格 ESLint、`pnpm agents:check` 与 `git diff --check` 通过；真实异步采样与逐项收尾结果见 [内存探针复盘](watch-memory-probe-lifecycle.md)。
- 最终 head `b069566031f47d4f5deaabe88554d8188de72025` 的 [Coverage shard 2](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38148666256/job/114497339039) 在 562 项通过后，`e2e/demo-workflow-exit-lifecycle.test.ts` 的超时回归观察到探针调用 `[80, 1]`，并非业务逻辑失败。首次扫描已耗尽 80ms 清理截止，边界调度又发起 1ms 查询，使“耗尽预算后不再调度”依赖毫秒级抖动。`process-tree.ts` 现在把剩余不超过 1ms 视为不可建立有界探针，直接结束查询并保留原清理错误；正常退出、SIGINT/SIGTERM 和原生取消 3 文件 10 项回归通过。该修复不延长总截止、不重试已耗尽探针。
- 2026-10-19，head `8275b88881c7f52a9c8301e7a72b2530932b1144` 的 [Windows dev startup](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39213484075/job/117932043565) 在业务启动前失败：PowerShell 5.1 宿主于 4.065 秒发出 ready，首个 memory 请求写入后 15 秒仍无 `request-received`。这段采集器源码与该 PR 基线一致，属于既有基础设施故障；旧日志不能区分 `ReadLine` 未返回和 JSON cmdlet 的隐式模块发现阻塞，尚不能将其中一种写为已确认根因。新增纯 .NET 的 `request-line-received`，以 Base64 原始行与同一 PID 的在途请求逐字节关联，在 JSON 解析前立即冲刷；篡改、重复、错序、过期或未知请求均使会话失效。JSON 模块改为按 `$PSHOME/Modules` 中的宿主 manifest 显式导入，JSON 命令限定 `Microsoft.PowerShell.Utility`，消除未限定命令的模块发现。15 秒准备、5 秒运行采样和退出确认边界均未改变。真实 Windows 结果仍需新 head 的 CI 验证，不能由 macOS 的协议回归宣称原故障已恢复。

本次 observer 输入边界修改在 macOS 执行了定向回归：Watch 的 `watch-hmr-observer-input`、`watch-hmr-memory-source`、`watch-hmr-memory-sampler` 3 文件 45 项通过、1 项既有 Windows 用例未执行；E2E 的 process-observer、windows-cleanup 和 observer memory/startup/diagnostics/shutdown/lifecycle/windows-observer 合计 8 文件 97 项通过、2 项既有 Windows 用例未执行。均使用 `CI=1`、`--update=none`；严格 ESLint、`pnpm agents:check` 与 diff 检查通过。未执行本地全端验收。

## 适用边界

独立复核还覆盖了外层剩余 2ms、实际扫描时剩余 1ms 的竞态。预算准入统一在实际扫描、终止前身份复查和 Windows 终止命令入口重新计算，外层检查不能替代实际调度检查。确定性 Linux/Windows 回归保留首次真实超时，只允许原 80ms 截止内的首个探针，不能延长截止或把清理失败改成成功。

集成验证：`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts --update=none e2e/demo-workflow-cleanup-budget.test.ts e2e/demo-workflow-exit-lifecycle.test.ts e2e/demo-workflow-process-identity.test.ts e2e/demo-workflow-windows-cleanup.test.ts e2e/demo-workflow-process-observer.test.ts e2e/demo-workflow-cancellation.test.ts e2e/demo-workflow-native-cancellation.test.ts`，7 文件、53 项通过。新源码与回归严格 ESLint、`pnpm agents:check` 和 diff 检查通过。

本轮本地执行定向回归与受影响构建，没有启动全仓或全端验收，没有操作微信 IDE 登录态。Windows 路径与进程表分支通过明确平台输入的回归覆盖；本机不提供真实 Windows runner，修复后的 hosted 全矩阵结果需要由对应工作流验证。旧 head 的成功和条件跳过均不能作为新实现已通过的证据。

## 规则评估

不新增 AGENTS 规则。现有跨平台路径、命令身份、回归和测试范围约束已覆盖这些边界；把具体执行映射和进程身份要求固化成可执行测试，避免继续重复扩充规则。
