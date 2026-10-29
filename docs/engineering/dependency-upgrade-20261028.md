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

准确 e769 与当前 3b02978 各三轮同 Node22.23.4、同默认 plugin-html 生产命令的实测已完成：WebpackReact 的四个 page/sub CSS 全部逐字相同，issue998 SHA-256 为 `2dc30810546a8cceeb11618a1fdd90155a7a05cc7a91219964defdaba9c60141`；app 的主题变量顺序和值也相同，AST 唯一区别是 placeholder 等价分支增加 `.nut-input-placeholder`（+22 字节）。因此本场景 HTML 新增页面主题变量来自旧专项基线滞后，覆盖边界为既有行为。此准确重建结论不扩大到 Vite 或 base 的 without 模式。

3b02978 使用新预检 `15389ca6-3596-41cd-be68-5a9ed7cc8d50` 完成全部脚本探针、真实界面操作、verify 和单次领取，完整 57 阶段在首轮根构建停止：64/71 任务成功，网站文档合同发现六份中英文 Lynx 文档还留旧基线时间、catalog 和设备信息；后续 56 阶段未执行。已依据归档报告同步事实字段和 CI 来源，合同及 16 项定向回归通过，未放宽校验规则，网站中英文真实生产构建随后 exit0；新一轮完整验收仍须重新预检。

本机 ARM64 的额外三轮准确基线/三轮当前 Taro 构建诊断峰值中位 1467.83→1477.98MB（+0.69%），不能据此清除 Ubuntu CI 的 +72MB 失败。新增 binding 元数据数量不足以支持其为根因；相位峰值位于 processAssets 优化/压缩附近，继续核对 Linux 实际行为，不先添加未经因果验证的优化补丁。

`d534aab8966e8fa5a3cd949936b0952a1ee317bb` 使用新预检 `30f5d7d9-9eb5-467a-b111-0a3b25818c68` 完成扩展探针、当前会话界面操作、verify 和单次领取。根构建通过；全仓单测为 1130 文件通过、1 文件失败、5 文件跳过，11899 项通过、1 项失败、1 项预期失败、44 项跳过，后续 55 阶段未执行。唯一失败来自 Lynx 示例的历史报告字段断言仍固定旧八字段，没有纳入已归档报告中的五项新增工具身份。依据现有 `CompatibilityBaseline` 合同补齐精确十三字段并增加类型约束，不删除字段、不放宽值检查；`CI=1 pnpm exec vitest run --project @weapp-tailwindcss/example-react-lynx examples/react-lynx/src/compatibility/catalog.test.ts --update=none` 的 4 项通过。完整验收尚须新一轮预检重跑。


## 准确 71a8b3c 验收、网站基线与最终锁风险复核

`71a8b3c0720f3c7d16a824a947970cd404ca89b5` 使用新预检 `1e6f819b-51ff-464d-9caf-1f11f85cff74`，扩展探针、当前会话 computer use、verify 和单次领取通过。完整 57 阶段的前 23 项通过，包含根构建、1131 文件/11900 项单测（另有 5 文件/44 项既有跳过及 1 项预期失败）、lint、类型、网站生产构建、Rust 44+17 项、真实 ABI 14096 cases 和 7 项生命周期/fallback。第 24 项网站浏览器验收因本地黄金目录缺少 `provenance/manifest.json` 停止，后 33 项未执行。

在新预检 `f580bcac-b14e-4a48-9c6e-2a2d217e9d08` 下正式重采网站三引擎候选，1204 项通过、602 项既有条件跳过，零失败/重试，正常清理。相对历史登记，1174 张 SHA 完全相同、30 张变化，无新增/移除，截图合同、环境及跳过集合一致。历史 PNG 已无法恢复：283 个 worktree 限定搜索未找到，primary checkout 的 192 张旧图也无一匹配历史 manifest；不能将 SHA 不同项描述为历史像素比较通过。root 已实际审查 001–024 裁剪图并记录来源、坐标及 SHA，发现两份模板文档仍写 5.5.4，而七模板实际依赖为 ^5.6.3。文档已改为引用各模板 manifest/锁作为版本依据；第一次 candidate 不安装，须在修正后的稳定源码正式重采、继续审查，再安装和禁止更新复验。

根与 Mpx 模板风险报告已对最终锁重新采集，原始 182 文件逐字节归档并核对 SHA。根公告记录 404→362、GHSA/包组 346→329，新增 3 项仍全部来自 Taro 固定 Webpack 5.91；移除 20 组、保留 326 组。peer 176→40（20 bad、20 missing）。Mpx 模板公告 131→119、零新增/7 组移除，peer 3→0。基线仅在临时副本迁移 pnpm 工具文档，业务锁字节不变；当前根和 Mpx 完整锁采集前后未变。audit 的代表父链可能变化，不能把路径差值当作真实依赖图增删；此次采集不替代安装或行为回归。

CI 的准确 PR merge commit 为 `d2f1a99b6e35185da2ff21ae9f4b7be430afb7c0`。Windows 前置 turbo-network 测试首次 30 秒超时，watch 尚未启动；同 head 其他 runner 多次 309–489ms 通过，仅一次受控重验后原 case 476ms、后续 watch 通过，保留首失败且未确认代码根因。Taro Webpack 性能 job 已通过原统计合同，但 build RSS 中位 1300.35→1367.75MB（+5.183%/+67.40MB），精确 p=.35 未满足 p≤.05 的阻断条件，不能写成没有增长；HMR 首次增长与反序确认亦保留观察。Uni Vite plugin 稳态 p95 仍为 155→168ms（+8.387%），generateBundle 增量跨轮重现；真实输入全文对照尚缺，继续在独立分支补被动诊断，不降低性能门槛。其余适用 CI、107 portable/8 HTML 变体禁更复验、七模板仓库外复制消费和完整多端链路仍待完成，暂不合并。

修正文档后的 `d43786bef` 重采使用新预检 `e4e9bd0b-fd27-4511-b395-011f0fb75ce3`，扩展探针、当前会话 computer use、verify 和领取通过。双语生产构建成功并同步更新两份受跟踪 `llms-index-full.json` 的模板摘要及生成时间；截图采集前的源码身份检查因这些未提交产物拒绝启动。该轮未产生截图，通过审查生成差异并补齐提交后重新预检，不绕过干净源码检查。


## 网站外部头像与诊断记录边界

修正文档后的 `c91e9eb2f` 经新预检 `11850bdb-4a71-498b-840d-f0c5b252c0af` 正式采集，754 项通过后，Firefox 的 `/zh-cn/blog/2025/9/v4.3-release` 因 `https://github.com/sonofmagic.png` 加载失败停止；1 项失败、1051 项未执行。失败候选不安装，不降低真实图片加载/解码断言。已将 GitHub 官方用户 ID 15621541 的头像原字节存入同源静态目录；原始响应为 JPEG、460×460、14467 字节，SHA256 `1d11a485bee8c8ac06fbfa3060656b9c6b35438813a5a6493b6e17c0a39810af`。两份作者配置使用站点相对 URL，由真实 Docusaurus 处理根路径、locale 与子路径部署；新增静态文件完整解码和四种 baseUrl 合同，网站定向 2 文件/20 项通过。实际双语生产构建、重采和禁更验收仍待执行。独立代理已实际查看旧候选 025–038 的全部 14 张裁剪图，补充记录另存，原 observations 字节与 SHA 保持不变；仍不能代替变化项历史像素比较。

Taro HTML 归档提交已整合为 `4e2313eeb`：每个 project/mode 在后续删除 dist 前保存真实原产物、完整合并日志、命令与退出状态；不改原 staging 和逐字 Buffer 判等，清理/归档失败保留原错误。定向 artifacts/workflow 2 文件/35 项及 report 1 文件/4 项通过，真实 8 变体禁更复验仍待新门禁。

Uni 被动诊断唯一采样 `40737453562` 仍失败，不能作为正式性能通过。完整 artifact 的上传 SHA、下载 SHA 与全成员 CRC 已核对：6 个 build session 完整；两侧 HMR 实际各写满 4096 个事件，第 6 bundle 在第三轮 mutation 的 CSS decision start 截断。旧 status 是 capture 期间的早期快照，finally 中的 finish 又遮蔽原 HMR 首错；不伪造 bundle 闭合，不提高 4096/16MiB/64MiB 预算，不减少真实工作量。独立分支正在修复记录协议和错误保留，并补真实资产规模预算回归，审查前不重复调度。两侧输入集合、处理分支及可序列化 plan 一致，CSS 仅有准确根路径差异，但 vendor 有真实变化；插件实际加载 PostCSS 8.5.30→8.5.32。现有诊断含观察开销且缺第三轮，不足以解释正式 p95 +13ms；该性能阻塞保留。

## 网站基线安装与完整诊断补证

`dbc255b298ca2b39ae7f5ba1fe4d3568d6debe38` 使用新预检 `f8f73752-71da-42a9-90a1-1ba16637802d` 完成扩展探针、当前会话 computer use、verify 和单次领取；双语真实构建及三引擎采集成功，1204 项通过、602 项既有条件跳过，零失败或重试。原 Firefox 博客图片失败路径已通过。生产 HTML 核对英文 `/img/authors/sonofmagic.jpg` 与中文 `/zh-cn/img/authors/sonofmagic.jpg`，输出头像保持原字节 SHA。

相对历史登记，1163 张 SHA 相同、41 张变化，无新增或移除，合同、环境与跳过集合相同。root 实际查看 001–024，独立代理查看 025–048 的顶/中/底裁剪，未见新内容缺失或重叠；这不是长页全像素人工审查。相对可用的 71 候选，37 张均有真实像素或尺寸差：8 张模板文字高度变化、12 张 WebKit 头像、14 张 Chromium 目录首项高亮状态，以及 WebKit 长页/首页和移动案例图的小色差。目录状态及小色差成因仍未知，未将其统称预期语义变化；微信码未解码 payload。历史 399 原 PNG 仍缺失，不能宣称历史逐像素比较通过。两份旧登记原字节移至 `website/tests/visual-baselines/history/399d635bb559cfd6a0d01369727740e1ffc7f822/`，新候选经正式 review/install/verify 安装，全部 48 张实际审查图绑定审查记录；真正禁止更新的浏览器复验尚待执行，原像素和加载门槛保持不变。两轮成功候选及审查证据分别归档在 worktree 外，按全部成员长度和 SHA 校验，恢复须保留原始来源路径身份。

独立诊断修复 `7a4a1c4a434e4a18c61f47a31c955296e717593c` 的唯一新运行 [40751122919](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40751122919) 整体成功：两侧各 3 次冷构建、3 轮修改/回滚、7 个 bundle、8 份快照、1347 个完整 span，pending 为空，实际各 3650/4096 个事件；最终 status、操作、模块哈希、16 份 worker 原字节日志及源码恢复记录一致。归档 ZIP 与 GitHub digest 相同且全部 CRC 通过。修复保留固定预算与完整工作量，终结 span 不再重复写起止事件，首错与清理错分别保留；已整合为 `c7e5131a8`、`30b892020`，集成后 47 文件/340 项回归、agents 与 diff 检查通过。

完整诊断仅证明证据协议成功。稳态可序列化输入、分支与处理次数一致，但候选集合的原始迭代顺序不同，opaque 对象身份仍未知；两份 vendor 与 WXML 生成 ID 有真实变化。同步 CSS 路径叶子的部分峰值与 minor GC 重叠，异步外层 span 包含等待与观察开销，因此不能直接归因为 PostCSS、JS 后端或同步算法回归。正式 plugin p95 +13ms 门禁仍未通过，继续做保持完整负载的生产/窄同步观测对照；没有降低阈值、主动 GC 或盲目回退依赖。完整 57 阶段、107 portable/8 HTML 禁更复验、七模板外部消费及准确最终 head 的适用 CI 仍待完成，PR 仍不合并。


## 网站禁更首轮与统计合同纠正

`9d8e7a9241935fff91464a7b22f4177c3b3bef31` 经新扩展预检 `f3eadeff-9831-45c9-9b25-e1dad955e3ab`、当前会话 computer use、verify 和单次领取后启动 109 阶段禁更验收。网站来源合同 1 项通过，三引擎浏览器阶段前 2 项通过后，旧 next 统计用例等待 `g/collect` 在 60 秒超时；1 项失败、2625 项未执行，后续 107 portable 与 8 HTML 变体未启动，服务正常收尾。首错日志与 trace 完整保留。

该测试与产品隔离策略的冲突已在准确 main 基线 `e769e69b97c88b379a80d3cabca4fa20330b999a` 原依赖和未修改源码上复现。相关产品和测试到当前 head 无差异：只有正式主域允许加载统计，next 即使配置为 canonical 也须拒绝。修复仅将过时断言拆成正式 canonical 含路径的正向上报、next 配置在正式域和 next 域均不加载或上报；保留 SSR、业务脚本、SPA、安全 gtag 和空队列断言。三引擎 18 项定向通过，零重试，未改产品策略、超时、图片检查或视觉阈值；不能据此宣称完整网站禁更通过。根因及夹具边界见[统计来源复盘](lessons/website-runtime-analytics-origin.md)。

## 网站目录状态、Uni 同步对照与模板外部消费首错

准确 `8ad08a899a7657ae388a9a4967bd5b08494c9668` 经新扩展预检 `c0735a64-7de5-4a67-9c86-93088f70f0c1`、当前会话 computer use、verify 和单次领取启动禁更复验。网站来源合同通过，浏览器 240 项通过后，Chromium desktop 的 StyleInjectorOptions 页面目录 Properties 在基线为 inactive、实际为 active，Playwright 比较差异 105 像素；1 项失败、2390 项未执行，107 portable 与 8 HTML 变体未启动。完整首错截图、trace 和上下文已归档。1280×720 同路由普通导航 8 轮均为 active，符合实际标题几何；旧 inactive 基线的形成原因仍未知。字体延迟实验没有证实几何变化，且 Playwright missing 采集本身也等待连续稳定像素，不能据此推断根因。只读目录语义就绪合同正在独立评估，尚未安装新基线，也未调整产品或像素阈值。

同一产品提交经新预检 `eed65fd2-3f29-4e0c-8690-6e5326a0f3ed` 完成生产 plain／同步 probe × 准确基线／当前的固定 2×2。独立工具提交 `b4fb2ca75b15f95a477c499a713dfdab8d8b3a47` 保留在诊断分支，不直接扩大依赖 PR。四组各 3 次冷构建、3 轮同 watch 修改与恢复全部完成，来源写入字节一致。生产组 HMR plugin 样本为基线 217/88/91ms、当前 227/88/84ms；原默认预算比较无违规，但仅为 macOS ARM64 诊断结果，不能清除 Linux 正式 p95 +13ms 失败。probe 样本为基线 227/96/93ms、当前 228/98/94ms；可序列化记录及聚合仍有差异、opaque 对象每侧 1091 项，继续核对实际 backend、cache、输入及同步调用，未以观察开销作生产归因。

七模板仓库外复制消费首轮使用新预检 `b55b9e0d-c59c-4016-84b0-6eb20a5eac53`，真实界面证据、verify 与单次领取通过。Mpx 冻结安装及微信构建、产物合同通过；第二个 Taro Vite 模板的 weapp 构建后，验证脚本把新增 `.swc/plugins` 缓存当成源码改写而停止。首错、输入身份与实际产物保留，后续目标未启动；仅修复明确生成缓存与源码身份的边界，不放宽 manifest、workspace、锁或补丁保护。两 Taro 模板缺 RN 配套、Vue2 quickapp-native 缺 release 签名均在准确基线已有，单列待验证范围，不能将普通文件生成称为全部模板平台通过。

TOC 只读就绪合同已整合为 `3d5c94912`，53 项定向单测、33 项 Chromium/Firefox/WebKit 真实 fixture 和 3 项既有整页截图 fixture 通过，零重试；实际生成 metadata 的 317 路由、双语覆盖及自定义 heading 范围均核对。旧黄金图先通过正式来源 verify，随后 1204 张原图及 provenance 原字节迁至本任务归档，旧登记原字节进入 `visual-baselines/history/dbc255b298ca2b39ae7f5ba1fe4d3568d6debe38/`，没有给新合同套用旧来源。新合同的采集、人工差异审查、安装与禁更仍待执行。

模板验证脚本的生成缓存边界已在独立临时副本修复：只排除实际安装 SWC 对应 v7/runner0.104.8 的普通 hash 缓存叶子，未知隐藏输入继续核验，四层缓存链接均拒绝。22 项夹具在本轮 Node24.22.1 复验通过，原失败副本只读身份对照通过；尚未据此把 Taro 真实构建认定为通过，完整七模板需要新门禁重跑。

## Uni 只读分析、准确 b5b 模板重跑与网站入口首错

准确 `8ad08a899a7657ae388a9a4967bd5b08494c9668` 的 Uni 2×2 补齐只读分析，47 份原 JSON 的字节数及 SHA 再核对未变。macOS ARM64 / Node24.22.1 plain 稳态 plugin p95 为 91→88ms，probe 为 96→98ms；plain 原预算计算无违规，但诊断 `budgetAcceptance=false`。两侧 7 bundle、669 record、755 aggregate，调用计数一致；406 条可比较记录差异中，119 次 classNameSet 成员相同而迭代顺序不同，另建成员解释视图后仍保留每 bundle 两份 vendor 的真实 source/code 差异。70 条 aggregate 差异对应 35 对、252 次调用、280 个祖先相对路径槽，均可由原始 file/roots 完整重建。opaque 内部仍未知；共有 realpath 热点及本机同步耗时不能解释 Linux 正式 p95 +13ms（8.387%）。该阻塞保留，下一步必须冻结准确交付 head，在原 Ubuntu/Node22、准确 e769 基线与原预算下执行 Uni 唯一 case、build3/HMR3 和反向确认，三个诊断开关均为 false。

分析文件位于 `e2e/.artifacts/dependency-upgrade-20261028/uni-sync-2x2-8ad08a899/`，完整身份同步至[执行证据](dependency-upgrade-20261028.execution-evidence.json)：

| 只读分析 | 字节数 | SHA-256 |
| --- | --- | --- |
| analysis-final.json | 133670 | `6437b7624dcf605622640d3cfa3c0460cf5583707c9f5e9d047955c15ca501fd` |
| analysis-final.md | 12068 | `82d39ad5aed781dd3b0204d29178269418b3ee81617a262e6666b743fbaf6048` |

七模板外部消费在准确 `b5b3709c5b9275a4908cf4e6fad60a862ae78c36`、新扩展预检 `35c9ef4a-f233-4aca-9608-8f4911dcf8cc` 的当前会话 computer use、verify 和单次领取后重跑，报告为 `copied-template-verification/run-AkzoMa/report.json`。前七个可执行目标通过：Mpx wx，以及 Taro Vite 的 weapp/swan/alipay/tt/qq/jd。第八个 Taro Vite Harmony Hybrid 的 `build:harmony-hybrid` 构建命令 exit0、进程清理通过，但 Web CSS 合同仍发现 `_b…_B` 编码 class，目标验收失败；六份原产物已按 manifest 的字节与 SHA 复核。后续八个可执行目标未运行，两份 Taro RN 与 Vue2 quickapp-native 的三个原有能力缺口仍 pending。不能仅删除 CSS 断言就宣称 Web 单位、主题作用域及 class/CSS 配套通过；原报告、产物和失败副本保留，七模板整体验收未完成。

网站在同一准确 b5b、新扩展预检 `8c2f6cb6-e542-4f51-97e8-9e75c2aa26e4` 的当前会话 computer use、verify 和单次领取后采集，英文 `build` 与中文 `build/zh-cn` 真实生产构建均成功。随后 Playwright `--list` 加载真实 `index.spec.ts` 的 CommonJS 导入链时，TOC `site-policy.ts` 的 `import.meta` 报 `SyntaxError: Cannot use import.meta outside a module`，尚未启动截图测试，采集截图为 0。失败候选 `website-visual-candidate-1793221869708/` 原样保留，仅含 capture-started、capture-failed 与生成配置；未执行审查、安装或禁更。先前 33 项 TOC fixture 未覆盖这条真实导入链，不能用其通过替代本次入口失败；修复后仍须准确新 head 的新预检和完整采集、审查、安装、禁止更新复验。


## Web 单位生成修复与截图过程取证

共享 Web 生成流程漏掉显式单位转换，已在负责 CSS 转换的 PostCSS 层修复（`5a5609ced`）。两个包真实构建通过；生成器、增量/缓存、Vite 阶段及真实 Vite/Webpack 构建共 16 项通过，覆盖同单位缩放和回到原单位的非幂等管线，未在消费者手动补转换。真实回归首次发现测试读取 Webpack emit 后的 SizeOnlySource 和固定 CSS 空白两项夹具问题，`ae6aff2fe` 改为读取真实产物并断言语义，首错保留。

模板源码及 npm 发布版模式各 4 项通过，但不等于框架最终产物通过。准确 `76649b1897f359e9b37df6cb0bb400ceb5ea4877` 经新扩展预检 `ae9b61ff-72b5-4255-bd83-fae019d0840e`、本会话真实交互、verify 与单次领取重跑复制模板矩阵，前九目标通过，第十个 Webpack Harmony Hybrid 构建 exit0 后仍残留 `margin-top: 8rpx`，后六目标未执行。模板 h5.postcss 的转换没有覆盖发布版后续生成的样式，正在按真实 Webpack 资产生命周期修复，不能用上述纯组合测试代替最终构建。原三个 RN/签名能力缺口仍单列 pending。报告、原产物及失败副本保留于 `copied-template-verification/run-XCuQyV/`。

网站截图的八项引擎对照使用独立新预检 `eee9adb6-c883-47f1-b033-aa69430e7741`，原 fixture、原生 fullPage、原 60 秒预算及零重试全部保留。shell llms 的真实协议请求期间记录到 1×1 视口、TOC 移除/重建及新 transition；前后 ready 无法排除该过程。官方 Chromium 同轮未记录此重建，但共享源码仍有该临时尺寸逻辑，不能推导切换引擎已经解决。第九项独立 CDP false/fullclip 候选虽有正确 PNG 尺寸及相同顶部 720 像素，离屏色带和底部标记却全白，明确拒绝采用；整轮是诊断失败，不是视觉禁更通过。下一修复观察完整捕获期，并要求两张连续、完整、未受扰动的 RGBA 相等，仍须真实 fixture、完整候选和禁更验证。

展示页 006 的轻微变化已用已安装 Playwright 1.64.1 的真实 PNG 比较器、原 maxDiffPixels=5 与未覆盖的默认 threshold=0.2 验证通过；001 目录颜色控制实际被拒绝（82 比较器像素），没有放宽门槛或修改原 PNG。新基线仍未安装。

本地代理借用可写依赖目录另造成 62 个命令 shim 指向临时 worktree；主任务以固定锁文件、离线 force install 重新生成，62/62 恢复，随后两个包构建与上述回归通过。源码提交未损坏，隔离边界和恢复证据见[worktree 依赖目录复盘](lessons/worktree-node-modules-isolation.md)。完整多端、107 portable/8 HTML 禁更、全部模板及准确最终 head 的适用 CI（含 Uni 正式性能）仍未完成，PR #1320 继续保持未合并。

## Webpack 生成后资产与整页捕获合同回归

Taro Webpack 独立模板改为在 `processAssets` 的 `SUMMARIZE + 1` 处理真实 CSS 资产，覆盖发布版 5.6.3 后追加的样式，并同步外部、内联与尚未导出的内部 source map。已导出的映射保持最终资产边界，避免下一轮 Webpack 再次追加映射注释；外部映射缺失时直接传播错误，不读取输出目录。根 Webpack 5.112.2 与模板实际固定的 5.91.0 各 17 项回归通过，PR Gate 两处显式清单已包含专项。首轮真实回归的 2 项失败保留，修复了已导出映射被重新暴露为内部映射的根因，没有仅放宽对象身份断言；真实 Hybrid 构建与复制模板矩阵仍须重跑。

网站捕获期观察覆盖 document、节点身份、真实颜色、动画、视口、标题和 TOC 链接几何，只有连续两张完整、无扰动且 RGBA 严格相同的截图才进入原有一次整图比较，仍使用原 60 秒与 5 像素门槛。首轮 fixture 的 1 项失败、68 项未运行已保留：字体就绪后直接调用原生 fullPage 也会改变默认 Times 的文本宽度，monospace 对照同样有较小变化，普通视口截图没有该变化；底层排版机制尚未确认。稳定采样合同允许拒绝污染样本后重采，因此回归精确检查最后两张各自前后几何及相互一致，保留完整尺寸、底部像素、固定位置和视口断言，没有固定容器宽度、替换生产字体或放宽容差。另以不调用截图的祖先几何变化与恢复验证观察器，避免原生首图扰动替代测试目标。

准确 `cdf138589977369cad509f5f10a57cd658b5f487` 经新扩展预检 `32470ffc-12b4-44be-bd2d-ce2098813f32`、当前会话真实界面交互、verify 与单次领取，Chromium、Firefox、WebKit 的捕获监测、TOC 与匿名快照合同共 72 项通过，零重试、禁止更新；纯回归另有 48 项通过。该结果只证明夹具合同，不替代真实网站候选、黄金图审查、网站禁更或最终完整多端验收。Uni 正式性能的 155→168ms 阻塞仍保留，PR #1320 尚不能合并。

## 准确 63e 正式 CI 与 App 模板补齐

准确 `63e3e5a4649058b8d4625226e9aa3f7fff28ddd3` 的 [正式 Uni 性能 run 40789766677](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40789766677) 已 success：准确 e769 基线、Uni 唯一 case、build3/HMR3，GC/input/allocation 三诊断开关均关闭，原预算无违规。build 4709.42→4691.84ms，端到端 HMR 2189.48→2157.74ms，plugin p95 299→297ms。稳态 plugin 为 [98,97]→[95,143]ms，单尾上涨未满足原“两尾同时越界”规则；steady RSS +8.94%、peak +1.01%也未同时越界，不能称全部指标改善。原155→168ms失败及2×2诊断保留；本次成功只绑定63e，最终交付head仍须重跑正式CI。下载ZIP的SHA、大小、CRC及summary与receipt均重新核对。

同一63e的 [Lynx run 40789722996 attempt2](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40789722996/attempts/2) 已 success。首轮Android SDK安装Emulator时报ZIP读取错误，随后清理adb连接5554被拒绝；原shell exit1日志保留，只实际重跑该失败job一次。Android新artifact 12863831198的56556702字节、SHA及全CRC重新核对；118项为54 supported/64 unsupported、181条evidence，bundle与run身份一致，实际宿主Android11/API30/x86_64。unsupported不等于已支持，该CI不替代最终head或本地完整双端原生验收，也未据此刷新冻结基线。

Vue2模板修复已整合为 `89a6b36e6`：沿真实App样式入口恢复一次12128B业务CSS，service/view的Web class身份一致；App/MP两份static基线定向更新后，19纯合同及2实际产物禁更通过。MP WXML/JS字节一致，56条CSS规则AST相同，仅新增1023换行；H5/360各13576B、148规则且CSS字节一致。Taro Harmony Hybrid在环境/策略边界按Web处理（`fc03daeac`），显式rem2rpx:true的Vite快照同步1.5rem→48rpx（`eef2240e4`），React Vite/Webpack Hybrid静态基线按designWidth750/deviceRatio750:1同步0.2rem→0.1rem（`40e053f81`、`05ec68c48`）。隔离候选四个Hybrid生产构建与普通浏览器computed/pixel通过；这些产物证据不代表Harmony原生桥接、HMR或设备验收。

复制模板在准确 `eef2240e4b1303db565123a2351cd2687e610121`、新门禁 `f8a2bdf6-b4cf-467d-8176-9f98b828a478` 后运行，`copied-template-verification/run-g1KSdm/report.json`记录前15可执行目标通过，包括Mpx wx、Taro Vite六小程序与Hybrid、Taro Webpack weapp与Hybrid、Vue3/Vue2微信与App、weapp-vite。第16个HBuilderX微信编译失败，报告总体仍为failed；两Taro RN及Vue2 quickapp-native三个准确基线能力缺口继续pending，原副本与失败日志保留。

HBuilderX隔离诊断在Stable5.33.2026102401内置Vue3编译器、npm weapp-tailwindcss5.6.3/TW4.3.3重现source-candidates EISDIR。真实readFileSync追踪证实模板把cssEntries传为标量，按字符迭代后将根目录和IDE cwd当文件读取；准确e769基线同配置及string[]公开类型已存在，不能归因为本轮API收窄。模板改为单项数组并保留原样式导入（`5228d2c04`），去掉诊断注入后实际编译exit0、ready5436ms且任务项目关闭；fixed receipt与原exit1的result.json分开保存。helper另在真实命令结果边界保留首错并改善归属清理（整合`b56fb97bd`，23 helper+1模板回归通过），不以CLI exit0等同编译成功。当前只证明该隔离副本微信静态编译，完整复制矩阵、IDE页面、设备和cascade仍待验收。

## 网站候选取消与祖先合成监控补强

准确63e的 `website-visual-candidate-1793232087026/`经只读审查和独立VM反例发现TOC祖先opacity/filter等绘制扰动漏检，已合作取消，不作为最终黄金候选。取消时828张PNG、无完整manifest；wrapper exit1、stage143，原stage正常清理未确认，之后全部记录归属PID已结束。取消、过程日志及白盒证据全部保留。001/002/008与旧图0RGBA差；003/004/005/007/009/010与上一候选相同且首TOC链接高亮符合所核上游几何规则，但像素相同不能补足捕获期观测。

修复 `6cc16263b`（规范对齐`13f36e3fd`）按真实祖先链去重，采集完整computed style、parent身份、rect/client/scroll几何及未完成动画，并用MutationRecord.oldValue保留同任务改回历史。准确旧算法同组8项为7失败/1通过，其中6项功能漏检及1项祖先读取成本合同；修复后新增10+既有22=32纯回归及TS6严格检查通过。32链接/400属性白盒证明共享祖先每read仅读一次完整属性，未测实际浏览器CPU。新增16项/浏览器已加入三引擎CI四入口，但真实验收尚未运行；旧72项通过不能替代新监控验收。没有改生产样式、动画、共享60秒、完整双样本RGBA严格相同或原5像素门槛。新head的fresh gate、完整候选采集/人工审查/来源登记/禁更，以及最终全端与CI仍待完成；PR #1320尚不能宣称全部通过或据此合并。
