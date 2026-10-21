---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1307
baseline: 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
regressions:
  - packages/weapp-tailwindcss/test/bundlers/generator-css-deferred-selectors.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-processed-css-assets.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-web-gradient.integration.test.ts
  - packages/weapp-tailwindcss/test/postcss/v4.test.ts
  - packages/weapp-tailwindcss/test/v5/web-compat-computed-parity.test.ts
  - packages/weapp-tailwindcss/test/v5/web-compat-runtime-color-composition.test.ts
  - packages/weapp-tailwindcss/test/v5/web-color-declarations.test.ts
  - packages/weapp-tailwindcss/test/v5/tailwind-v4-upgrade-generator-coverage.test.ts
  - packages/postcss/test/color-mix-alpha-semantics.test.ts
  - e2e/color-mix-alpha-browser.test.ts
  - e2e/tailwind-mini-program-alpha-limit.test.ts
  - e2e/tailwind-inventory.test.ts
verification:
  - claim: 新预检通过后全面流程在全量单测失败并停止，不能计全面成功
    kind: integration
    status: failed
    sha: a7b1118e95f9a36763d3b9878c663368dcc19d96
    environment: macOS arm64，Node 24.18.0、pnpm 12.14.0，Tailwind CSS 4.3.3，预检 03c8b9a7-641a-451c-b565-dd12d102d6d0
    command: pnpm e2e:demo:workflow:local --quality --extended --baseline-ref 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5 --preflight-report e2e/.artifacts/preflight/03c8b9a7-641a-451c-b565-dd12d102d6d0/report.json
  - claim: 夹具、来源迁移、渐变与低层快照维护后定向回归通过
    kind: unit
    status: passed
    sha: a7b1118e95f9a36763d3b9878c663368dcc19d96
    environment: macOS arm64，包含随后未提交的测试维护；没有改生产转换逻辑
    command: CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/generator-css-deferred-selectors.test.ts test/bundlers/vite-processed-css-assets.unit.test.ts test/bundlers/webpack-web-gradient.integration.test.ts test/postcss/v4.test.ts --update=none --coverage.enabled=false
  - claim: 静态与动态声明精确断言及原有真实浏览器颜色门槛通过
    kind: integration
    status: passed
    sha: a7b1118e95f9a36763d3b9878c663368dcc19d96
    environment: macOS arm64，当前测试维护，后台 Chromium；原有计算样式、交互与像素门槛未改
    command: CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/v5/web-compat-computed-parity.test.ts test/v5/web-compat-runtime-color-composition.test.ts --update=none --coverage.enabled=false
  - claim: 三浏览器独立参考证明任意动态权重不能直接改写为 rgba alpha
    kind: integration
    status: passed
    sha: a7b1118e95f9a36763d3b9878c663368dcc19d96
    environment: macOS arm64，包含新增测试；后台 Chromium、Firefox、WebKit，创建的浏览器均在 finally 关闭
    command: CI=1 LYNX_THEME_BROWSER=all pnpm exec vitest run --config e2e/vitest.e2e.config.ts e2e/color-mix-alpha-browser.test.ts --update=none
  - claim: 用户确认限制之前的小程序动态 alpha 正向支持合同失败
    kind: integration
    status: failed
    sha: a7b1118e95f9a36763d3b9878c663368dcc19d96
    environment: macOS arm64，限制确认前的工作树；当时该测试文件未修改，未取得原生动态 alpha 运行证据
    command: CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/v5/tailwind-v4-upgrade-generator-coverage.test.ts --update=none --coverage.enabled=false
  - claim: 相同 head 的远端单测重现九项失败，Expo iOS 基线第二帧采集超时
    kind: ci
    status: failed
    sha: a7b1118e95f9a36763d3b9878c663368dcc19d96
    environment: GitHub hosted Ubuntu 单测与 iOS 18.5，实际 checkout 为 merge 82077af66fad87fb0de6810eb2055e076ea8dfe5；没有调度重跑
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39543405533/job/119036342886
  - claim: 用户确认后动态限制、静态边界、清单身份与既有转换门禁定向通过
    kind: integration
    status: passed
    sha: a7b1118e95f9a36763d3b9878c663368dcc19d96
    environment: macOS arm64，随后未提交的测试及清单维护；只计生成/转换产物，不计微信运行或 v2 负向通过
    command: CI=1 pnpm exec vitest run --config e2e/vitest.e2e.config.ts e2e/tailwind-mini-program-alpha-limit.test.ts e2e/tailwind-inventory.test.ts e2e/tailwind-fixtures.test.ts e2e/tailwind-conversion-audit.test.ts --update=none
  - claim: 限制登记后的新预检通过，全面流程仅因遗漏更新 Lynx 静态身份而停止
    kind: integration
    status: failed
    sha: 7ce521de8a8586effb0ecda37cb68c59c96f428d
    environment: macOS arm64，Node 24.18.0、pnpm 12.14.0；预检 e549aabb-d9bf-4240-9c96-62231a2e576f，后台 IAB 真实交互
    command: pnpm e2e:demo:workflow:local --quality --extended --baseline-ref 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5 --preflight-report e2e/.artifacts/preflight/e549aabb-d9bf-4240-9c96-62231a2e576f/report.json
  - claim: 正式重新生成共享身份后，Lynx 示例、真实编码及静态回归全部通过
    kind: integration
    status: passed
    sha: 7ce521de8a8586effb0ecda37cb68c59c96f428d
    environment: macOS arm64，包含随后未提交的两份静态证据更新；未修改历史原生报告
    command: CI=1 pnpm e2e:lynx --update=none
  - claim: 静态身份同步后 Expo Web 三引擎首次渲染及 TSX、CSS HMR 分别通过
    kind: integration
    status: passed
    sha: 7ce521de8a8586effb0ecda37cb68c59c96f428d
    environment: macOS arm64，包含随后未提交的两份静态证据更新；后台 Chromium、Firefox、WebKit 串行执行并清理
    command: CI=1 RN_WEB_BROWSER=<chromium|firefox|webkit> pnpm e2e:react-native:web
---

# 全面验收的动态透明度边界

## 症状

`a7b1118e95f9a36763d3b9878c663368dcc19d96` 的本轮扩展预检、真实原生 Chrome computer use 和 verify 全部通过。57 阶段入口消费新 lease 后，第 1 阶段 root build 71/71 通过；第 2 阶段全量单测为 7 文件失败、966 通过、5 跳过，9 项失败、10,416 通过、1 预期失败、44 跳过。第 3–57 阶段没有调度，独立 Tailwind 15 目标也未执行。

预检报告已 finished、服务已关闭，不能复用。原始全面日志为 `.tmp/full-acceptance-a7.log`；预检报告在 `e2e/.artifacts/preflight/03c8b9a7-641a-451c-b565-dd12d102d6d0/report.json`。历史失败与随后定向成功分开记录，不反推整轮已经通过。

## 根因与纠正

八项失败属于夹具或旧断言维护，逐项审查后修正：

- deferred selector 的三例手造 context 经 `unknown` 强转，遗漏真实入口必填的 `generatorOptions`。测试使用实际配置归一化入口；生产代码不增加掩盖无效 context 的 fallback。
- Vite 所谓“仅注释”夹具实际含重复业务规则和来源协议。新合同分别检查纯注释不注入、真实来源迁入唯一宿主、再次执行幂等；保留来源而不追加 banner 或重复规则。
- 低层 v4 快照仅两处 placeholder 从错误的不透明 `currentColor` 恢复完整 50% mix。审查后同步维护 snapshot 和 `v4-default-output.css`，使用 `--update=none` 复验。它不是小程序终端新增支持的证据。
- Webpack 渐变测试的全 CSS `in oklab` 禁词误中 placeholder mix。改为精确方向声明断言，保留真实导入、watch、未知消费和恢复路径。
- 两份 Web 测试在浏览器启动前全局禁止 `oklch`，误中必须保留的动态 shadow mix。改为精确 selector/property 的全部有序声明及静态 fallback 条件；运行时组合锁定 18 producer、54 基础色、6 个变体/apply 静态合同、16 个动态合同。原 computed、交互、颜色误差和像素断言全部执行并保持原门槛。

剩下一项是实际能力回退，不能靠更新字符串期待消除：`bg-sky-500/(--my-alpha-value)` 的小程序结果只有不透明 `rgb(0, 165, 234)`。Tailwind 4.3.3 的 ColorMix polyfill 在未知权重时先生成不透明基础色，再把原 mix 放入 `@supports`。小程序早期清理删除不能证明等价的 mix，后续清理删除 supports，基础色留存。共用 resolver 不再进行宽松动态 alpha 改写后，这个原有正向合同失败。该首次失败保留为历史证据。

main 和此前 b40 的旧 resolver 会直接覆盖原色 alpha，缺少运行时百分比类型与范围校验。此前全量单测通过不能证明该旧实现语义正确；也不能声称 main 已经同样失败。首次失败后没有自动改为 unsupported；用户随后明确选择“允许登记限制，保留静态百分比支持”，才将这个独立动态案例从静态颜色正向组拆出。

## 验证

夹具、来源、watch 和快照 4 文件 58 项通过；两份真实 Chromium 颜色测试 3 项通过；动态语义三浏览器共 6 项通过。新增 oracle 和原维护集合最终合计 7 文件 71 项通过，no-ignore ESLint、agents 和 diff 检查通过。升级覆盖首次为 16 项通过、1 项失败；经用户确认拆出动态限制后，同一入口 17 项通过，静态颜色的原正向断言保留。

颜色 oracle 另补 10 项回归，拒绝数字 token 合并、大小写敏感变量误认、动态声明后再次追加 fallback、嵌套子选择器冒充父级及媒体条件丢失。只折叠不改变 token 身份的空白；完整有序声明均参与核对，不只比较集合或子序列。新增 oracle 与两份浏览器测试合计 13 项通过。

独立浏览器参考覆盖 20% → 50% → 100% → 20% 恢复、0%、负值、超过 100%、数字、非法与未定义变量，并覆盖原色自身 alpha。`color-mix` 只接受合法百分比权重；`rgba` 接受数字且会截断越界 alpha，不能相互替代。无效变量导致 computed-value-time invalid，删除声明或露出前一条 fallback 也不能证明等价。

新增参考使用可精确表示为 102/255 的原色 alpha 0.4，直接比较计算样式中的 alpha，避免把原色量化和画布舍入混为权重语义。前期 alpha 0.5 夹具在 Chromium 出现 0.100392、WebKit 画布出现 25/26 字节差；这些调查结果不改变原有像素门槛。原有像素测试继续执行。

本轮没有改变 demo、生成器输出或生产逻辑，不重新生成无关项目基线；低层实际 fixture 与 snapshot 的两行差异已同步审查。

### 用户确认后的限制合同

共享 catalog 新增 `weapp-runtime-color-weight` 独立限制，并将原候选加入任意语法生成清单。新的 `e2e/tailwind-mini-program-alpha-limit.test.ts` 隔离候选，核对 Web 的完整有序 fallback/mix 和小程序实际不透明结果；后者只证明动态语义没有保留，不称“终端拒绝成功”。同文件另有 0、25、50、100、小数和带原色 alpha 的静态正向回归；没有修改 resolver 或把全部 var 语法归为不支持。完整静态 root 变量权重仍待验证。

新回归接入 `pnpm e2e:tailwind:contract`；限制、清单、fixture 和既有转换审计四文件 22 项定向通过。统一转换报告要求实际候选级诊断，该案例目前没有这份证据，继续保留 oracle 缺口；没有微信动态权重宿主探针，运行时仍为 not-run。独立测试的负向产物证据不冒充 v2 转换或原生通过。重新全面执行须重新取得扩展预检 lease。

最终复核进一步把颜色值数组改为完整 selector、条件、important 和有序声明合同；静态夹具用 inline 主题消除 `/100` 的未核对依赖。新增子选择器、错误媒体和 important 三项反例后，该独立文件最终 5 项通过，ESLint 通过。

### 同提交 CI 的独立失败

远端 [PR Gate run 39543405621](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39543405621) 的三个单测分片重现本地九项失败，实际 checkout 均绑定 merge `82077af66fad87fb0de6810eb2055e076ea8dfe5`。本轮定向维护不能当成新 head 远端成功。

[Expo iOS job 119036342886](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39543405533/job/119036342886) 的 10 文件 184 项静态合同先通过，运行时随后失败于 baseline `layout-aspect/default` 的 10 秒宿主采集预算。首帧采集到 8,613ms、解码和评估到 8,970ms，几何、像素、control 三项自检通过；第二帧于 9,073ms 开始，截止时未完成。连续帧证据不完整，不能计运行成功；具体宿主根因未明，不归因为基础设施或产品颜色问题。

原 artifact `12320983110` 的完整 ZIP 已核对 SHA-256 `8f5b5e20e9c389e57c6bfb05098c9f41d898a7d226569b1a11ae85ca73b55c09`，14 文件保留在 `.tmp/ci-a7-ios-12320983110.zip`。`*.capture.json` 记录失败阶段 `capture-screenshot`、10,005.709ms 及两帧时序，第二帧只有开始记录。没有修改预算或重跑；此前其他 SHA 的有限重试授权不适用于此 head。

主代理随后用生产 `assessNativePair` 离线重读首帧 PNG 和 pair 坐标，并核对诊断中的字节数、完整 SHA 及三项检查点：几何、像素、control 均通过。结果在 `.tmp/ci-a7-ios-offline/offline-summary.json`；没有制造缺失的双帧 receipt。现有日志没有证明冷启动或截图服务根因，不加入预算外预热来掩盖这次耗时。

### 共享清单变更后的静态身份同步

`7ce521de8a8586effb0ecda37cb68c59c96f428d` 新建扩展预检 `e549aabb-d9bf-4240-9c96-62231a2e576f`，全部脚本探针、当前会话后台 IAB 的输入/点击/完成截图及 verify 均通过。此前原生 Chrome 被用户接管的一轮已单独 block，没有复用；本轮 IAB 临时页在取证后关闭并核对标签列表为空。全面入口消费本轮 lease 后，root build 71/71 通过；全量单测 973 文件、10,435 项通过，1 文件、1 项失败，另有 5 文件、44 项既有跳过与 1 项预期失败。前轮九项失败已不再出现；新失败是共享清单变更后遗漏同步的 Lynx 静态身份。流程停止，第 3–57 阶段及独立 Tailwind 15 目标没有调度，报告已 finished、服务已退出。

同 head CI 的实际 checkout 为 merge `7bd457bd05a3bc27494eb9cb276e1a218b13a844`。Lynx 双端在运行前的合同检查拒绝旧静态身份；Expo Web 三引擎在 `reports.ts` 拒绝 `stale catalog or fixture hash`。这些失败不属于浏览器像素或原生运行成功，也不通过修改 hash 门禁或历史原生报告消除。当前消费者显式绑定全局共享清单，本次没有临时删除不相关字段来换取通过。

串行正式执行 `pnpm e2e:lynx:static:update` 与 `pnpm e2e:react-native:static:update` 后，逐 JSON 叶子及独立审查确认仅更新两份 static 的清单 hash 与生成时间；118 案例、支持预期、声明、raw CSS、manifest、生成类集合、生成输入、版本和 RN fixture hash 均未改变。历史双端报告与基线保持原身份。之后 `CI=1 pnpm e2e:lynx --update=none` 的示例 205 项、E2E 39 文件 785 项全部通过，包括真实开发/生产 encoder、bundle、decoder 以及既有 static 比较。

随后分别执行 `CI=1 RN_WEB_BROWSER=<chromium|firefox|webkit> pnpm e2e:react-native:web`，三个引擎均以退出码 0 完成。各自首次渲染、TSX HMR、CSS HMR 逐项验证 118 案例（31 项既定支持、87 项预声明拒绝）、40 份回执，并通过阶段产物校验；前后截图 hash 均不同。三个 run ID 分别为 Chromium `283e516a-4ef2-4513-9da5-fcb199a12027`、Firefox `b6fe35a3-a733-46d9-9a2e-18e49df5a536`、WebKit `90a2d3d5-ceea-4dd0-a86e-ca58e5d59a13`。这些是 Expo Web 现有夹具的运行结果，不能计作新 head 原生或全部共享注册能力通过；served bundle 等既有缺口不因身份修正而消失。

完整日志保留在 `.tmp/full-acceptance-7ce.log`、`.tmp/static-7ce-{lynx,rn}-update.log`、`.tmp/static-7ce-lynx-verify.log` 与 `.tmp/static-7ce-rn-{chromium,firefox,webkit}.log`；三引擎本轮报告、PNG 和阶段索引在 `e2e/.artifacts/react-native-web-<browser>/`。此次静态重生成不代表 RN/Lynx 新 head 原生通过；再次全面执行仍需重新提交并完成新一轮扩展预检。

## 适用边界

构建时只能安全解析完整依赖图中已证明为 0–100% 字面量的权重。未知运行时变量、局部/条件/注册覆盖、非法和循环依赖不能猜测。`@property` 的 percentage 类型不保证数值范围。

现有小程序 rgba/var/普通 calc 子集没有经过验证的等价动态求值方案。原生保留 color-mix 需要真实宿主能力证据；另一方案是理解变量级联、失效及动态更新的运行时求值层。用户确认的范围仅为未知运行时权重限制，不能延伸到全部静态变量或其它平台。全面验收保持 partial，不复用 lease 或跳过失败阶段继续调度；独立登记与负向产物回归不能抹去原来的全量失败，也不能代替新的完整运行。

## 规则评估

不新增 AGENTS 规则。现有“先失败回归、精确语义断言、禁止放宽支持和证据、全面失败停止”的约束足够；本次纠正测试 oracle 与验证记录。
