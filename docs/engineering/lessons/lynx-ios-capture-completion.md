---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: 8d8e1acf067a63f048f4ee4368fb212b13a691ac
regressions:
  - e2e/lynx-capture-scroll.test.ts
  - e2e/lynx-ios-recording.test.ts
---

# iOS 宣传录制应等待原生滚动完成回调

## 症状

2026-10-19 的 18 秒宣传采集在原生滚动验收时失败。本轮原始 `capture-scroll.json` 已记录真实滚动范围 `326.6666259765625`、`afterSeconds: 6.028748333337717` 和 `returnStartedSeconds: 18.412557708332315`，但没有 `returnedOffset`、`completedAt` 或 `completedSeconds`。

失败目录保留为视频工程 `.capture/ios-Lnazvu/raw/`。这些数值只能证明发生了向下滚动及发起返回，不能证明返回顶部完成。

## 根因与纠正

`CaptureScrollRecorder` 在返回动画开始后 0.9 秒测量实际偏移并原子写入完成证据。Node runner 按录屏请求时长结束后立即停录、只读取一次 JSON；主线程调度存在实际延迟，读取时仍可能处于返回动画阶段。

纠正集中在采集编排：请求时长结束后继续录制，最多再等 10 秒，轮询本轮原生完成字段；只有拿到完成记录后才结束原片并执行原有严格校验。未生成文件会在同一上限内等待；错误、旧 run、旧 bundle 或非法 JSON 立即保留原始内容并失败；超时保留最后一次原始 JSON 并失败。失败路径也会正常停止录屏以封装原片。

未改变原生滚动计划、偏移测量方式、时间范围或证据验收阈值。最终 JSON 有完成字段仍须通过真实往返偏移、bundle/run 身份及完整时间顺序校验。

## 验证

先增加两个回归，确认旧实现分别因提前读取及缺少有界等待失败，再实现修复。定向验证命令：

```bash
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-capture-scroll.test.ts e2e/lynx-ios-recording.test.ts e2e/lynx-native-options.test.ts --update=none
```

3 个文件共 40 项通过，覆盖延迟的原生完成写入、未完成超时及证据保留、旧轮次及错误拒绝、等待期间持续录屏、失败后停止录屏，以及非滚动录制时长不变。`capture-scroll.ts`、`ios-recording.ts` 和 `run-ios.ts` 的定向 TypeScript 检查通过。

修复需合入主录制工作树后重新采集 iOS；本记录不把模拟回调的单测当作设备验证，也不把这次失败目录作为有效成片素材。

## 适用边界

此变更只影响内部 iOS 宣传录制。请求秒数是最低录制时长，原片可能额外包含本轮原生完成等待；后续剪辑仍应以 `ffprobe` 测量和真实素材区间为准。未收到有效完成证据时不能宣称滚动验收通过。

## 规则评估

不新增 AGENTS。已有保留失败证据、明确本轮身份及禁止放宽验收的规则足够；本次用持久回归约束录屏停止时机和有界等待。
