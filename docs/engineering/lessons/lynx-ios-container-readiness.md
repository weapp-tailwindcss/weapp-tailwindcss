---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1257
baseline: 62e24d778d0d6fc19e4122912cade266e608e83c
regressions:
  - e2e/lynx-ios-container.test.ts
  - e2e/lynx-native-options.test.ts
---

# Lynx iOS 安装后容器查询超时

## 症状

[Lynx run 36715554493](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/36715554493) 的 attempt 1 和 attempt 3 均在构建、安装之后执行 `xcrun simctl get_app_container <指定设备> com.weapptailwindcss.lynxcompat data` 时超过 30 秒。attempt 3 的失败 job 为 109997194744，样式断言尚未开始。attempt 2 则在 pnpm 的 updateConfig 启动阶段超时，是另一个故障，不能混为一次产品回归。

## 根因与纠正

已定位到 CoreSimulator 只读查询边界，尚不能确认 hosted runner 内部服务为何阻塞。原实现将安装后单次容器查询超时直接作为最终失败，缺少有界的就绪恢复；普通安装成功也不能作为后续查询必然及时返回的证据。

现在仅对带有 execa `timedOut: true` 的容器查询失败恢复一次：先将原始错误写入 artifact 的 `container-query-timeout.txt`，再等待同一个明确设备的 `bootstatus -b`，最后按原 30 秒上限查询一次。再次失败保留两次错误并终止；应用未安装、参数错误、无效路径等不会重试。未增加构建、安装或样式断言的重跑，也未调整样式预期、性能门槛或快照。

首次 bootstatus 同样使用已经解析的设备 ID，避免用户指定设备与通用 `booted` 别名不一致。返回值必须是单行绝对路径，防止空输出被当成当前目录中的报告位置。

## 验证

将原单次查询提取为测试边界后，8 项回归中 6 项失败；加入恢复与路径校验后，容器回归 8 项及现有选项回归 4 项通过：

```sh
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-ios-container.test.ts e2e/lynx-native-options.test.ts --update=none
```

同一命令加入 Lynx iOS workflow，在启动模拟器前验证恢复边界。mock 回归证明错误分类、设备身份和次数约束，不代表本机复现了 hosted CoreSimulator 阻塞；实际修复效果等待新 head 的真实 iOS workflow 验证。

## 适用边界

该流程仅用于 macOS 上的 iOS 模拟器准备，不支持在 Windows/Linux 调用 simctl。路径使用宿主 `node:path`，回归在其他系统仍可执行。没有运行本地全面设备验收，也没有修改 demo、样式场景或 static 基线。超时恢复失败仍应阻断，不能通过循环重跑整个 CI 获取绿色结果。

## 规则评估

不新增 AGENTS 规则；以有界恢复、保留失败证据和持久回归约束准备流程。


## #1258 的相同失败

[PR #1258](https://github.com/sonofmagic/weapp-tailwindcss/pull/1258) 独立分支未包含本修复；run `36755688568` attempt 1、job `110025217436` 在构建安装后再次出现同一 30 秒 `get_app_container` 超时。故同步同一实现与回归，不对该失败盲目重跑。原始 artifact `11118600193` 已保留。外部 CoreSimulator 阻塞根因仍未确定，实际恢复结果等待新 head 的 hosted iOS 检查，不能以 mock 回归宣称真实设备问题已解决。
