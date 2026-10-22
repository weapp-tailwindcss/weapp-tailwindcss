---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 078e6e020db23143cd01826450a5a2b969bda610
regressions:
  - e2e/wechat-automator.test.ts
  - e2e/tailwind-weapp-environment.test.ts
  - e2e/tailwind-scheduler.test.ts
  - e2e/tailwind-stage-receipt.test.ts
  - e2e/wechat-session-boundary.test.ts
verification:
  - claim: 干净078e执行十五目标调度，微信就绪协议超时后人工阻断，全面验收失败
    kind: integration
    status: failed
    sha: 078e6e020db23143cd01826450a5a2b969bda610
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0、Tailwind CSS 4.3.3；本轮extended脚本、原生Chrome交互、verify均通过后启动，CI=1
    command: pnpm e2e:tailwind --preflight-report e2e/.artifacts/preflight/c1657530-7382-482b-ba30-596a9081bbfc/report.json
  - claim: SDK终态环境异常、内部恢复及跨进程阻断五文件88项定向回归通过
    kind: integration
    status: passed
    sha: 078e6e020db23143cd01826450a5a2b969bda610
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0、Vitest 5.0.4；含本记录对应未提交修复，微信边界使用受控替身，不操作实际IDE，CI=1、快照none
    command: pnpm exec vitest run --config e2e/vitest.e2e.config.ts e2e/wechat-automator.test.ts e2e/tailwind-weapp-environment.test.ts e2e/tailwind-scheduler.test.ts e2e/tailwind-stage-receipt.test.ts e2e/wechat-session-boundary.test.ts --maxWorkers=1 --update=none
  - claim: RN双端三阶段原始报告、PNG、实际安装与HTTP归档通过生产validator独立重放
    kind: native
    status: passed
    sha: 078e6e020db23143cd01826450a5a2b969bda610
    environment: 同run201985的Android与iOS产物；macOS、Node24.18.0，仅离线重放，不启动设备
    command: pnpm exec tsx .tmp/replay-078e-runtime.mts react-native-ios
  - claim: Taro Vite稳态HMR插件P95超过原性能阈值，根因尚待准确对照采样
    kind: ci
    status: failed
    sha: 078e6e020db23143cd01826450a5a2b969bda610
    environment: Ubuntu24.04、Node22.23.3、pnpm12.14.0；merge dae85f7c94fc223dad1295c5461ee49dc126f31e，与head树一致，base7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39704711574/job/119583588672
---

# 2026-10-22 Tailwind 验收与微信终态阻断

## 症状

运行 `2019853d-3740-49ba-a1c6-a466241025c5` 固定干净078e。extended预检 `c1657530-7382-482b-ba30-596a9081bbfc` 的全部脚本、本会话原生Chrome真实输入/点击和verify先通过。验收进入微信后，`Launcher.waitForAppReady` 最终返回 `DEVTOOLS_PROTOCOL_TIMEOUT`，方法 `App.captureScreenshot`，末次协议剩余预算2555ms。启动总预算90秒已包含SDK内部恢复；没有进入任何一个微信案例。

原能力报告将同一次就绪异常填入31项failed，另1282项not-run。曾将它描述为“后续案例同错”，现纠正为一次启动失败的外层批量登记，不能推导31次截图失败。原报告及索引不回写为blocked或成功。

## 根因与纠正

本仓库只分类自己的`WechatEnvironmentError`，SDK终态协议错误未被转换，调度继续启动mini-builds。发现后通过既有block入口作废lease，并向已核对归属的进程组36860发送一次SIGINT。mini-builds最终缺回执源于此次人工中断；framework从未启动。预检服务结束后的ECONNREFUSED是收尾错误，不能掩盖微信首次失败。

泛用block入口把`computer-use`项标blocked；这不代表本轮真实computer use失败。原成功证据仍在预检附件。prepare、验收、mini-builds及其自有进程均已退出；RN/Expo HMR临时修改已恢复，自有Chrome挑战标签已关闭。没有重置登录、重启IDE或设备。

修复放在两个明确边界：`waitForAppReady`完成SDK内部恢复后，最终reject统一封装领域环境错误并保留cause，已有领域错误原样返回；案例外层只识别真实Error的准确SDK code及App/Page/Element/Tool协议方法，不根据日志文字或普通对象取得调度控制权。cause/Aggregate和本次生产回执把阻断传播到父调度，不改变底层send、内部重试、原预算或清理归属。

## 验证

先红后绿日志分别为`.tmp/wechat-protocol-red.log`（三失败）、`.tmp/wechat-readiness-red.log`（无code就绪终态与断连两失败），最终`.tmp/wechat-protocol-green-final3.log`五文件88项通过。真实SDK就绪首轮超时、下一轮成功仍移交原连接；无code终态、嵌套协议错误、清理双错必须阻断。伪造日志、普通对象和不完整字段不能阻断。六文件ESLint通过。本轮未改demo、CSS、支持预期或生成产物，无需更新static基线。

以下P/F/B/N来自各层报告，不能相加为正向支持数。[持久摘要](evidence/tailwind-acceptance-078e.json)保存报告身份、hash和计数；完整JSON/PNG/bundle仍在忽略的`e2e/.artifacts/tailwind/<runId>/`，摘要不能替代原件重放。

| 目标 | P | F | B | N | 范围 |
| --- | ---: | ---: | ---: | ---: | --- |
| static | 47,483 | 0 | 0 | 118,473 | 135批、34,505去重候选，生成及三端转换调用完成；大量语义oracle未登记 |
| authoring | 29 | 0 | 0 | 0 | 作者指令与配置 |
| Web Chromium | 1,392 | 0 | 0 | 0 | 十份报告，含autofill及Chromium媒体；不推广其它引擎未执行媒体能力 |
| Web Firefox | 1,390 | 0 | 0 | 0 | 八份独立报告 |
| Web WebKit | 1,389 | 1 | 0 | 0 | 真实visited失败，宿主根因对照见下文 |
| Expo三引擎，各自 | 118 | 0 | 0 | 1,260 | 三阶段；26运行时、5编码、87预声明拒绝 |
| RN Android、iOS，各自 | 118 | 0 | 0 | 1,260 | 三阶段生产validator离线重放通过，注册能力未执行 |
| Lynx Android、iOS，各自 | 18 | 0 | 100 | 1,496 | 16正向（10运行时、6像素）＋2负向；缺oracle保留阻塞 |
| 微信原报告 | 0 | 31 | 0 | 1,282 | 就绪阶段失败；实际案例进入数0 |
| mini-builds | — | — | — | — | 错误启动后人工中断，blocked，不能将部分构建计成功 |
| framework-regressions | — | — | — | — | blocked，未启动 |

RN每端每阶段44份回执、88帧，三阶段共132回执、264帧。Image及ScrollView的`sizing-size`夹具已验证initial/offset/restored双帧样式、几何、像素和control；这只收窄该夹具缺口，不能推广所有组件utility。双端各观察一次真实HTTP GET `.bundle`，HTTP200 multipart调用正文完整性通过；客户端身份、收到/执行、WS delta和逐阶段交付仍未捕获，见[HTTP边界记录](tailwind-rn-http-observation.md)。

Lynx两端另经`readNativeReport(path, platform)`独立重读原生报告、bundle、几何、主题及PNG，日志`.tmp/replay-078e-lynx.log`通过。Android原生54支持/64拒绝，iOS53/65，各9帧主题；原生采集与验证完成仍不取代统一适配报告的18通过/100阻塞/1496未执行。重放调用生产decoder，会创建并清理自己在系统临时目录的解码模块，不改原始产物。

static无生成失败或三端转换调用异常，不代表语义全部通过。唯一候选层：微信1440正向、33065未验证；RN1894正向、663负向、31948未验证；Lynx9正向、34496未验证，44项登记oracle仅9项达成。总报告的not-run继续阻止全面成功。

WebKit的三宿主对照表明macOS Playwright宿主历史登记开关缺失：原版、原样重建均失败，仅加开关的宿主首帧通过。它是`078e + dirty`定向诊断，未接入正式runner，不能改写本轮WebKit失败；[完整边界与摘要](tailwind-visited-observation-trace.md)单独保留。

## 适用边界

全面验收仍partial。微信环境恢复后必须新建extended预检、当前会话computer use、verify，不能复用本轮已消费且人工作废的报告。新分类的合同通过不证明IDE已恢复，也不能据此继续后续全面调度。普通hosted CI、定向合同和有界根因诊断可继续。

CI的Taro Vite HMR插件稳态P95为1210→1388ms（+14.71%），原样本base[1292,1200,1210]、current[1453,1388,1282]；guard舍首轮，2/2稳态违规。CSS task增长176/67ms解释插件增长的大部分，具体函数尚未定位。保留失败，不重跑碰运气、不放宽5%＋10ms＋两样本门槛。Mpx成功也不能消除旧性能失败。

#1307/#1308/#1309修复仍在本PR，起始main不能称为根治；原生注册夹具、独立转换oracle、剩余媒体能力和RN真实客户端交付链仍缺。用户已明确允许任意运行时动态alpha登记小程序限制；静态百分比支持及其正向回归保持，不能将该授权扩大到其它失败。

## 规则评估

不新增AGENTS。用持久回归落实既有“环境异常立即停止、保留登录态、准确证据身份”规则；不改变性能阈值、支持预期或重试预算。

Refs #1307, #1308, #1309
