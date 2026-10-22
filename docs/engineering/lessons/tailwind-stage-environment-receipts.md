---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 4ea2684361a8080362eb796c7eae5c8a117fa804
regressions:
  - e2e/tailwind-scheduler.test.ts
  - e2e/tailwind-stage-receipt.test.ts
  - e2e/tailwind-weapp-environment.test.ts
  - e2e/wechat-service.test.ts
  - e2e/wechat-automator.test.ts
  - e2e/lynx-native-device.test.ts
  - e2e/lynx-android-host-session.test.ts
  - e2e/react-native-android-device.test.ts
verification:
  - claim: 调度、生产回执、微信会话、设备发现及原生收尾定向回归通过
    kind: integration
    status: passed
    sha: 00b277153bf017758b3a237a7cfff7463152f8bd
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0，包含本记录对应未提交修改，CI=1；子进程为真实 Node/tsx，微信 HTTP 与设备接口使用受控替身，不操作实际 IDE 或设备
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-stage-receipt.test.ts e2e/tailwind-scheduler.test.ts e2e/tailwind-weapp-environment.test.ts e2e/wechat-service.test.ts e2e/wechat-automator.test.ts e2e/lynx-native-device.test.ts e2e/lynx-android-host-session.test.ts e2e/lynx-native-failure.test.ts e2e/react-native-ios-runtime.test.ts e2e/react-native-android-device.test.ts e2e/wechat-session-boundary.test.ts e2e/workflow-cleanup.test.ts --update=none
  - claim: 全 e2e TypeScript 检查仍未通过，不能登记为类型验收成功
    kind: integration
    status: failed
    sha: 00b277153bf017758b3a237a7cfff7463152f8bd
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0，包含本记录对应未提交修改；同配置对照 5b9b027 的独立工作树，规范化工作树路径及行号后比较诊断
    command: pnpm exec tsc --noEmit -p e2e/tsconfig.json --lib ES2022,DOM
    reason: 对照存在1215种既有诊断；本工作树另缺本地构建的 Lynx decoder 类型。修正新增回执的索引访问后，本次修改文件无额外诊断；未改变全仓 tsconfig 或绕过诊断
---

# Tailwind 阶段环境回执与异常传播

## 症状

十五目标运行 `6d596b2e-fe30-4294-b14f-f1fabfdf5126` 的 framework 真正失败是四份 Taro static 快照，父入口却因聚合 stdout 含通过的负向测试所打印的 Lynx/iOS 模拟故障而登记环境阻断。原报告保留，不能将误分类回写为通过。

反向审查发现真实环境故障也可能丢失：微信服务只抛普通错误，案例循环吞掉认证异常；设备发现依赖中文报错；日志、项目关闭、归档和设置恢复能覆盖原始异常。仅删除 stdout 分类会修复误报，却遗漏真正需要停止的场景。

## 根因与纠正

每个登记的宿主生产入口持有本次调用独立 UUID、run ID、目标、生产者及绝对回执路径。父进程只消费自己的终态文件；身份不符、缺失、截断、超大或符号链接均阻断。`failed` 回执即使子进程吞错并零码退出也拒绝通过。未登记的聚合阶段主动清空继承的调用身份，stdout 只作诊断。

生产回执覆盖主流程及收尾，保存 completed、failed 或 blocked。父进程启动/超时只认 Execa 结构字段；生产入口处理自己持有的异常对象，不从其它测试日志恢复控制信号。类型遍历穿透 AggregateError 和 cause，处理循环、重复及深层错误。回执或诊断写入失败保留原异常和收尾异常。

微信服务增加独立领域环境错误，覆盖真实登录、HTTP、协议、服务及租约身份事实。握手截止或连接资源未确认后立即停止；不改写 Page 协议 fallback。微信案例遇类型化环境错误立即退出，关闭自己已取得的项目并尝试落盘后重抛；普通生成或页面错误仍登记 failed。清理失败不批量改写已采集结果、不重连、不重置账号或服务。

Lynx 设备发现与 RN 的 AVD 身份查询在明确环境边界保留 cause。Android 的日志导出与设置恢复分别尝试，日志失败不能跳过恢复；恢复未确认即阻断。Expo 归档使用同一保留原错的收尾机制。

## 验证

先记录失败，再修改负责边界：

- `.tmp/stage-propagation-red.log`：设备发现和聚合异常二项失败，四十二项通过。
- `.tmp/weapp-environment-red.log`：认证类型及吞错五项失败，三十一项通过。
- `.tmp/android-cleanup-red.log`：原有收尾顺序两项失败。
- `.tmp/inner-boundary-red.log`：内部超时、AVD查询与SDK握手三项失败，五十三项通过。

修复后上述定向命令为十二文件、205项通过。覆盖真实跨进程 failed+exit0、日志写入失败、内部超时及 Lynx 结构化失败；受控 HTTP 认证失败不触达实际 IDE。修改文件 ESLint 通过。类型检查结果如前，不冒充全仓类型通过。

本片不改变生成或样式输出，无需重写 static 基线。四个 Taro 基线的真实重建和禁止更新复验另行记录。

## 适用边界

尚须在新源码上重新完成 prepare `--extended`、当前会话原生 Chrome computer use、verify 和实际端侧验收。合同成功不代表真实设备故障已经复现或全面支持已经成立。未知普通 SDK 页面/传输异常继续保持失败，不仅凭文字冒充明确失联。后续078e实际运行暴露SDK终态协议超时漏分类，现按明确生命周期及结构化字段补齐，见[2026-10-22记录](tailwind-acceptance-2026-10-22.md)；SDK内部可恢复错误不提前转换。

全面验收仍为 partial，原生 served bundle、注册夹具、转换 oracle、剩余媒体场景与性能门禁缺口保留；本片不更改支持预期、阈值或重试预算。

## 规则评估

不新增 AGENTS。现有环境故障停止调度、会话归属、收尾和可重放证据规则已足够；通过生产回执和可执行反例落实边界。
