---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1330
baseline: 2dd2a11a97f72b4cb90f652f2b5753b0d0467e44
regressions:
  - e2e/react-native-ci.test.ts
  - e2e/react-native-ios-architecture.test.ts
  - e2e/react-native-ios-launch.test.ts
verification:
  - claim: 正式 Intel 首次在 TSX HMR 图片用例第二帧耗尽原预算
    kind: ci
    status: failed
    sha: 2dd2a11a97f72b4cb90f652f2b5753b0d0467e44
    environment: macos-15-intel，4 核 14GiB，Xcode 26.3，iOS 18.5，attempt 1
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41940288591/job/126959356840
  - claim: 唯一同条件确认在 baseline 图片用例第二帧再次耗尽原预算
    kind: ci
    status: failed
    sha: 2dd2a11a97f72b4cb90f652f2b5753b0d0467e44
    environment: macos-15-intel，4 核 14GiB，Xcode 26.3，iOS 18.5，attempt 2
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41940288591/job/126987798936
  - claim: 独立 ARM 现场工具链与目标运行时配对通过
    kind: ci
    status: passed
    sha: 2dd2a11a97f72b4cb90f652f2b5753b0d0467e44
    environment: macos-15 ARM，3 核 7GiB，镜像 20261028.0489.1；driver 7afbfc1126da9b8f7a08db1f207f38dca7d876df 固定 checkout 本源码；仅诊断
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41956823174
  - claim: 独立 ARM 完整 RN 三阶段在全部原门槛下成功
    kind: ci
    status: passed
    sha: 2dd2a11a97f72b4cb90f652f2b5753b0d0467e44
    environment: macos-15 ARM，Xcode 26.3，iOS 18.5；driver 9e9b2837c05ac8ea71e5b5a590f2473a2316e422 固定 checkout 本源码；独立对照，不是 PR 检查
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41957662987/job/127016347241
  - claim: 新 ARM 配置合同先在原 Intel workflow 失败
    kind: unit
    status: failed
    sha: 2dd2a11a97f72b4cb90f652f2b5753b0d0467e44
    environment: macOS arm64，Node 24.22.1，基于该提交加入未提交回归，workflow 仍为原实现
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-ci.test.ts --testNamePattern 'iOS 验证 ARM' --update=none --coverage.enabled=false
  - claim: runner 合同及真实 ABI、启动回归三文件六十三项通过
    kind: unit
    status: passed
    sha: 2dd2a11a97f72b4cb90f652f2b5753b0d0467e44
    environment: macOS arm64，Node 24.22.1，基于该提交的未提交修复工作树；未操作本地设备
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-ci.test.ts e2e/react-native-ios-architecture.test.ts e2e/react-native-ios-launch.test.ts --update=none --coverage.enabled=false
---

# runner 选择与准确源码对照

## 症状

主动 sample 已从正式截图移除，`2dd2a11a` 的首次 Intel 运行仍在 TSX HMR `sizing-size/image` 失败，唯一同提交确认又在 baseline 同用例失败。首帧截图分别约 6418.8ms、6676.1ms；完整解码与像素评估后，第二帧只剩约 2535ms、2548ms。两轮分别记录 168、78 次正式截图，sample 字段均为零，不能再归因主动采样。

首次 artifact `13379152716` 的 ZIP SHA256 为 `8f9ebfcc9ba939cb51515bbe24fa9ebfee163ae607368780dc83281de94a25ee`；确认轮 artifact `13383240256` 为 `0b103a65abe2f98175f6c30dfe31b943dbecb1ede1db5d76d9307d5b1db6153b`。已接受的 82 对、38 对原件分别独立重算通过，失败用例的两张 PNG 也相同且像素通过；被取消的第二帧缺少合格完成时刻，只能保留为诊断，不能补造成功回执。

## 根因与纠正

源码未发现图片加载或布局循环：Image 为固定内联 16×8 PNG，三侧原生加载完成和全部测量之后才请求截图，客户端收到完整回执后才切换案例。两轮截图期间被动资源读取和 event loop 记录也不足以解释命令内秒级等待。现有原件没有证明 swap、GC、PNG 编码、IOSurface 或纯 CPU 架构是确定根因。

历史 Intel 选择来自 `4534f2d67` 的容量假设：旧 ARM 为 3 核 7GiB，免费标准 Intel 为 4 核 14GiB。该选择曾有成功候选，但后续相同源码多次失败，不能继续把增加容量当作已证修复。当前 ARM 与 Intel 的镜像也不同：ARM 是 `20261028.0489.1`、macOS 15.8.2/24H232，Intel 是 `20260824.0482.1`、macOS 15.7.9/24G830。因此此次比较的是整套 runner 组合，不能声称证明了纯 ISA 因果。

先在独立临时分支只读核对 ARM 现场。Xcode 26.3/17C529 原包装脚本要求 `1051.17.8`，全局 CoreSimulator 原始 plist 同为该版本，first-launch 状态为零；iOS 18.5/22F77 可用，目标仍为 iPhone 16 Pro。全部 11 条命令真实完成并确认自有进程组结束，没有启动设备或预热截图。artifact `13382819947` 的 ZIP SHA256 为 `4760bbb1911e8fdd6b4698f9df36d7f564ad4b3c745540d4ef02e08921ae8ad9`，原 wrapper 与前次 Intel 证据逐字一致。

随后独立 driver 固定 checkout `2dd2a11a`，复用完整原 iOS job，只改变标准 runner 组合并增加当前 VM 的 ARM 身份断言。全部前置、构建、启动与三阶段原生验收通过，native 步骤 02:58:19Z–03:13:37Z，约 15m18s；启动主阶段约 7m9.9s，仍消费原三十分钟截止时间。artifact `13384792510` 的 ZIP SHA256 为 `b77cd1a0bd0faddb887a36824e6c3ef9999f87a8d727f445910478e17aa2daf8`，763 个原文件和三阶段 33 项归档摘要逐一核验通过；93 份校验源码逐字绑定 `2dd2a11a` 后，完整阶段校验器也通过。

三阶段各 118 项能力（31 supported、87 明确 unsupported）和 44 对回执，共 132 对、264 张原始 PNG，全部独立解码并重算像素、检查点、字节数和 SHA256；最长双帧评估约 5410.5ms，未超过原十秒预算。270 次正式截图全部为 acceptance/success，没有 sample；HMR 保持同一 runtime 实例，三次 publication 与 manifest 不同。built/installed ABI 均为单 slice arm64，六条 lipo/hash 记录一致，scratch 已删除、readiness 首窗就绪、capture cleanup 已 settled。这是正式配置调整的对照依据，不能替代后续准确 PR head 的检查。

正式 workflow 采用本轮已验证的免费 `macos-15`，先核对 `RUNNER_ARCH=ARM64` 和 `uname -m=arm64`，再执行原 Xcode/CoreSimulator 合同；记录 macOS、核数和内存，标签漂移立即阻断。没有更换 iOS 版本、设备、Node、原命令、评估器或支持集，其他 runner 与 native 发布目标保持原覆盖。

## 验证

新的 runner 合同先在旧 Intel 配置失败，修复后三文件 63 项通过，覆盖 workflow、真实 installed-app ABI 与启动边界。ESLint、actionlint 与 diff 检查通过。独立 ARM 对照的 driver 和测试源码身份分别保留，正式 PR 必须在新的准确 head 重新执行全部适用检查。

## 适用边界

连续双帧十秒、完整 PNG/全像素、drain 五秒、startup 三十分钟绝对截止、iOS job 五十分钟均保持不变，没有增加 case 重试或把离线像素通过转成超时成功。未改 demo、夹具和 static 输出，不更新产物基线；未执行本地设备验收。一次 ARM 成功不能保证消除所有宿主抖动，后续失败仍须读取本轮准确原件，不继续相同条件盲重跑。

## 规则评估

不新增 AGENTS。现有准确源码、runner 现场身份、不可放宽预算和诊断不替代正式门禁规则足够；本轮用配置合同与 hosted 原件约束平台选择。
