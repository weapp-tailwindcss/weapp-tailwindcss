---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 2f42d5c49dedf322b80dfeb5c27d98b146d09d9b
regressions:
  - e2e/react-native-hmr-observer.test.ts
  - e2e/react-native-hmr-resolver.test.ts
  - e2e/react-native-hmr-observation.test.ts
  - e2e/tailwind-native-adapter.test.ts
---

# RN 原连接消息与完成时安装观察

本轮补齐原 HMR 连接的消息观察边界，不能据此宣布实际交付、执行及模块因果链全部通过。此前的 HTTP 响应调用快照、宿主发布 manifest 和设备安装观察各自保留，不能互相代替。

## 症状

此前 native 阶段只有宿主 HTTP 调用和设备安装快照，原客户端是否收到 HMR 消息尚无独立原件；缺少该目录也不会被旧阶段合同拒绝。

## 根因与纠正

仅原生验收显式设置 `RN_METRO_HMR_ARCHIVE` 时启用。Metro 最终 resolver 先委托既有解析链，只在 React Native Utilities 的精确请求上保存真实解析结果、客户端源码及所属包；wrapper 内部 alias 复用该结果，不创建第二个客户端。普通示例和 Expo Web 保持原入口。

记录器只构造一次原客户端，在其原 `_ws` 上增加 capture 监听，保存原始字符串；不替换原 handler、全局 WebSocket 或 evaluator。同一 socket 的 send 保留参数、this、返回值及原异常，`send-returned` 仅说明调用返回。异常和预算溢出使观察证据失败，原 HMR 继续；私有品牌拒绝同身份的伪造状态。显式验收构建归档 I/O 失败则立即阻断，避免构建成功但缺原件。

App 在完成本阶段报告时，先核对实际安装，再采一次累计消息快照，并同步确认安装未变；投递重试复用这份 payload。该时刻并列观察到收到消息和稳定安装，不能证明消息在安装发生前已到达，更不能证明某个模块引起了该安装。

离线验证重新解析原始消息，保留带类型的模块 ID、added/modified/deleted、revision、initial、代码及来源 URL；逐阶段检查同 realm、同连接、累计前缀、后续新增非 initial update，以及实际安装与原报告。原件和阶段副本进入统一报告附件。删除整个目录、使用 Web 的 not-applicable、替换观察器并重算摘要均不能通过。观察器四份源码摘要由本轮源码独立计算，纳入 fixture hash；阶段协议升级为 v4，旧设备报告只能作历史。

以下声明继续保持 `not-captured`：初始 bundle、evaluator、modulePhaseCausality、servedBundle。合成消息明确带 synthetic-unit 身份，只证明回归门禁。

## 验证

- 首红：缺记录模块；补齐后继续固化伪造槽位、冻结记录和错误数组等反例。后者红日志为 `.tmp/rn-hmr-malformed-red.log`，两个伪造状态失败。该轮另有构造器替身被 ESLint 改成箭头函数的问题，已改回可构造替身并注明原因。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts` 定向 HMR 三文件、phase-evidence、phase-capture、native-adapter、static-entry-scope，`--update=none`：7 文件 147 项通过。日志 `.tmp/rn-hmr-integrated-v4-green.log`。
- `CI=1 pnpm --filter @weapp-tailwindcss/example-react-native-expo test`：13 文件 85 项通过；示例 `tsc --noEmit` 通过。
- 相邻兼容导出、artifact、HTTP 两文件、安装及 CI 合同：6 文件 57 项通过，包含 Web/Android/iOS Metro 静态导出及后台 Chromium 验证；各自资源在 finally 清理。日志 `.tmp/rn-hmr-adjacent-v4.log`。
- `CI=1 pnpm e2e:tailwind:contract`：134 文件 2,130 项全部通过，固定 `--update=none`，日志 `.tmp/rn-hmr-tailwind-contract-v4.log`。这不等于设备执行全部注册能力。
- 示例限定基线命令为 `pnpm exec tsx e2e/react-native/update-static.ts`。审查仅 fixtureHash 两处及 verifiedAt 改变，raw CSS、manifest、候选和语义预期不变；static-entry-scope 以禁止更新模式重新生成并比较通过。历史原生报告未改。
- 三个新增测试已接入 `e2e:react-native-compatibility` 与 `e2e:tailwind:contract` 的显式列表，普通 CI 不会漏跑。

## 真实 Metro 定向构建

使用 prepareMetroHmrObservation 生成新 run/invocation，向系统临时目录执行一次成功的 iOS 开发导出：`pnpm --filter @weapp-tailwindcss/example-react-native-expo exec expo export:embed --platform ios --entry-file <absolute entry> --dev true --bundle-output <task-system-temp>/ios.bundle --sourcemap-output <task-system-temp>/ios.map --max-workers 1`。这是定向构建，无设备、登录或可见页面。

导出 734 个模块，实际原客户端为 metro-runtime 0.83.7。bundle 包含观察器和本轮 run/invocation 字面量，证明 wrapper/alias 入图及 Expo 环境替换接通；bundle SHA256 为 `491c3f4ae96b803239f6fa3c662f2b8da7234ef5b131e9d6ac709a037f0f9a32`。构建基于 2f42d5c49 加本轮明确 dirty 改动；它不是设备收到的 bundle，也不转移为新 head 的运行时成功。

前两次启动诊断分别失败于辅助脚本的 execa stderr 配置和 entry 相对 monorepo serverRoot；前者未启动 Metro，后者未生成 bundle。修正精确参数后导出成功，原错误和各自目录保留，不算产品重跑通过。

完整原件位于任务系统临时目录，指针 `.tmp/rn-hmr-dev-export-directory.txt`；持久摘要、源码/锁文件身份、resolver、包和所有文件摘要见 [构建证据](evidence/rn-hmr-observation-build.json)。进程已退出，没有创建设备或浏览器资源。

## 适用边界

微信终态协议故障尚未确认恢复，本轮不消费作废 lease，也不继续全面调度。必须重新完成 extended prepare、当前会话原生 Chrome computer use 和 verify 后，再采新 v4 原生证据。WebKit 正式宿主接入、原生完整注册夹具和转换独立 oracle 仍未完成；main 上的 #1307–#1309 不能借 PR 合同成功宣称根治。

本轮重新执行了两份 extended prepare，均未启动全面测试、当前会话 computer use 或 verify。e229b485 在文档规则修正前作废，其原始微信日志同时记录已有服务 19355 的 auto 超时：未取得连接，保留项目租约和登录态。c0d6ed8 干净源码上的 10356248 再次预检时，微信因该保留租约被拒绝，Android 则因 dump 没有 node 被阻断；iOS/Harmony/Web 与原生工具链探针通过，不能替失败项放行。原件摘要及各项状态见 [本轮阻塞记录](evidence/rn-hmr-v4-preflight-blocked.json)。

e229 的原 worker PID 18647 已退出，但远端项目是否打开尚不明确，原服务没有确认关闭，因此没有删除服务锁或从新进程冒充原归属清理。锁为系统临时目录中的 weapp-wechat-service-19355-46dc83645688750b.lock，绑定本任务 e229 的 wechat-project。这一资源保留须先恢复原服务并确认旧项目已关闭；不重置登录、设备或 IDE，不继续重跑碰运气。两份 prepare 服务均已退出，未创建 Chrome 页面。

## 规则评估

现有规则已要求原始证据、逐层验证、独立预期及预检，未发现需要扩大根规则的边界。以 v4 合同和明确 not-captured 字段承载本次变化，避免将单次构建或合成夹具升格为设备成功。文档检查最初缺少元数据和标准章节，已补齐；新预检 e229b485 在全面启动前因这次文档修正作废，不能用于放行。

Refs #1307, #1308, #1309
