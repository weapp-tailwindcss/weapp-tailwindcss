# 2026-11-07 依赖逐项清单与证据边界

本附件补齐原升级报告的逐项结果，并更正不能由现有证据支持的概述。比较对象固定为升级前 `a73127455ed42f766a5d0bb3399e3f2bfec11984` 与升级后 `113fc820e7b3d57d7d7d20352d65ac80fdedad33`，不把随后前进的 main 混入清单。

## 覆盖范围

- Git 中共有 109 份 tracked `package.json`，其中 `packages/weapp-tailwindcss/test/fixtures/vite/src/package.json` 是空对象；因此是 108 份非空 manifest，另有 1 份空解析 fixture。
- 四类直接声明由基线 2012 条变为当前 2010 条，联合清单有 2012 行，包含删除的 `@types/get-value` 与根 `minimatch`。已有声明原始文本变化 63 条；catalog 解引用后有效范围变化 156 条，声明或锁版本变化共 168 条。
- 单列 170 条 `workspace:` 内部引用，不将本地包与 registry 同名发布版比较。6 条 npm alias 按实际包名查询，包括 5 代 Vite 与 `escape-published`。`catalog:` 按最近 workspace 配置解引用。
- 配置附件逐项覆盖 9 份 `pnpm-workspace.yaml` 中的 259 条 catalog、override、patch 与 package extension；工具链声明另列。根锁、7 份独立模板锁、1 份 Taro 历史 fixture 锁，以及 2 份 Cargo 锁均记录准确 Git blob、SHA-256、文档与解析数量。
- 排除生成目录、被忽略的 `generic-vite` 与 `submodules/tailwindcss-mangle`。本轮没有安装依赖、借用其他 worktree 的 `node_modules`、修改声明或锁、执行构建或设备验收。

## 四态结果

| 范围 | 已升级 | 已是最新 | 保留 | 阻塞 | 合计 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 当前直接声明 | 135 | 725 | 599 | 551 | 2010 |
| 已删除声明 | 2 | 0 | 0 | 0 | 2 |
| 联合清单 | 137 | 725 | 599 | 551 | 2012 |

`已升级` 记录有证据的声明/catalog/锁变化，不能代替行为验收。`已是最新` 表示锁解析等于本次查询的官方正式目标，也不代表审计和 peer 问题已解决。`保留` 的每行都有消费者、依据和退出条件，包含内部引用、公开 peer 契约、历史 fixture 与精确 patch 约束。缺少安全升级或兼容保留依据的条目归为 `阻塞`，不以现存 pin 或 `update.ignoreDeps` 自身证明新版本不兼容。

`upgradeApplied` 与四态独立：部分条目确实改过有效范围或锁，但仍落后本次正式目标，或缺少对应迁移证据，因此当前结果可以是 `保留` 或 `阻塞`。例如 Sass 的范围从 `^1.107.1` 收紧为 `1.107.1`，锁版本没有变化，不能写成锁升级。

## 当前仍缺的证据

uni-app 的 11 个 npm 目标存在本轮 UVM manual 输出，另 1 个本地 HBuilderX 模板是 IDE 目标，不含 DCloud npm 编译器声明，也没有 UVM 日志。现存文件没有结构化命令退出码，不能重建“12 次全部 exit 0”的说法。

11 个 npm 目标的 125 条 DCloud 编译器声明仍未升级：95 条为 `3.0.0-5030320261023001`，30 条为 `2.0.2-5020620260917001`。UVM 对已覆盖包建议的正式配套分别为 `3.0.0-5030420261029002` 与 `2.0.2-5030420261028001`。其中 118 条属于“UVM 建议未落实”，7 条未被相应项目的 UVM 输出覆盖（`uni-mp-vue`、`uni-uts-v1`），均逐消费者标为阻塞。后者必须独立核对，不能机械套用建议版本。

HBuilderX、内置编译器、运行基座与 npm 编译器是独立身份。本轮 extended 预检已记录 HBuilderX `5.34.2026102909`（stable），内置 `uniapp-cli-vite@5.34.2026102910.4125`、`uniapp-uts-v1@5.34.2026102910.4129`，以及 `launcher@5.34.2026102719.2959`、`uniappx-launcher@5.34.2026102719.3522` 等插件版本。它们属于已安装工具身份，不等于模板实际编译、设备上的运行基座身份或全端通过，IDE 模板仍单列阻塞。

本次官方查询中，TypeScript 已为 `7.0.2`、Vite 为 `8.3.6`，Sass 与 sass-embedded 为 `1.108.1`。这些是本次查询时点，不倒填原升级时点。Sass 现有失败依据针对 `1.108.0` 的 Windows 分包编译，不能推断 `1.108.1` 同样失败或已经修复；当前版本与复验条件已逐行列出。

Taro/Mpx 的精确 patch、Taro lint、Vue2 兼容 fixture、多代 Vite alias 等保留理由均映射到具体 manifest。其余 React/Vite/TypeScript/Vue、Expo/RN、Babel、工具主版本等若没有当前消费者迁移证据，列为阻塞；没有沿用旧报告的分组概述充当逐项完成证明。

Rust 直接声明共 12 条，本次 registry 核对中 2 条已是最新、10 条缺少新版本迁移证据。它们保留精确 NAPI/OXC pin，但不能因此标为“最新”。两个锁的变化包含 12 项 patch、9 项 minor 与 1 项新增包：PostCSS native 为 33 → 33 包，主 native 为 106 → 107 包，新增 `utf_types@1.0.0`。`either`、ICU 与 `utf8_iter` 等含 minor 更新，原“仅 patch”概述不准确。

## Registry 与锁身份

本次只读查询了 484 个 npm 实际包身份和 105 个 crates.io 身份。每个结果附官方 URL、本机 UTC 读取时间与 HTTP `Date`；范围是“本次查询时点”，不是原升级操作的采样时间。

npm 默认记录官方 `latest` 通道。`@nutui/nutui-taro`、`@nutui/nutui-react-taro`、`c12`、`gulp-typescript` 与 `jison-gho` 的版本包含 SemVer 预发布段，已另存官方 dist-tags；没有明确正式通道依据时，`latestStable` 留空并标阻塞。最高无预发布字符串只列为候选，不自动认定正式目标。DCloud 编译器以本项目 UVM 正式配套为优先目标，不机械使用 npm latest 或以连字符判断通道；npm latest 显式含 alpha/beta/rc 的包也不因 DCloud 名称被认定为正式版。尤其未被本轮 UVM 覆盖的 `uni-uts-v1` 只保留原始 alpha 通道值，正式目标留空待核实。

声明与锁的核对检查了 importer 的原始 specifier、外部包名/版本在 packages 图中的存在性、workspace link 的目标 manifest 及真实包名，问题数为 0。JSON 保留完整 peer/patch 锁身份，TSV 展示基础解析版本。这里的 `resolved` 来自 Git 锁文件，不能替代本轮物理安装版本或 frozen install 证据。

## 安全与 peer 残余

原报告的基线 372 条 advisory 没有找到对应机器 JSON，故只保留“历史摘要计数”的来源说明，不能重建逐 advisory 的前后差异。现存根 audit JSON 为 210 条（low 20、moderate 96、high 87、critical 7）；7 个模板分别为 Mpx 137、Taro Vite 140、Taro Webpack 200、HBuilderX 0、uni-app 120、uni-app Webpack 163、weapp-vite 3。这些是独立依赖图，不相加。

根 peer JSON 包含 97 个项目。残余为 21 条 bad、21 条 missing、3 条 conflict；按“项目 + 包”去重分别是 15 个 bad 身份与 14 个 missing 身份，按全仓包名去重则分别为 7 与 8。风险附件保留全部项目、importer、包、wanted、found、parents 与 optional 身份，不能概括成只有 Tailwind 3/4 矛盾。

audit、peer 与 UVM 的来源均为原本轮 worktree 的 `.tmp/dependency-upgrade-20261107/` 现存文件。它们自身没有 cwd、准确 head 和采样时间元数据；本附件保存原路径、字节数与 SHA-256，只认证本次读取内容，未伪造命令完成时刻或退出码，也不跨旧报告复用全面验收结论。

## 本轮最新环境预检

本轮报告 `b5256653-a668-4c2c-9702-cc1235f6a735` 于 `2026-11-07T06:04:53.548Z` 创建，绑定 head `113fc820e7b3d57d7d7d20352d65ac80fdedad33` 与原 stable worktree，`extended=true`、总状态 `blocked`。原始报告路径、哈希、准确 head 与逐探针 checkedAt 已归档；不复制 endpoint、token、challenge 或完整环境。

- Node `v24.22.1`、pnpm `12.18.0`、Rust 基础工具与宿主标准库已通过；旧报告中的 Node 引擎问题已恢复。
- Android 明确选择 `emulator-5554`，启动、shell、UI 结构和截图通过，旧目标歧义已恢复。微信、HBuilderX、iOS、Harmony 与 runtime-ios 也通过各自预检。
- Web 探针在缺少 Firefox `1572` 时停止，未执行后续 WebKit 探针；另行只读核对确认 WebKit `2388` 同样缺失，不能把未执行写成通过。
- runtime-android 因 PATH 中无 `gradle` 阻断。本机已有 Gradle `8.9` 正式发行目录及所需 SDK 36、Build Tools 35/36、NDK `27.1.12297006`；附件列出任务级 `LYNX_GRADLE` / `ANDROID_HOME` 路径，尚未据此重跑 prepare 或执行原生构建。
- 本轮 computer-use 为 `not-run`，门禁没有放行，全面测试未启动。浏览器补装、工具路径绑定和当前会话证据完成后必须重新 prepare/verify，不能复用这份阻塞报告。

## 文件索引与自检

- [逐直接声明 TSV](dependency-upgrade-20261107.inventory.tsv)：每行可独立追溯 manifest、声明前后、有效范围、resolved、正式目标、四态、理由和退出条件。
- [逐直接声明 JSON](dependency-upgrade-20261107.inventory.json)：包含完整锁身份、alias/catalog、消费者、peer 索引与独立变更标记。
- [109 个 manifest 汇总](dependency-upgrade-20261107.projects.tsv)：含空 fixture、无依赖项目及每项目四态计数。
- [配置与补丁](dependency-upgrade-20261107.configuration.json)：catalog 消费者、override selector、按配置目录解析的 patch 路径/哈希和工具链声明。67 个前后 patch 身份均核对 tracked 文件，消费者引用限定各自配置作用域。
- [锁与 Rust](dependency-upgrade-20261107.lock-evidence.json)：全部 11 份锁身份、Cargo 直接声明和逐 crate 版本差异。
- [官方查询](dependency-upgrade-20261107.registry.json)：官方通道、版本、查询时点及公开 engines/peer 元数据。
- [安全、peer 与 UVM 原始来源归档](dependency-upgrade-20261107.risk-evidence.json)：现存来源身份、完整残余与来源边界。
- [汇总与文件哈希](dependency-upgrade-20261107.inventory-summary.json)：机器自检结果及当前附件大小/哈希。

自检验证了 109/108 manifest 覆盖、2012 → 2010 声明计数、2012 个联合身份唯一性、四态/依据/退出条件完整、TSV 与 JSON 对齐、170 条内部引用没有 registry 比较，以及全部锁和配置文件覆盖。`git diff --check` 通过。本次按任务要求未执行 `pnpm agents:check`；需在后续自有依赖域中验证，不能借用其他 worktree 依赖目录。

JSON 附件按每条记录一行组织，便于逐项 diff；安全附件将 32265 个 audit 路径实例无损映射为 9916 条 `auditPathTable` 与各 finding 的 `pathIndices`，复原公式是 `auditPathTable[index]`，保留原顺序及重复关系。自检已将复原结果与原始路径逐项比较；不因压缩排版删除项目身份、advisory、peer 或 UVM 来源证据。
