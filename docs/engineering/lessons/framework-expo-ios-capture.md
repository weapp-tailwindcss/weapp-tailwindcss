---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417
regressions:
  - e2e/react-native-phase-capture.test.ts
verification:
  - claim: Expo iOS 在 TSX HMR 首帧像素检查通过后耗尽原双帧总预算，第二帧未开始；具体采集延迟原因未定位
    kind: ci
    status: failed
    sha: 93716b6f14babbde359176a285f7d2dfddca5389
    environment: macOS 15.7.9 / arm64，Node 24.20.0，runner image 20260907.0337.1；实际 checkout 08d396cbd47bb0f9238db59d7c668fd1e811f213 与 head 的 Git tree 相同
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40098965568/job/120887159912
---

# 框架隔离 PR 的 Expo iOS 截图首败

## 症状

`93716b6` 的 iOS job 在 TSX HMR 的 `variant-dark / dark-ios` 失败，阶段为 `wait-for-next-frame`。此前 baseline 四十四对、TSX 二十三对截图通过；失败首帧也通过全部三个几何、像素与 control 检查点，但第二帧未开始即耗尽十秒总预算。该阶段失败，后续 CSS HMR 尚未执行。

## 根因与纠正

尚未定位产品或采集链路的具体根因。首帧从 `242.492 ms` 开始，`capture()` 在 `9331.036 ms` 返回，区间为 `9088.545 ms`；读取、解码、评估后于 `9901.482 ms` 通过，外层于 `10026.958 ms` 取消。该区间包含子进程完成、宿主回调调度和文件 stat；缺少独立 spawn/exit 与宿主资源证据，不能称为 simctl 内部执行时间或直接归因于 runner 负载。

同轮此前一百三十四帧的 capture 区间中位数为 `1466.562 ms`、P95 为 `2673.901 ms`、最大 `5453.091 ms`。失败首帧为新极值，不能据此认定整个 HMR 阶段退化。新 publication 已在同一 runtime instance 产生二十三对成功结果，但工件没有完成态 TSX observer 原件，不计算准确的源码保存至 HMR ack 延迟。

十秒合同覆盖整个 case 的两次真实截图、读取、解码和评估；simctl 没有独立的每帧十秒额度。已有首帧或第二帧迟到均拒绝的回归，未发现预算合同矛盾。没有增加预算、删除第二帧或将单帧当作通过。相关采集源码与原基线无 diff，这不豁免本次失败。

## 验证

工件 `12562514392` 为 `15508146` 字节、386 个条目，ZIP SHA-256 为 `523de8572103176b2071b4d0349fa5fd4387f99b0b60d76c0db0825b4aacb5b8`；尺寸、摘要、CRC 和路径边界通过核验。独立核对六十七份成功 pair、最终 PNG、一百三十四张逐帧 PNG 及 receipt；失败首帧另核长度与摘要，使用生产评估器离线重算三个检查点，均与原诊断相同。失败 case 没有第二帧和成功 receipt。

实际 CI source 为 merge `08d396cbd47bb0f9238db59d7c668fd1e811f213`，与 head `93716b6f14babbde359176a285f7d2dfddca5389` 的 tree 同为 `5247e77b06c36b66bf5d4b26e282f5213f156908`；保留真实 sourceCommit。cleanup 为 `pending=false / failed`，交付的仍是原十秒取消原因，没有五秒 drain 挂起或第二个截图进程遗留的证据。

## 适用边界

本记录为 partial，不提交猜测性产品修复。最终稳定提交可作一次有界、仅 iOS 的验收，保留旧首败及本次不同的帧进展；后续通过也不能解释本次采集根因。再次相同条件失败后应分析新证据，不连续重跑取绿。采集生命周期的其他已知问题见[双帧采集与收尾](tailwind-rn-capture-lifecycle.md)。

## 规则评估

不新增 AGENTS 规则，沿用原采集预算、双帧合同和首败保留要求。本轮没有 demo 或样式输出变更。
