---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1214
baseline: 7fa8c3ac8243e6468a407622ea173c86a3a51ed4
regressions:
  - packages/postcss/test/handler.cache.test.ts
  - packages/postcss/test/mp.test.ts
  - packages/weapp-tailwindcss/test/context/style-options-snapshot.test.ts
  - packages/postcss/test/calc-auto.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-auto-rpx-calc.test.ts
  - e2e/issue-1214-rpx-calc.test.ts
  - e2e/issue-1241.test.ts
  - e2e/issue-1241-watch.test.ts
  - e2e/issue-1214-ide.test.ts
  - e2e/issue-1241-ide.test.ts
---

# Issue #1214：微信固定 rpx 主题的默认自动计算

## 症状

npm 5.5.10 在显式 cssCalc 下已能输出最终 rpx，但默认配置仍保留运行时乘法。此前独立发布包验证在微信 DevTools 中测得工具类宽高32px、直接32rpx对照16px，padding/gap为4px对2px。此记录不覆盖或删除此前发布版证据。

## 根因与纠正

配置入口过早把未指定值归并为false，后续平台解析和Vite延后阶段无法区分默认行为与用户退出。新增cssCalc:'auto'，保留未指定状态，在明确微信v4时选择自动模式；嵌套配置优先，显式false、true、白名单和对象的语义保持独立。

CSS解析和归约归PostCSS所有。自动模式只选择安全的rpx长度及其别名，只替换能完整归约为rpx的calc；普通var、其他单位、数字标量变量和未知表达式不被顺便展开。保留细小长度精度。完整作用域标记默认缺失，未提供完整上下文的单文件处理只归约字面量。

Vite在作者插件完成后使用本轮产物图，保留原始表达式到最终阶段，计算后再转换单位。完整作用域每轮分析一次，结果只在本轮资产之间共享，不写入生成缓存。未知CSS导入及消费元数据缺失都会阻止自动推导。watch从实际复用的资产恢复原始表达式，退出自动模式也不留下旧常量。

真实页面样式回归揭示了仅凭CSS导入图判断隔离的缺口：全局工具类和页面WXSS没有导入边，但宿主会共同加载。最初自动实现错误生成32rpx，而页面有--spacing:3rpx覆盖。现自动模式保守纳入同轮全部CSS资产；局部、条件、冲突、循环、未知依赖和property注册阻止静态化。即使产物实际隔离，不同值也可能保守阻止自动计算；不能为追求静态化率而猜测源码目录或布局。显式配置沿用原作用域策略。

## 验证

本轮使用独立工作树和当前工作树构建产物，Node24.18.0、pnpm12.6.0；未以旧npm包替代本地修复。最初新增PostCSS回归12失败、Vite默认策略回归2失败；修复后重新验证。

定向命令设置CI=1，普通验证均为--update=none。主要入口：

```sh
pnpm --filter weapp-tailwindcss... run build
pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none
pnpm --filter weapp-tailwindcss exec vitest run test/context test/bundlers/vite-auto-rpx-calc.test.ts test/bundlers/vite-final-css-calc.test.ts --update=none
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1214-rpx-calc.test.ts e2e/issue-1214-rpx-calc-watch.test.ts e2e/issue-1214-author-css-watch.test.ts e2e/issue-1214-layout-static.test.ts e2e/issue-1241.test.ts e2e/issue-1241-watch.test.ts e2e/issue-1241-layout.test.ts --update=none
pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.build.json --noEmit --noCheck false --pretty false
pnpm architecture:check
pnpm agents:check
pnpm release check
pnpm release status
```

#1214真实构建固定uni-app 3.0.0-5020620260917001（Compiler5.26）、Vue3.5.43；#1241保留原Issue的uni-app 3.0.0-5010520260709002（Compiler5.15）、Vue3.5.42；两者均Tailwind4.3.3、Vite5.2.8。#1241允许通过E2E_ISSUE_1241_DEPENDENCIES复用已安装精确框架版本；helper核对版本，插件始终链接当前工作树。

static更新限定上述Issue用例加-u；新增7份默认主题基线和独立页面覆盖基线，原default的8条calc改为最终rpx；watch增加页面覆盖增删两个阶段。原有显式配置、动态覆盖等基线仍保留。更新与不更新复验日志分开保存，不能把更新快照当作验收。

单独IDE入口需E2E_IDE=1及E2E_PREFLIGHT_WECHAT_CLI：运行e2e/issue-1214-ide.test.ts和e2e/issue-1241-ide.test.ts。每轮核对新marker、当前临时项目、DevTools后端、同批原生矩形和截图。未开启全端全面测试，没有复用历史预检放行。

本轮原始日志集中在e2e/.artifacts/issue-1214-auto/，真实产物身份、watch对照和IDE截图分别在e2e/.artifacts/issue-1241/与e2e/.artifacts/issue-1214-ide/。

### 最终本地结果

- 通过：PostCSS 110文件、1167测试；主包定向30文件、268测试。既有跳过分别为3和1，不计为通过。
- 通过：两个受影响包构建及声明生成、主包严格类型检查、架构、ESLint（0错误）、规则与change intent检查；四个修改的中英文页面MDX编译和配置/翻译完整性检查。
- 通过：本轮非更新static运行中其余6文件的37项断言，以及随后单独不更新复验的18轮watch，共38条定向E2E测试完成。先前聚合运行有1条watch失败，不能将该次命令本身写成全绿；失败和上游对照见下文。
- 通过：最终串行DevTools复验2条测试完成，单入口8rpx及双入口1/2/3/8rpx的尺寸与直接rpx对照一致。DevTools2.02.2609231、基础库3.16.3、WebView、窗口390、DPR3；双入口宽高分别16/33/49/133px，padding、正负margin、gap均一致。截图已逐张核对。原始记录为issue-1214-ide/run-unYxhm/evidence.json和issue-1241/workspace/ide/evidence.json，串行日志为ide-serial-verified.log。
- 失败并保留：最初回归、旧mock/类型/格式检查与缺失新快照的中间失败；已修正并复验。独立的uni-app整块style删除对照仍失败，本次未修改上游编译器。
- 未验证：微信真机、Skyline、Windows原生构建和全面全端工作流。未发布或关闭Issue。

## 适用边界

自动模式把通过分析的rpx主题视为固定。未来JS或内联样式覆盖无法静态预测，动态主题必须显式cssOptions.cssCalc:false。此取舍已在实现前确认，并写入中英文文档与诊断。关闭后仍存在微信自身的运行时单位计算限制。

额外watch实验删除整个Vue style块时，旧pages/index.wxss残留，导致与干净构建不一致。移除weapp-tailwindcss并移除Tailwind入口后的独立uni-app5.15对照仍得到同样结果：删除前后均保留.scope{--spacing:3rpx}。原始记录为sfc-delete-control.json/.log与page-scope-before.log、host-scope-static-update.log。首次提交仅验证保留非空style模块时的覆盖增删，未修复整块删除。随后用户要求继续修复，现已在本库的 uni-app watch 适配中补齐空资产写入，回归恢复整块删除并增加重新添加、空style场景；完整根因和后续验收见 [样式输出清理记录](./uni-app-empty-style-output.md)。上述失败与无插件对照保留，不能将本库适配描述为上游编译器独立使用时也已修复。

一次IDE复验在前两种基数通过后收到SIGTERM（退出143）；中断报告不算完整通过，随后串行定向复验已完整通过，见上方最终记录。没有推断未经证实的进程终止原因。

微信Android/iOS真机、Skyline、Windows原生构建及全仓/全端全面工作流未验收。包构建声明生成通过不等于PostCSS全源码严格类型检查；本轮严格源码检查针对主包。未发布npm，也不将本地修复作为关闭Issue的发布版证据。

## PR #1247 首轮 CI 跟进

首轮head为90ca8c541。PR Gate的两个单测失败分别是默认选项快照仍写cssCalc:false，以及框架工厂超过500行。前者只更新该字段为undefined并不更新复验；后者把watch CSS适配入口拆成独立模块，不放宽行数门槛。

Portable枚举任务在既有浏览器就绪回归中失败：requestfinished可能先于async脚本执行和console事件到达。就绪探针现在等待当前文档load，随后在同一轮核对文档版本、本地模块集合和开发传输连接；不使用会被后台fetch阻塞的networkidle，也不增加固定等待。已有5个真实浏览器场景和完整demo matrix测试用于回归。

性能门禁测得uni-app和Taro Vite退化。CPU采样显示配置代理的普通读取也在复制并解析完整配置；现仅对延后字段解析，平台fallback直接传给解析器，不复制整个上下文。最终资产按原文、单位选项、完整上下文中的rpx变量和输出身份复用结果，配置及覆盖变化仍失效。

进一步核对真实CSS发现Taro主样式从约301KB增至490KB。根因是调用阶段首次引入嵌套cssOptions时，undefined或部分preset覆盖了顶层安全默认值，意外启用全局CSS变量fallback展开。新增call-options-defaults回归在旧实现中2条均失败；现在把调用基线默认值镜像到同一层再合并，保留用户显式开启变量展开的配置。修复后PostCSS111文件、1169测试通过，3条既有跳过。

使用独立7fa8c3ac8基线工作树、相同框架和3次构建/3轮watch对照，保留每次样本和CPUprofile，没有反复重跑直到偶然通过，也没有放宽CI阈值。uni-app优化首轮构建中位数3897.6→3835.4ms；Taro最终对照11291.6→11449.8ms，插件构建2415→2412ms，HMR1541.7→1573.4ms，插件HMR816→841ms，均低于5%门槛。Taro产物恢复到约301KB。原始记录为style-removal/perf-uni-optimized.json、perf-taro-context-fixed.json以及cpu-taro/；中间仍退化的两组Taro样本也保留。

Taro static 另发现原单位声明残留：已有--spacing:8rpx时，postcss-plugin-shared@1.1.6 的替换模式因目标值存在而直接return，留下后面的.25rem。上游仓库为https://github.com/icelib/postcss-plugins，查询时最新仍为1.1.6，未找到对应duplicate/replace Issue。临时补丁只让replace:false时跳过重复插入，replace:true始终完成当前声明替换；转换后仅清理相邻同属性/同值/同优先级声明，保留中间覆盖与显式保留模式。

补丁为patches/postcss-plugin-shared@1.1.6.patch，记录在pnpm配置和锁文件中；只采用pnpm生成的patch hash与引用，未纳入patch-commit顺带解析出的无关依赖升级。单位插件链强制打包进PostCSS的ESM/CJS产物并附带MIT许可，构建后拦截四个单位依赖的外部模块解析，分别加载ESM/CJS入口，单位替换均通过；消费者不需要安装仓库patch。Taro的6条static用例以原有快照不更新通过，没有接受rem残留。后续上游发布包含此修复的正式版本后，应升级、复验unit-duplicate-replacement及真实Taro静态产物，再删除补丁及锁文件登记。

## 当前配置快照的重复读取

aca7b4297的第二轮CI只有uni-app插件构建中位数触发性能门禁：1886→2008ms（6.47%），整体构建及HMR时延、内存门禁未触发失败。原始报告保存在style-removal/ci2-uni-artifact/。

新增getter回归证明resolveStyleOptionsFromContext在一次调用中读取cssOptions达20次；Vite代理的每次读取都可能重新解析样式阶段并构造选项。现同次解析先读取一次嵌套配置，再复用该快照；下一次调用仍重新读取，原位修改继续生效，不引入跨轮静态配置缓存。回归在修改前因20次读取失败，修改后通过。

保留原head和修改后的两组本地三次构建、三轮watch样本。修改后的同组基线/修复插件构建中位数1368/1314ms，整体构建4522.2/4340.0ms，HMR714.9/656.3ms，峰值RSS1296.0/1281.1MB。环境波动仍可能影响计时，不把不同轮次直接相减，也不修改CI阈值；以新head的CI复验作最终判断。记录为style-removal/perf-uni-current-head.json与perf-uni-single-read.json。

## 合成性能门禁的有界复测与热点修正

55d84483f 的 uni-app 性能分片通过。合成门禁 run 36331282584 首次只有 content-5000 中位数 585.18ms 超过 582ms。相同 SHA 仅重跑失败 job 一次，content-5000 降至 456.18ms，但 main-1000 与 structured-2000 的 p95 分别为 158.64/360.51ms，超过 155/336ms。两次报告均保留，不把失败简单归因为环境噪声，也不继续盲目重跑。

CPU 采样发现 handler 提前创建无信号管线，随后内容探测又创建另一条管线；preflight 的 PostCSS selectors getter 对普通规则重复拆分 6 次，变量作用域检测也在没有足够 Tailwind 变量声明时解析选择器。现在首次处理按实际信号创建管线，同次 preflight 复用选择器数组（添加 host 后刷新），先检查声明数量再解析变量作用域。不共享跨请求可变状态，不裁剪 preset-env 或兼容插件。

handler.cache 与 mp 的两条计数回归在修改前失败、修改后通过。`CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none`：1173 通过、3 条既有跳过；主包 style、vite-auto-rpx-calc、style-options-snapshot、v4-style-context 四文件 105 条通过。PostCSS 构建及声明生成通过，ESLint 源码 0 错误，测试文件按仓库配置忽略。

`pnpm exec node benchmark/performance/scripts/cli.mjs --guard --suite postcss --runs 3 --warmups 2 --out-dir e2e/.artifacts/style-removal/synthetic-optimized-guard` 在本机 Node24/M4 Max 通过，12 个用例输出哈希全部与 CI 相同。九组 fresh 用例覆盖 main/content/structured 的 1000/2000/5000 规模，另含三个缓存命中规模。修改前后 CPU profile 均保留；本机样本存在波动，不用单次计时宣称固定优化百分比，也不能替代 Linux/Node22 CI。

相同独立基线 7fa8c3ac8 的真实 uni-app 微信对照运行 3 次 build、3 轮 watch：插件构建中位数 1389→1287ms，整体构建 4509.3→4234.6ms，HMR 662.2→658.2ms。入口为 `pnpm exec node benchmark/version-compare/scripts/run-matrix.mjs --versions-file e2e/.artifacts/style-removal/perf-versions.json --only demo-uni-app-vite-tailwindcss-v4__mp-weixin --build-runs 3 --hmr-runs 3 --timeout 180000 --poll-interval 30 --out e2e/.artifacts/style-removal/perf-uni-lazy-preflight.json`。此轮未修改 demo 或 static 基线；完整语义快照均以不更新模式验证。未运行全仓或全端测试。

## 上游正式发布后的依赖替换

上游 [PR #49](https://github.com/icelib/postcss-plugins/pull/49) 已合并，提交为44745013546c09932c5779855225433dd7383f10；[Release run 36337974656](https://github.com/icelib/postcss-plugins/actions/runs/36337974656) 发布 postcss-plugin-shared 1.1.7、postcss-rule-unit-converter 0.2.5、postcss-pxtrans 1.0.6、postcss-rem-to-responsive-pixel 7.0.7。下游同步升级三个直接依赖的 catalog 范围，移除1.1.6补丁文件和 patchedDependencies 登记，保留原回归、打包策略并更新许可证版本。

从 npm registry 获取四个发布包并核对 SHA-512 integrity；共享包的 ESM/CJS 均包含 `!replace && skipDuplicate` 修复。完整元数据和解包内容保存在style-removal/npm-published-units/。最初 pnpm 查询 rem 版本仍返回旧元数据，随后原始版本端点与发布日志确认7.0.7；两轮依赖解析遇到 registry 长时间等待后终止。最终按这四个已验证包的版本、integrity 和原有依赖关系限定更新锁文件，未更新其他依赖；`pnpm install --frozen-lockfile --prefer-offline` 通过，只替换4个包。实际依赖树中三条单位转换链均使用未打补丁的共享包1.1.7。

本轮 PostCSS 112文件、1173测试通过，3条既有跳过；主包相关4文件105测试通过。PostCSS构建和声明生成通过。阻断四个单位依赖的外部解析后，当前ESM/CJS产物的原位替换、显式保留模式和不同优先级回归均通过，证明不依赖旧补丁或消费者外部单位实现。新包许可证正文与随包许可通知一致。命令与日志保存在style-removal/upstream-*.log，产物复验脚本为style-removal/verify-published-units.mjs。

真实 static 复验使用 `CI=1 pnpm exec vitest run --config e2e/vitest.e2e.config.ts e2e/taro-vite-react-tailwindcss-v4.test.ts e2e/issue-1214-rpx-calc.test.ts e2e/issue-1241.test.ts --update=none`，并通过 E2E_ISSUE_1241_DEPENDENCIES 复用已核对版本的框架依赖。三个项目共36条测试通过（18/12/6），没有更新任何快照，Taro输出及默认/显式calc、多入口和作者覆盖行为与既有基线一致。架构、规则、change intent检查通过，ESLint源码0错误；Markdown按仓库配置忽略。本轮验证限于依赖替换的定向测试和构建，不新增真机、Skyline或全端验收结论。

## 规则评估

不新增AGENTS规则。现有AST所有权、构建图与生命周期、不能以单文件猜测全局作用域、真实产物及static基线要求足以约束本次修复。需要保留的教训是：没有导入边不代表宿主不会共同加载，默认适配必须比显式用户选择更保守。
