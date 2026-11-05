---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1306
baseline: c1c08cafcbdb337d5f33cc6f1ec709e813599c11
regressions:
  - e2e/react-native-runtime-static.test.ts
  - e2e/react-native-encoding-evidence.test.ts
  - e2e/react-native-hmr-resolver.test.ts
  - e2e/react-native-hmr-observation.test.ts
  - website/scripts/check-lynx-contract.test.mjs
  - e2e/skyline-typography-snapshot.test.ts
  - e2e/skyline-typography-static.test.ts
  - packages/postcss/test/scoped-css-string-coverage.test.ts
  - e2e/apps-generator-mode-compare.test.ts
  - e2e/scoped-dark-apply-probe.test.ts
  - e2e/demo-visual-hmr-source.test.ts
  - e2e/template-dependency-contract.test.ts
  - packages/postcss/test/scoped-css-signature-lifecycle.test.ts
verification:
  - claim: 原版本提交触发三浏览器版本身份拒绝及网站版本文档合同失败
    kind: ci
    status: failed
    sha: c1c08cafcbdb337d5f33cc6f1ec709e813599c11
    environment: GitHub Actions Version PR CI attempt 1，Linux Node 24
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41766221747
  - claim: 新生成输入、语义漂移拒绝、三阶段归档及 HMR 原件校验通过 164 项定向回归
    kind: integration
    status: passed
    sha: 20958acde2e7e4373e8fc5f5532ca15826e50013
    environment: macOS Node 24.22.1，基于该提交的未提交修复工作树
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-runtime-static.test.ts e2e/react-native-encoding-evidence.test.ts e2e/react-native-static-entry-scope.test.ts e2e/react-native-phase-evidence.test.ts e2e/react-native-phase-capture.test.ts e2e/react-native-ci.test.ts e2e/react-native-hmr-resolver.test.ts e2e/react-native-hmr-observer.test.ts e2e/react-native-hmr-observation.test.ts --update=none
  - claim: 自有包只升版本不影响文档合同，依赖和基线反例仍然拒绝
    kind: unit
    status: passed
    sha: 20958acde2e7e4373e8fc5f5532ca15826e50013
    environment: macOS Node 24.22.1，基于该提交的未提交修复工作树
    command: pnpm exec vitest run --project=@weapp-tailwindcss/website website/scripts/check-lynx-contract.test.mjs --update=none
  - claim: 临时编译器版本 0.3.5 在三个 Web 引擎完成三阶段报告、输入归档与清理
    kind: integration
    status: passed
    sha: 20958acde2e7e4373e8fc5f5532ca15826e50013
    environment: macOS Node 24.22.1，基于该提交的未提交修复；Chromium、Firefox、WebKit 均为 headless；临时 manifest 已逐字恢复
    command: CI=1 RN_WEB_BROWSER=chromium pnpm e2e:react-native:web; CI=1 RN_WEB_BROWSER=firefox pnpm e2e:react-native:web; CI=1 RN_WEB_BROWSER=webkit pnpm e2e:react-native:web
  - claim: 双语网站构建与 19 项 SEO/GEO 回归成功，四份已提交索引未变
    kind: integration
    status: passed
    sha: 20958acde2e7e4373e8fc5f5532ca15826e50013
    environment: macOS Node 24.22.1，基于该提交的未提交修复工作树
    command: pnpm --filter @weapp-tailwindcss/website build；pnpm exec vitest run --project=@weapp-tailwindcss/website website/scripts/seo-geo.test.mjs --update=none
  - claim: PostCSS 包 2185 项通过、3 项按条件跳过，声明身份新增 60 项回归通过，构建及类型声明通过
    kind: integration
    status: passed
    sha: 20958acde2e7e4373e8fc5f5532ca15826e50013
    environment: macOS Node 24.22.1，基于该提交的未提交修复工作树；未运行 native ABI 专用测试
    command: CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none --coverage.enabled=false; pnpm --filter @weapp-tailwindcss/postcss build
  - claim: uni-app 微信 CSS 重复规则清理后只保留合法 scoped 差异，限定基线更新及普通复验成功
    kind: integration
    status: passed
    sha: 20958acde2e7e4373e8fc5f5532ca15826e50013
    environment: macOS Node 24.22.1，基于该提交的未提交修复工作树；CLI 静态构建，不代表微信 IDE 验收
    command: CI=1 E2E_PROJECT_FILTER=uni-app-vite-tailwindcss-v4 E2E_GENERATOR_PLATFORM_FILTER=mp-weixin pnpm e2e:apps-generator --update=none
  - claim: 修复落到 main 后重新生成版本 PR 并通过当前 head 的完整 CI
    kind: ci
    status: pending
    sha: c1c08cafcbdb337d5f33cc6f1ec709e813599c11
    environment: GitHub Actions，待后续源码 PR 审查合并和自动 prepare
    reason: 本地回归与源代码审查不能替代准确新版本 head 的完整验收，版本 PR 不在本任务的合并或发布授权内
  - claim: Uview 微信和支付宝保留深色产物，两个真实 HMR 流程均完成更新与恢复
    kind: integration
    status: passed
    sha: ccbe038fa04279865e8f8c11157320cc404ceffb
    environment: macOS Node 24.22.1，基于该提交的后续修复工作树；CLI 构建与 watch，不代表 IDE 或设备验收
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-uview-plus-cssentries.test.ts --update=none；定向执行 e2e/watch/uni-app-css-post-hmr.test.ts 的 issue-uview-plus-cssentries 用例
  - claim: 三个独立模板从冻结依赖实际构建成功；声明、锁文件与安装身份错配回归通过
    kind: integration
    status: passed
    sha: ccbe038fa04279865e8f8c11157320cc404ceffb
    environment: macOS Node 24.22.1，基于该提交的后续修复工作树；模板消费已发布 5.6.3，未声称模板支持候选 6.0.0
    command: CI=1 pnpm e2e:canonical-templates --update=none；pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/template-contract.test.ts e2e/template-dependency-contract.test.ts --update=none
  - claim: 签名分配优化保持语义，PostCSS 2186 项通过、3 项条件跳过，构建及类型声明通过
    kind: integration
    status: passed
    sha: ccbe038fa04279865e8f8c11157320cc404ceffb
    environment: macOS Node 24.22.1，基于该提交的后续修复工作树；准确新 head 的正式 Benchmark 仍待执行
    command: CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none --coverage.enabled=false；pnpm --filter @weapp-tailwindcss/postcss build
---

# 自动版本元数据与验收证据的边界

## 症状

合法 prepare 将 React Native 编译器从 `0.3.4` 升至 `0.3.5` 后，Expo Web 三个引擎均在首轮语义报告前拒绝 `Stale RN static evidence or dependency versions`。编译、类型、单测和 Metro 挂载已完成；这是严格版本校验拒绝旧 static 模块，不属于 runner 容量或启动超时。

同一版本提交把 Lynx/core 升至 `0.5.0`/`6.0.0`。网站合同要求六份文档都包含当前包版本字面量，但静态文档保留旧发布版本，导致网站构建和四个单测失败。原日志中 SEO 与 21 项 GEO 回归先成功，不能把此故障归为此前的中文索引写脏。

原生 iOS/Android 也在成功挂载后报相同 static 版本拒绝。另一个 Skyline 静态构建只出现四组 `u-i` 前缀变化：上游对绝对源码 filename 哈希，CI 与本机 checkout 根目录不同，原快照直接固化了本机路径身份。

应用生成门禁还有独立真实缺陷：仅有 `@reference`/`@apply` 的 HelloWorld 组件保留了根样式两条中文 `before:content` utility。原始 artifact 显示根样式使用中文字面量，而组件中的等价字符串被 Sass 序列化为 CSS 十六进制转义，旧覆盖比较误认为内容不同。

后续静态门禁暴露三处验收边界问题。Uview 的生成器输出仍含深色媒体规则，但 DCloud 在平台未声明 `darkmode` 时主动删除它；可视 HMR 报告仍向新 API 传裸 `replace` 字段；独立模板把自身锁定的已发布 5.6.3 与工作区候选 6.0.0 直接比较。另有 Canonical Templates 的构建四项成功，但随后支持矩阵检查发现 Vapor 的 app-ios/H5 两行尚未同步到双语生成文档。

源码 PR 首轮 Benchmark 还发现 Uni HMR 插件 P95 和 weapp-vite RSS 回归。后者在反向顺序确认后仍超原阈值，不能当作容量故障；签名热路径检查发现同一声明重复 tokenize、嵌套 JSON 字符串反复转义，以及空覆盖索引仍解析声明的额外工作。

## 根因与纠正

发布版本属于本轮输入来源信息，兼容基线描述已审查的生成语义。运行时直接复用已提交的完整 static 报告，把两者绑在同一份版本字符串上，使正常升版必然使证据过期。

每次 Web/原生运行先用当前编译器和实际依赖重新生成独立 JSON，再与已提交基线严格比较。只允许编译器发布版本、生成时间和宿主环境信息不同；候选、CSS、manifest、独立入口、逐项结果、目录/夹具身份以及外部依赖必须一致。普通回归不写入已提交快照。

Metro 显式 resolver 只重定向原构建图已确认的 static 模块，保留其它解析、原 resolver 接收者和 HMR 观察链。模块摘要进入缓存身份，实际使用的模块字节进入每阶段 encoding 归档，归档版本再次与运行报告对账。新增 resolver 原件同时进入原生 HMR 源码身份、生产者归档和离线验证；缺失、篡改及重算伪造摘要均拒绝。

Lynx 文档改为链接两个包的权威发布元数据。合同继续要求入口链接、Node 范围、必装依赖递归、peer、示例固定依赖和真实设备基线；自有包只升发布版本不再要求改写静态说明。

Skyline 测试使用当前 demo 的上游哈希校验明确的四个未 scoped 源文件及组件顺序，只替换已经验证的身份前缀。编译器 module id 的 Windows 斜杠转换位于明确边界，不改磁盘路径；数量、错误来源、组件序号和其它模板内容仍严格拒绝。scoped 身份保持原样，快照更新限定为该项目。

CSS 覆盖证明改在 PostCSS 所有者内按 token 比较声明：只对 String token 使用准确解码值，其它 token 身份、注释和顺序保持保守比较。选择器 scoped 清理不再应用到声明文本；规则和 at-rule 对账包含条件祖先。声明合并必须保持顺序且不存在同属性冲突，不能用无序集合掩盖反向覆盖。Tailwind 真实生成与 `@source inline` 语义不变。

Uview 在微信和支付宝各自的平台 manifest 内显式启用 `darkmode`，不通过环境变量强制绕过平台配置。探针只用相同 Vue scope 的主体直接声明证明状态，媒体条件必须为正向 dark；冲突值、附加条件和旧色残留均拒绝。可视 HMR 按同文件身份传递完整 mutation，与 marker 一次保存；严格 mutation 校验与逐字恢复保留。

模板合同核对唯一业务锁文档、声明所属字段、逐字 specifier、稳定 resolved version、registry integrity 和 peer snapshot；冻结安装后再核包名、版本与模板自身 node_modules 的物理归属。工作区候选代码继续由工作区产品测试验收，不能用旧模板依赖的成功声称候选大版本的模板兼容。删除无消费者的 local-link 模式，避免静默更换实际被测包。

签名优化限定在单次操作内复用不可变值 token，内部保留 tuple，最终 key 只序列化一次。声明 key 复用于各索引，空索引无需构造失败证明。AST 容器、声明属性及祖先每次重读，不能因缓存而忽略清理后的子树或条件变化。

## 验证

先保存准确版本 head 的原始 job/check/annotations、日志和三浏览器 artifact。首次失败、后续修复与新 head 的结果分别记录，旧失败不改为成功。

新增 Metro 配置与 resolver 身份后，显式运行 `pnpm e2e:react-native:static:update`，基线差异仅为 fixtureHash 和生成时间。定向只读回归、示例测试与构建通过；文档 GEO 索引重生成无变化。完整运行结果与后续版本 PR 验收分别登记，不用单测代替原生设备证据。

临时把编译器版本升到原失败的 `0.3.5` 后，三个 Web 引擎均实际完成 baseline/tsx-hmr/css-hmr、118 项结果和三阶段归档，清理 settled；manifest 与 HMR 源文件已精确恢复。双语站点构建和 19 项 SEO/GEO 回归通过。本次没有执行本地原生设备验收。

CSS 新回归的首批 48 项在原实现上有 31 项失败；修复后新增 60 项与包内全部普通测试通过（2185 通过、3 条件跳过），类型校验由实际 `build` 入口内的 TypeScript 编译完成。定向应用产物从 3 个选择器恢复为 1 个；剩余 16 字节为必须保留的 Vue scoped 类。仅对 uni-app 微信项目显式更新 CSS、摘要和报告基线，再以 `--update=none` 复验成功；未放宽快照内容或重跑原失败 CI。

Uview 显式重生成限定项目的 static 基线，没有受跟踪快照差异；普通模式双平台复验与真实 watch 更新、回滚、关闭均通过。支持矩阵按原生成器同步，四份 GEO 索引不变，双语网站构建通过。首次 HMR 本地尝试因并发网站构建暂时清理 env dist 而失败，保留该记录，构建结束后顺序复验通过。

签名优化后包内 2186 项通过、3 项条件跳过，新增生命周期回归覆盖删除子规则、修改声明与媒体条件。两份真实 CSS 共约 33.6KB 的定向 100 轮 CPU profile，从约 508ms 降至 276ms，进程峰值 RSS 从约 241MB 降至 165MB；这只是局部优化证据，不能代替准确新 head 的正式 Benchmark 或完整版本验收，阈值与超时保持原值。

## 适用边界

该处理只允许发布元数据与已审查且重新生成相同的语义内容分离。真实 CSS、manifest、入口、外部依赖或基线变化仍要求显式审查和更新。当前版本 PR 的失败不能靠重复审批、重跑成功矩阵、手推受管分支或放宽版本检查解决；修复必须先经过源码 PR/main/prepare，再验证准确新 head。

## 规则评估

不新增 AGENTS 规则。现有禁止正常回归自动更新快照、受管版本分支和按准确 head 验收的要求已经覆盖本例；补充持久回归以落实这些边界。
