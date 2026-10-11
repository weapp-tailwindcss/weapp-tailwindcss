---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/blob/4ca235ff7aa54bf12c619a88aded8edd949361e9/scripts/local-full-platform-report.ts
baseline: 4ca235ff7aa54bf12c619a88aded8edd949361e9
regressions:
  - e2e/preflight-gate.test.ts
  - e2e/preflight-evidence.test.ts
  - e2e/preflight-probes.test.ts
  - e2e/preflight-lifecycle.test.ts
  - e2e/e2e-matrix.test.ts
---

# 全面测试必须先验证环境

## 症状

本地全面报告原先直接开始构建，原生设备和视觉步骤允许 optional 失败。CLI 存在、历史截图或 hosted 健康检查，不能说明本轮所有 IDE、模拟器、浏览器及 AI computer use 都可用。

2026-09-18 的真实检查中，computer use 浏览器发现返回 `Codex auth token is unavailable`，HBuilderX 的 host 版本查询超时。微信自动化曾返回上一轮项目的 run ID；改为官方 CLI 指定本轮项目及独立端口后，首次连接还出现拒绝连接。加入有时限的服务就绪等待后，微信真实预检通过；其余阻塞继续保留，不能启动全面测试。

## 根因与纠正

新增 prepare/verify 活动会话，将源码身份、主机、配置、设备、工具版本、截图与工具交互证据关联到 run ID。全面入口在首个测试子进程之前领取一次性报告，领取前后检查 15 分钟时效，在设备阶段前复查存活。缺项、服务退出、设备变化、报告重复使用或失败均阻断。

微信版本读取所选安装的应用元数据；CLI 的帮助输出和 Electron 版本都不是 IDE 版本。CLI 返回也不代表异步自动化服务已就绪，连接需要有时限的重试。探针使用独立项目，读取本轮标识后才点击，等待数据和实际渲染一致。旧页面不得被 reLaunch 或点击。临时项目清理只按本轮路径关闭，不全局结束 IDE。显式工具路径失效不能偷偷回退。

computer use 需要当前工具会话的原始动作输出、截图与服务端交互回执，不能由 Playwright 替代。block 命令只补充失败证据。会话互斥、中断等待、消费进程退出检查与归属校验避免旧报告恢复及误删其他任务的锁。

## 验证

在 Node 24.18.0、pnpm 12.4.1 下运行：

```bash
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/preflight-gate.test.ts e2e/preflight-evidence.test.ts e2e/preflight-probes.test.ts e2e/preflight-lifecycle.test.ts e2e/e2e-matrix.test.ts --update=none
pnpm exec tsx scripts/check-e2e-ide-shared-launch.ts
pnpm agents:check
git diff --check
pnpm e2e:preflight prepare
```

定向回归覆盖每项必需检查的阻断、两个全面入口无报告时的非零退出、跨 checkout、过期、缺证、并发领取、失联设备、浏览器交互失败及本任务进程清理。跨平台路径用例包括 Windows 盘符、根目录、反斜杠、相对路径及中文空格。

真实探针已取得基础环境、微信、iOS、Android、Harmony 和 Web 的成功记录；HBuilderX、computer use 尚未通过，全面测试没有启动。本轮 run ID 为 `6e36e523-646e-474e-a785-3e8d53f0e429`；原始 JSON、中文 Markdown、日志和截图写入忽略目录 `e2e/.artifacts/preflight/<run-id>/`，交付时链接本轮报告。没有改动 demo 或样式输出基线。

定向类型检查还会触及既有的 `packages/hbuilderx-runner/src/hbuilderx/discovery.ts` 三处类型错误；仅检查 runner 入口也能复现，不能宣称全仓类型检查通过。

## 适用边界

这是本地全面测试门禁。普通 hosted CI、定向单测和预检自身回归保持独立。合成测试证据不能替代真实设备验收；Windows/Linux 路径回归不能证明这些系统的原生 IDE 已验收。iOS Simulator 在不支持的主机上明确阻断。工具环境恢复后必须重新 prepare，旧截图、旧成功记录不能放行。

## 规则评估

根规则增加强制门禁，工程流程定义通知顺序；详细步骤只放在 [多端手册](../../../e2e/LOCAL-MULTI-PLATFORM-E2E.md)。新增预检目录规则并登记索引，保留 hosted 健康检查兼容性。
