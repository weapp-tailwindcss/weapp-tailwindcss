# 2026-10-28 全面依赖升级：安装阶段

本轮基于main e769e69b97c88b379a80d3cabca4fa20330b999a，覆盖根项目、全部workspace、demo（含Web、issue复现和style-injector）及七个独立模板，共105个manifest。评估和安装阶段已完成，static及完整多端验收仍在进行；本记录不宣称全面升级已验收完成。

[逐依赖清单](dependency-upgrade-20261028.inventory.tsv)含1743条当前外部声明：原始1717条，新增26条配套，无移除；原评估为739项升级、828项已最新、150项保留，725项已有声明的锁版本发生变化。评估数不等于实际版本上升数，兼容回退与配套修正单独说明。[105项目状态](dependency-upgrade-20261028.projects.tsv)区分安装、构建和定向验证；97个根importer及七模板纳入冻结安装，assets/package.json无外部依赖且不在workspace，无需安装。

前次安装快照采于2026-10-28T05:41:55.435Z；2026-10-28T15:13:48.408Z再次核验当前105manifest、八锁及1743项外部声明，包名/版本身份问题0。根和七模板均已真实frozen安装通过，最新根锁在图标入口配套修改后重新冻结安装通过，1743项外部声明的实际包名、版本均与锁一致，声明/物理身份问题0，采集中及完成后复核无变化。八份pnpm锁的升级前后身份、121个npm范围manifest/workspace/lock文件、24条补丁引用身份（含 PR 首轮新增的 Mpx 根与独立模板补丁），以及15项未引用catalog的逐项评估见[锁与补丁证据](dependency-upgrade-20261028.lock-evidence.json)。该结果只证明安装身份，不代表传递peer、漏洞或行为问题为0。根风险报告不覆盖独立模板，七模板的独立audit/peer基线对比另行附证，不能据根报告宣称模板风险为0。

## 配套与保留

uni-app按[官方CLI升级说明](https://uniapp.dcloud.net.cn/quickstart-cli.html#cliversion)使用固定UVM0.3.1的manual预览：`pnpm dlx @dcloudio/uvm@0.3.1 latest --manager manual`。Vue3采用实际取得的正式3.0.0-5030320261023001配套，Vue2 Webpack模板采用实际取得的正式2.0.2-5020620260917001配套；Vue2的50303缺少uni-mp-360完整配套，因此保留360平台并使用50206，不混用编译器版本。组件库、图标和Sass也逐项评估。命令及配套规则核对[UVM0.3.1发布源码](https://unpkg.com/@dcloudio/uvm@0.3.1/lib/project.js)。Vue/Vite及平台包按编译器要求配套，不统一写成npm latest。HBuilderX、内置编译器及运行基座按[兼容说明](https://doc.dcloud.net.cn/uni-app-x/tutorial/compatibility.html)独立验收，npm更新不能代表IDE已升级。

Taro4.3.1、Mpx2.2.32、weapp-vite7.6.0等正式版按实际消费者升级；Taro RN保留Expo50/RN0.73，独立Expo保留SDK54/RN0.81.5，Vue2及历史复现fixture保留测试目的。gulp-typescript精确6.0.0-alpha.1用于现有管线必需的宿主路径大小写、.tsbuildinfo和declaration-only能力，正式替代完成原管线及跨平台/watch验收后退出；jison-gho0.6.1-216为上游完整发布身份。框架及原生矩阵保留项须整体迁移并完成相应构建、设备/HMR验收后退出，不能独立拉高单个包。公开包的Node及peer支持范围保持原样；私有weapp-vite样例和独立模板按用户授权对齐根Node范围。详细保留依据与退出条件见逐依赖清单。

stylelint-taro-rn4.3.1使用私有declarationValueIndex.cjs，官方16.10.0仍含该文件，16.11.0已删除，插件dev范围上限也是16.10.0。[官方源码证据](dependency-upgrade-20261028.stylelint-evidence.json)包含三份tarball的SHA512核验。曾选16.26.1时安装成功而真实consumer失败；最终通过transformer定向override及runner显式Stylelint16.10.0/plugin4.3.1配套，封住不同peer实例池的解析差异，根Stylelint17保持独立，未改写上游peer契约。

Nuxt 私有 demo 的 Node 声明对齐其官方 `^22.22.3 || ^24.15.0 || >=26.0.0`，未机械套用更窄的根范围。官方 Nuxt 4.6.0 至 4.6.3 均声明这一范围，本轮修正的是原 `>=22.12.0` 与上游不符的声明，没有提高 Nuxt 实际要求。

精确补丁随正式版本迁移，并覆盖实际消费者保留的代际：Webpack5.91和5.112使用相同HMR修复，Taro独立Webpack模板注册本地5.91补丁；Rollup3/4共享监听container身份修复均保留。weapp-vite7.6仅补宿主CommonJS动态import转换，使用正式Babel插件显式局部依赖。补丁适用性检查与真实消费回归分别记录，不能以根安装替代模板安装。


两Rust内核采用napi3.15.0、napi-derive3.6.13和napi-build2.6.0；core的Oxc0.152.0因Rust1.96最低版本边界保留，后续只有在整体提升Rust工具链并完成解析及ABI回归后调整。Cargo目标不在npm TSV中，两份Cargo manifest/lock的SHA及准确更新/检查命令见[执行证据](dependency-upgrade-20261028.execution-evidence.json)，与八份pnpm锁证据分别记录。

## 已验证与边界

| 本地验证 | 结果与范围 |
| --- | --- |
| 根与七模板最新冻结安装 | 全部exit0；最后受影响根与Taro Webpack模板分别见install-rn-provider-webpack591.log、install-taro-webpack591.log |
| RN/框架/身份定向 | RN22文件166项、framework4文件23项、identity4文件69项通过；不代表完整项目构建或设备验收 |
| Rollup | 根共享container定向40项通过 |
| Taro RN与Webpack真实consumer | 六demo RN54项、根及真实Taro Webpack demo双runtime2项，共56项通过；独立模板另核对补丁与冻结安装身份 |
| 补丁组回归 | 当前明确选择的40文件、1019项全部通过；历史37文件组的920通过/1超时原始日志保留，不将当前计数倒写为历史通过 |
| ESLint | 变更源码通过；三处Taro真实局部lint合同及三模板虚拟合同通过；Mpx demo实际lint被根规则忽略并exit2；准确基线e769e69同命令也exit2，原有失败已复现，两侧仍未通过 |
| Rust | 两内核cargo check --locked exit0；只做编译检查，未代替单测/ABI/八平台产物验收 |
| Lynx | 集成包前置构建及示例TypeScript检查通过；首次类型检查因缺少该包构建产物失败，补齐后复验通过；不代表static/native验收 |

Mpx lint对照在两侧显式传入`--config.verifyDepsBeforeRun=false`，只关闭隔离副本的自动安装检查，完整命令见执行证据。基线40个输入未改，876个工具节点和1886条依赖边核对无混用。首轮因隔离副本缺安装验证脚本而失败的preinstall日志另行保留，未计入最终对照。工具包体未重新核验npm tarball完整性。

原始命令和日志位于e2e/.artifacts/dependency-upgrade-20261028/。本轮`pnpm release status` exit0，已接受两份新增中文intent并包含原有intent传播计划，未执行版本写入或发布。准确命令、日志SHA、最新锁安装关联及最终规范/差异检查结果见[执行证据](dependency-upgrade-20261028.execution-evidence.json)。

## 未完成范围

最终根图的peer和audit命令均exit1但产生有效JSON且stderr为空：传递peer为20条bad、20条missing，Stylelint冲突已无；audit为362条公告记录（low28、moderate137、high153、critical44），图规模5780。相对基线新增的3个GHSA/包组合都命中Taro固定的Webpack5.91，HMR兼容补丁并未修复这些安全公告。根图逐项范围归属与最终文件身份见[风险与peer证据](dependency-upgrade-20261028.risks.json)。

七个独立模板另以相同pnpm12.15工具审计准确基线与当前锁，28条命令均取得有效JSON。旧锁只在临时副本迁移工具元数据文档，业务锁文档逐字节相同；当前锁完整SHA保持不变。[模板风险证据](dependency-upgrade-20261028.template-risks.json)逐项保存完整版本父链、公告及新旧锁身份，不与根图重复相加。

| 独立模板 | 审计记录：基线→当前 | peer：基线→当前 |
| --- | --- | --- |
| Mpx | 131→119 | 3→0 |
| Taro Vite | 145→139 | 6→3 |
| Taro Webpack | 195→188 | 3→2 |
| HBuilderX | 1→0 | 0→0 |
| uni-app Vite | 120→114 | 3→1 |
| uni-app Webpack | 149→149 | 2→2 |
| weapp-vite | 10→2 | 2→0 |

模板没有新增GHSA/包公告组合，但仍有8条peer提示。新增两项分别为Taro可选Less4与现有Less3，以及DCloud内部renderer3.4.21与应用Vue3.5.44；保留对应代际与官方内部配套，实际构建仍待验收。Taro模板当前只有CSS入口；uni-app Webpack既有两条Webpack4 peer提示与实际compiler需区分：uni-build和Vue CLI实际解析同一Webpack5.106.2，env未将其alias到4，插件和loader使用实际compiler/loader context。上述源码核验不能替代真实构建或HMR。

static更新、差异审查和禁止更新复验、全部demo/starter/template构建，以及微信/HBuilderX/iOS/Android/Harmony/Web、HMR和基座验收尚未完成。历史微信预检超时已保留；本轮 6ddc97c0-1145-4977-8094-6be02c8cac89 的扩展探针、当前会话 computer use 和 verify 已全部通过，完整流程在根构建阶段发现 Mpx/Webpack 兼容失败并停止，后续阶段未执行。不得拆分全面验收命令绕过预检，恢复后须取得新一轮完整预检凭据。Rust单测、真实Node-API差分、八平台binding/tarball/摘要及许可检查仍待完成。

## 清单边界与后续迁移

105 个日常项目之外，另有四个受跟踪的测试 manifest：`e2e/fixtures/taro-webpack-default-utilities` 专用于历史发布版 Windows utilities 缺陷对照，保留 Taro 4.2.1 及冻结锁；`packages/weapp-tailwindcss/test/fixtures/tailwindcss` 是 Tailwind 3.2.2 源码兼容输入，保留历史版本。两者逐项保留测试目的，不作为日常独立模板升级。`packages/weapp-tailwindcss/test/fixtures/tailwind-v4-app` 和 `packages/weapp-tailwindcss/test/fixtures/vite/src` 无外部依赖，仅作测试项目标记。历史对照移除或测试矩阵正式迁移时复查。

Expo 58、Vue Router 5、Pinia 4、Execa/Chokidar/jsdom/pako 新主版本，以及 Rust Oxc 提高工具链下限的迁移单独评估，不混入本轮兼容升级。jison-gho 0.6.1-216 是官方发布的完整版本身份；只有当前 grammar/parser 的消费回归及兼容矩阵通过正式替代实现后才替换，不能按版本后缀机械判为 alpha。

本轮重新预检首次在 isLogin 连接阶段失败，报告为 `190092cc-d9cc-4b15-be20-c406ab922cc9`；其余脚本探针通过，computer use 与全面测试未执行。随后同一安装的已有服务登录确认通过，原错误未记录连接原因，不能推断 IDE 未打开。依用户最新要求允许受控自动启动/重启，优先复用现有实例；新增标准连接错误诊断保留目标端口，仍保护登录态。失败报告不复用，恢复后重新预检。

## PR #1320 首轮验收与修复

[PR #1320](https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1320) 初始 head 为 7f8df54041940450426208fc9e57a91f2b55e3db。完整本地入口使用固定起始基线及本轮扩展预检，根构建首次失败后停止；预检通过不等于后续 57 阶段通过。

- Webpack 5.112.2 移动内部目录，Mpx 2.11.1 的 9 类请求失效。根和独立模板新增同一精确补丁：8 类改用 Webpack 公开导出，唯一未公开的入口导出保护插件集中兼容新旧路径，加载阶段错误原样传播。6 项持久回归、style-injector/Mpx 主 demo 与独立模板生产构建通过；根与 Mpx 模板再次 frozen install 通过，两个锁的 package 版本集合未改变。上游 Mpx 正式版修复并通过相同生产/HMR/WXS 及模板回归后删除补丁。
- 六份 Lynx 中英文文档同步 Rspeedy 0.18.3、React 插件 0.22.0 和 runtime 0.129.0，网站配置文档合同通过。
- Expo HTTP 观察回归的 CLI 期望同步至实际 54.0.28，12 项测试通过；没有调整归档校验规则。
- 执行 `pnpm e2e:lynx:static:update` 更新该项目静态证据，再以 `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-rspeedy.test.ts e2e/lynx-static-evidence.test.ts e2e/lynx-encoder-values.test.ts --update=none` 复验，3 文件/83 项通过。差异为工具链版本、catalog 身份，以及 flex shorthand 的编码 `flex-basis: 0` 变为 `0%`；两者不作通用等价承诺，原生布局与像素验收仍待完成。
- Vue 2 模板新增 360 必需构建 case，保持 Vue 3 矩阵独立。`CI=1 E2E_TEMPLATE_CASE='uni-app-webpack-tailwindcss-v4 mp-360$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/templates-build-smoke.test.ts --update=none` 的 2 项通过，确认 H5 派生的 app.js/app.json/app.css、360 页面清单及源码 class/CSS 颜色；不声称 360 宿主运行时通过。首次测试对独立 CSS 文件的路径预期不准确，已依据实际 bundle 修正为合并后的 app.css，原失败日志保留。

远端 Windows 身份采集首请求和 macOS watch 收尾超时仍在诊断，不能放宽门槛或把清理未知状态视作成功。完整本地流程、其余 static 定向更新/禁更复验、适用 CI/CD 和全部真实平台验收尚未完成，暂不合并。

## PR 后续本地验收

head `9d8636e3a14e6f89bbe71ba0b7d3c87fbe4d9918` 使用新预检 `be08895f-b917-4c75-a173-b414473b98a4`，扩展脚本探针、当前会话 computer use 和 verify 全部通过。完整入口第一阶段根构建通过（71 个任务，含缓存重放）；第二阶段全仓单测为 1129 文件通过、2 文件失败、5 文件跳过，11897 项通过、3 项失败、1 项预期失败、44 项跳过。失败后停止，后续 55 阶段未执行。

- test-helper 的合成 fixture 仅写 pnpm importer，没有真实工具包元数据，仍遗留旧工具版本。新版 pnpm 重新解析工具依赖时，请求被假 registry 错误回答成 `@fixture/a`。仅改版本仍不足以修复：最终从根真实锁复制完整工具文档并对齐 `packageManager`，保留测试显式覆盖版本的能力；registry 只响应已提供的包，未知请求返回 404。真实 `pnpm change status` 和依赖快照共 32 项通过。
- Webpack 5.112.2 不再输出未使用的 export runtime，默认压缩函数名随之变化。先增加实际执行断言，确认普通压缩返回改写后的函数名、`keep_fnames` 返回 `weappTwIgnore`，再仅更新对应快照。四种压缩配置的 4 项测试在禁止更新模式通过，公开实现未改变。

定向命令为 `CI=1 pnpm exec vitest run --project @weapp-tailwindcss/test-helper packages/test-helper/test/update-packages/runner.test.ts packages/test-helper/test/update-packages/snapshot.test.ts --update=none` 和 `CI=1 pnpm exec vitest run --project @weapp-tailwindcss/minify-preserve packages/minify-preserve/test/bundler-config.test.ts --update=none`。上述结果包含 head 后的本轮未提交修复；完整验收仍须在提交与 static 更新后重新预检。

head `83ef312828a6dbee1aa464fe9238069fccf3155b` 后定向重生成 Mpx 五平台及 style-injector Mpx 共六份 portable 基线，语义 JSON 无变化；同六项禁止更新复验通过，完整生产产物按 case 归档。React Native static 重生成仅更新 Expo `54.0.37 → 54.0.38`、Node 环境及生成时间，编译结果和 catalog/fixture 身份不变；`react-native-compatibility.test.ts` 与 `react-native-static-entry-scope.test.ts` 共 18 项禁止更新复验通过，包含 Web/Android/iOS Metro 导出，不代表设备运行通过。

107-case 基线阶段开始前曾阻断：预检 `7ebd1e3a-5282-4656-a995-574578f2a213` 的脚本探针、computer use、verify 通过，但领取入口从 pnpm 脚本改为 exec 启动后 PATH 身份不同，门禁拒绝启动测试。统一入口后，`c7f50472-02f3-4947-80a5-12b0d68cffd4` 在微信 App 域协议等待和收尾超时；按用户授权原生关闭已确认的任务探针、受控重启 IDE，登录态保留。新报告 `62a69293-08de-4b11-8cd9-c79d73c40200` 仍在 `auto` 请求 30 秒超时。原生界面与监听进程确认同一已登录安装，不能归因为 IDE 未开启；保留失败现场和本任务退出进程的旧锁归属，继续有界恢复，未放行全面测试。

## Static 生成、图标入口与 Lynx 基线补齐

107 个 portable case（27 个可独立构建 demo）的生产构建和基线生成全部通过，原始产物保存于 `static-update-all/`。预检 `9c7b2f1b-b710-4e6f-8753-4ab91185511b` 的扩展探针、当前会话界面操作、verify 和单次领取全部通过。随后传统 16 文件/46 项通过，generator 的 8 项目/20 case 生成成功；四个 Taro 项目的 plugin-html 开/关共 8 变体，以及 weapp-vite canonical 模板的冻结安装、构建与 2 项验证均通过。HTML 单独入口首次缺少根 PostCSS facade 依赖，已在 d3dc22646 修复并冻结安装复验；失败日志保留。

Taro Vue3 Webpack 小程序生产 CSS 回归发现 NutUI 图标默认值晚于 Tailwind 工具类，导致同节点 flex 与 100rpx 字号被覆盖。真实 module/CSS 图表明问题发生在 mini-css-extract 输入顺序，公共样式生成层没有重排。最终显式声明并在 app.css 前直接导入正式 `@nutui/icons-vue-taro@0.0.9` 图标入口，保留原 NutUI fullstyle 的 CSS import；不添加 important。小程序生产 CSS 声明顺序回归先红后绿。mini 与展平 layer 的 web-compact 保持后置 utilities 优先；普通 H5 的 utilities 仍在 @layer 中，无 layer 的图标普通声明按 CSS 原有规则优先，不能将 mini 的优先级结论推广到该模式。最终 icon-only 方案又完整重生成该项目的 9 个 portable 目标、传统 6 项、generator 3 case 和 HTML 2 变体，全部 exit0，替代中间方案产物；对应预检为 `5fe2d41a-0596-4315-ad03-b03ad14b0037`。

本轮基线包含实际上游行为变化：Autoprefixer 占位符/reset 展开；DCloud vdom 的 page border-box 与 rich-text reset 边界；uni-app H5 Toast 尺寸、圆角、背景、字体及安全区定位；page 自定义变量向 body 的作用域扩展。不能统称格式变化。issue1160 的最终四边值相同，issue1164 mini 为 JSON 键顺序变化。最终基线仍需完成语义审查后的禁止更新复验，107 个 case 生成成功不代表 watch/HMR 或设备链路通过。

Lynx 使用准确 head `eb486aabb6655aa5377b61af1e4e19014bda2f6e` 的 CI run 40696344394 attempt1 双端原始报告刷新基线。下载 ZIP 与 GitHub digest 一致，全 CRC、逐文件 SHA/大小、每端 144 张 PNG、181 条 evidence 及 118 个原生结论均严格重读校验；再通过仓库 updater 生成三个受跟踪文件并归档 396 个文件，独立 archive replay exit0；报告与 updater 的 2 文件/58 项禁止更新回归通过。iOS 53 supported/65 unsupported、Android 54/64，与历史结论一致，无 not-tested。保留 CI 宿主的真实几何/测量变化；iOS 实际 iPhone16Pro/iOS18.5，不能以页面旧静态文案当宿主身份。此 CI 证据不替代本地完整双端运行。

macOS mp-weixin watch、单测三分片、Expo Web/Android/iOS 已通过；macOS H5 watch 已通过，旧收尾超时本轮未复现。性能门禁两项仍失败：Taro 构建峰值内存约 +5.55%/+72MB（跨轮可重现）和 uni-app Vite HMR p95 +15ms。继续按固定阈值诊断，未把重试或基线刷新当作性能修复。完整 57 阶段、107-case 禁更复验、全部适用 CI 仍待完成，因此 PR 保持草稿，尚未合并。

HTML 专项差异另含新增主题变量，不能仅按注释/格式变化处理。准确 e769 的传统 issue998 基线已含相同 cyan/blue 默认值，而该提交的 HTML 专项基线缺少部分变量，显示专项基线可能滞后；是否为升级引入仍需准确基线实际构建产物对照。当前不据此声称无视觉影响，也不直接改写生成内核。
