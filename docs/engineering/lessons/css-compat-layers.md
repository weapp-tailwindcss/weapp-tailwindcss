---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1280
baseline: 276ac5a3be2dab0ac16ccd366aeda11937251a3e
regressions:
  - packages/weapp-tailwindcss/test/ci/verify-packed-packages.test.ts
  - packages/css-compat/test/package-paths.test.ts
  - packages/css-compat/test/boundaries.test.ts
  - packages/weapp-tailwindcss/test/ci/css-compat-workflow.test.ts
  - packages/weapp-tailwindcss/test/ci/ensure-built-css-compat.test.ts
  - packages/css-compat/test/layers.test.ts
  - packages/css-compat/test/architecture.test.ts
  - packages/postcss/test/cascade-layers-legacy.test.ts
---

# #1280 首期：独立 CSS layer 内核与验收

## 症状

原 PostCSS 包包含生成器、扫描器和 optional native 安装依赖，原生 CSS 或 Panda 消费者仅使用 layer helper 也会带入这些依赖。旧 anchor 算法保留层首次出现之前的规则位置，且不拆分 important：相同权重下，层之前的未分层普通声明和跨层 important 的结果都可能偏离原生 CSS；单纯重排规则也不能修复跨层 specificity 倒置。

## 根因与纠正

新增 `@weapp-tailwindcss/css-compat@0.1.0`，公开根入口、`/layers`、`/diagnostics` 和 `/legacy`，分别提供 ESM/CJS 及对应声明。ordered 显式选择，层树、注册身份和编译 plan 保持内部；普通与 important 分开排序，父层直接声明的隐式层顺序也随之反转，同层 fallback 不反转。

命名层通过 CSS tokenizer 解码后匹配，匿名层使用 Symbol。冲突分析按属性登记低优先级层的代表权重，分别处理普通/important；简写表由固定 `mdn-data@2.37.2` 生成。MDN computed 描述计算值，并非完整简写元数据；生成阶段显式补全 font-variant、font-synthesis、white-space、text-box、marker、view-timeline，stroke、vertical-align 和 line-clamp 采用保守 wildcard。不能将 syntax 引用自动解释为长写关系。selector list、逻辑/物理属性和未知语法采用保守诊断，不能证明所有选择器是否相交。全部检查成功才提交克隆输出；任何错误保留原 AST 与节点身份。诊断和 PostCSS warning 使用原节点定位，覆盖合并多文件的相关来源。

属性名先用 tokenizer 解码，自定义属性保留大小写；grid-gap、word-wrap、page-break 等别名映射到同一属性身份。ordered 拒绝所有未展开 import，点分层名禁止点号两侧独立空白；合法注释及转义终止空白保留。命名 descriptor 按类型解码标识符及 keyframes 字符串，身份不明的跨层定义保守诊断。新增边界回归先确认 24 项失败，MDN 补全回归另确认 11 项失败，再通过修复验证。

PostCSS 原 `consumeCascadeLayers` 只转导出 `/legacy`，保留旧输出；Tailwind 默认策略与 preflight/theme/components 等适配行为继续由原包负责。新内核的运行时闭包只有必要的 CSS 解析及权重分析依赖，MDN 原始数据仅为开发依赖；bundled 依赖的授权文本随 tarball 提供。

## 验证

验证日期为 2026-10-09 至 2026-10-10，已 rebase 到 main `276ac5a3be2dab0ac16ccd366aeda11937251a3e`，保留 main 的 repoctl 5.9.0、既有锁文件解析及 PR 取消生命周期修复；分支 `codex/css-compat-layers`；环境为 macOS arm64、Node 24.18.0、pnpm 12.9.1、Vitest 5.0.3。所有普通单测均使用 `CI=1`、`--update=none`，未更新已有 demo 或 E2E static 基线。首期没有改动这些项目，fixture 为新包的独立 CSS 语义测试。

持久 fixture 包含 issue 的六个探针和 [Panda #155 固定提交的浏览器 layer fixtures](https://github.com/weapp-pandacss/weapp-pandacss/blob/9d27162358fb54f70e9653540bbfa83ff4bd743e/e2e/web/layers.spec.ts)，以及转义别名、大小写 at-rule、匿名身份、descriptor、来源映射、strict 原子性和重复处理等回归。

通过的定向命令：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @weapp-tailwindcss/postcss... build
pnpm --filter @weapp-tailwindcss/css-compat build
pnpm --filter @weapp-tailwindcss/css-compat typecheck
CI=1 pnpm --filter @weapp-tailwindcss/css-compat test --coverage.enabled=false
CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/cascade-layers-legacy.test.ts test/mini-program-css.test.ts test/mini-program-generated-css.test.ts test/pipeline.test.ts --update=none --coverage.enabled=false
pnpm --filter @weapp-tailwindcss/css-compat properties:check
pnpm --filter @weapp-tailwindcss/css-compat test:package
pnpm --filter @weapp-tailwindcss/css-compat test:consumers
pnpm --filter @weapp-tailwindcss/css-compat test:browser
pnpm --filter @weapp-tailwindcss/css-compat bench
pnpm architecture:check
pnpm agents:check
node scripts/check-package-readmes.mjs
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/css-compat-workflow.test.ts test/ci/ensure-built-css-compat.test.ts test/ci/workflows.test.ts test/ci/workflow-gate-cancellation.test.ts test/ci/verify-packed-packages.test.ts --update=none --coverage.enabled=false
pnpm exec eslint packages/css-compat/src packages/css-compat/scripts scripts/architecture/css-compat.ts scripts/architecture/audit.ts scripts/architecture/client-boundaries.ts
pnpm release status
git diff --check
```

- 新包的 4 个测试文件、127 项单测与架构回归通过；受影响 PostCSS 的 4 个测试文件、105 项测试通过。旧 facade 是 legacy 的同一函数，ESM/CJS 构建 facade 也验证旧 anchor 输出。
- 属性生成检查覆盖 672 个属性；生成检查比较 JSON 内容，避免格式空格导致伪失败。生产源码与 manifest 的架构门禁拒绝反向依赖、扫描/生成器/native、Node 文件读取和源码逃逸，并禁止客户端运行时引入此构建内核。
- workspace 外 tarball 为 96,493 字节，四个入口使用裸包 import/require 消费；独立 `.mts/.cts` 在 `strict: true`、`skipLibCheck: false` 下通过。实际安装依赖树没有 Tailwind、Panda、Babel、engine、scanner、native、LightningCSS 或 MDN。PostCSS 打包后将 workspace 依赖改写为 `0.1.0`。
- 纯 CSS 消费目录与 Panda 生成目录分开。weapp-tailwindcss 的实际 v4 engine 生成 `.flex`、`.w-\[13px\]`，Panda 2.1.2 CLI 在关闭 polyfill 后通过 `staticCss` 真实生成四条 utility。原生、Tailwind、Panda 三种 CSS 均经公开 tarball ordered strict 消费，零诊断且保留选择器。Panda 是最小生成 fixture，未覆盖扫描和 recipe/runtime 全链路。
- Chromium 153.0.8010.12、Firefox 155.0、WebKit 26.6：每种引擎对 15 个安全 fixture 在 390/1000 两种宽度对照原生 computed style，并验证 23 个权重反例的差异、诊断与 strict 拒绝，另验证 5 个输入/descriptor 拒绝对照，共 174 次对照通过。全部 `headless: true`，每个引擎仅一个 browser/context/page，均已定向关闭。
- repoctl 记录中文 PostCSS patch intent，计划为 3.4.0 → 3.4.1；下游传播由 repoctl 决定。release status 还包含基线已有 dependency intent，不能将全部待发布变化归因于本任务。未执行版本落盘或发布。
- 冻结安装通过。锁文件保留 main 的既有解析结果，仅新增 css-compat importer、PostCSS workspace 依赖及 MDN 2.37.2 记录。英文/中文 README 和语言切换检查通过；中文 README 随公开 tarball 验证。
- 自动构建在 PostCSS 前构建 css-compat，持久回归覆盖缺失 dist 及只有内核源码变更的失效判断。CI 增加 Linux/macOS/Windows × Node 22/24 包测试、类型和 tarball，Ubuntu Node 24 执行 MDN、真实生成器、三浏览器及无阈值微基准 artifact；PR Gate 汇总强制等待新门禁成功，Release Gate 增加新包过滤。工作流与取消行为的定向回归共 5 文件 66 项通过。

微基准使用实际构建产物，输入包括 parse；每组记录首样本，预热 3 次，采样 10 次，取中位数与最近秩 p95，每次采样前显式 GC。混合输入交替重复层，并在同一规则内混合普通和 important；冲突输入的前半部分为 ID、后半部分为 class。结果如下（毫秒）：

| 规则数 | ordered 混合中位数 / p95 | ordered 冲突中位数 / p95 | legacy 中位数 / p95 | 冲突诊断数 |
| --- | --- | --- | --- | --- |
| 100 | 4.66 / 8.12 | 2.87 / 3.83 | 1.76 / 2.61 | 50 |
| 1,000 | 27.11 / 30.35 | 17.00 / 19.82 | 12.59 / 13.97 | 500 |
| 10,000 | 155.73 / 179.86 | 93.52 / 98.05 | 145.31 / 169.14 | 5,000 |

1 万条混合输入为 528,901 字节，ordered 输出 497,780 字节；该规模首样本分别为 ordered 混合 189.50 ms、冲突 110.87 ms、legacy 114.22 ms。采样观察到的最大 heap 增量分别约 118.2、89.0、41.7 MiB；这是采样边界的 heap 差值，不能当作峰值 RSS。采样期间另有定向 lint/架构检查进程，因此只保留观察数据，不与旧实现作性能优劣结论，不新增耗时阈值。结果证明本组诊断规模保持线性，不代表任意 selector、真实框架构建或 HMR 的性能。

此前解析依赖未构建、生成表格式、warning 类型、规则命令 cwd 和脚本 lint 问题已纠正。本轮还纠正了生成表重新写入后的 lint 格式，并从 lint 命令去掉仓库明确忽略的测试目录。最终定向验收无失败、skip 或环境阻塞；临时安装目录、Panda 探针和浏览器资源全部清理。

## 远端跟进

正式 PR 为 [#1281](https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1281)。首个 head `ee972660ae25c64ad85caff919252cb91fead24d` 的 [PR Gate attempt 1](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37956080432) 发现两项本地 macOS 定向集未覆盖的问题：

- Windows Node 24 job `113907000882`：构建、类型和 125 项内核测试通过，公开 tarball 安装失败。Node 将 runner 的 `RUNNER~1` 路径转为含 `%7E` 的 file URL，pnpm 12.9.1 未还原该路径。特殊物理路径安装回归继续发现 `#` 被 file fetcher 当作 fragment，验证脚本改为统一使用绑定 127.0.0.1 临时端口的 HTTP 路由提供原始 tgz，物理路径只交给 Node fs；成功和失败均 finally 关闭本次 server。新增真实 source、packed、consumer 特殊目录回归覆盖空格、`~`、`#`、`%`、Unicode，并验证安装/require 以及服务关闭。Windows runner 的仓库 D 盘与临时 C 盘也通过此边界解耦，未改变产品运行时或缩小检查。相同根因也确认于 Node 22 job `113907000894`。整合后 127 项测试、公开 tarball、原生/Tailwind/Panda 消费与 lint 本地通过。
- unit shard 3 job `113909823043`：新增公开包后，既有发布清单回归仍断言 38 个包。已在本地复现，更新为 39 并显式检查 css-compat 身份；初始版本仍由本轮 tarball 和 repoctl 验证为 0.1.0。

[Lynx iOS attempt 1](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37956079836) job `113906811413` 在 app 运行前执行 `simctl list devices` 超时 30 秒，保留为 runner 设备发现基础设施故障；不调整产品逻辑或超时门槛。后续只以最终 head 的新 run 判断通过。

## 适用边界

本记录仅确认 #1280 首期包级验收。未执行全面测试预检、真实微信 IDE、框架 demo、设备和多端 E2E；这些属于后续适配阶段，不能将三浏览器证据当作 WXSS/小程序证据。没有修改 Panda 仓库、发布 npm、自动合并或关闭 issue。

后续工作：

1. 由 Panda/Tailwind adapter 显式选择新 ordered API，验证真实 import/build graph 的合并、组件隔离、分包、多入口和 HMR 失效。
2. 适配阶段同步对应 demo 的 static 基线，完成所需微信和设备环境验收，再决定迁移默认值。
3. 分别设计 selector/value、变量安全性、单位和颜色能力；保持 codec、preflight、theme 及 generator/runtime 所有权。
4. 如需跨文件 collect/compile 或 native 后端，先明确级联作用域、输入顺序和语义 parity，再增加公开契约。

## 规则评估

修订根、packages、PostCSS 与主包的已有 CSS 所有权条目，新增 css-compat 包级规则并登记索引；没有放宽生成、构建图、IDE 会话或全面验收门禁。通过架构审计、实际安装树和公开入口消费回归固定边界，避免只靠规则文字维持依赖反转。
