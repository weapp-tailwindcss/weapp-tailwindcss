---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1330
baseline: 5ad094d94539692e82362a5d7877221f8d03e339
regressions:
  - e2e/react-native-ios-screenshot-sample.test.ts
  - e2e/react-native-pair-pixels.test.ts
  - e2e/react-native-artifact-evidence.test.ts
  - e2e/react-native-ci.test.ts
verification:
  - claim: 首次 iOS 在 TSX HMR 第二帧耗尽原十秒采集预算
    kind: ci
    status: failed
    sha: 5ad094d94539692e82362a5d7877221f8d03e339
    environment: macos-15 hosted arm64，Node 24.22.2，iOS 18.5，attempt 1
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41776793134/job/126399096381
  - claim: 同提交有限复测在 CSS HMR 的另一用例第二帧再次耗尽原预算
    kind: ci
    status: failed
    sha: 5ad094d94539692e82362a5d7877221f8d03e339
    environment: macos-15 hosted arm64，Node 24.22.2，iOS 18.5，attempt 2
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41776793134/job/126445408721
  - claim: Bash 身份及未实际采样的额度回归在原 owner 上四项失败
    kind: unit
    status: failed
    sha: 5ad094d94539692e82362a5d7877221f8d03e339
    environment: macOS arm64，Node 24.22.1，基于该提交加入未提交回归，采样 owner 仍为原实现
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-ios-screenshot-sample.test.ts --update=none --coverage.enabled=false
  - claim: 身份与额度修正及像素阈值等十五文件一百九十五项定向回归通过
    kind: unit
    status: passed
    sha: 5ad094d94539692e82362a5d7877221f8d03e339
    environment: macOS arm64，Node 24.22.1，基于该提交的未提交修复工作树；未操作设备
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-ios-screenshot-sample.test.ts e2e/react-native-ios-screenshot.test.ts e2e/react-native-ios-host-resources.test.ts e2e/react-native-ios-screenshot-sample-lifecycle.test.ts e2e/react-native-ios-screenshot-streams.test.ts e2e/react-native-native-wait.test.ts e2e/react-native-runtime-artifacts.test.ts e2e/react-native-artifact-evidence.test.ts e2e/react-native-pair-pixels.test.ts e2e/react-native-evidence-protocol.test.ts e2e/react-native-frame-evidence.test.ts e2e/react-native-control-evidence.test.ts e2e/react-native-important-evidence.test.ts e2e/react-native-image-evidence.test.ts e2e/react-native-scroll-evidence.test.ts --update=none --coverage.enabled=false
  - claim: Taro Webpack 首次构建峰值 RSS 超线，有限复测在原门槛下未复现
    kind: ci
    status: passed
    sha: 5ad094d94539692e82362a5d7877221f8d03e339
    environment: ubuntu-latest，Node 22.23.4，相同 merge checkout、基线及每侧三轮采样；保留首次失败
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41776793092/job/126447585841
  - claim: 采样修复后完整三阶段及双帧原件通过，但不能证明宿主延迟根因已消除
    kind: native
    status: passed
    sha: 1d9d9f06a0590589ddf4540dae9461862313ca70
    environment: macos-15 hosted arm64，Node 24.22.2，iOS 18.5
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41796391159/job/126461609328
  - claim: 相同 RN 实现在后续提交再次因宿主操作耗尽双帧十秒预算
    kind: native
    status: failed
    sha: 570afa4eaeaeafccf5479bbf54700dd7290257b8
    environment: macos-15-arm64，3 核 7GiB，Node 24.22.2，iOS 18.5
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41802204075/job/126480737536
---

# PR 1330 的 iOS 截图与采样额度

## 症状

同一 head 的首次运行与一次有限复测均在双帧十秒预算内失败。首次为 TSX HMR 的 `syntax-important/class-important`；第二次为 CSS HMR 的 `variant-dark/inline-important`。两次首帧的几何、像素与 control 均通过，不能将它们解释为已证明的样式错误，也不能以首帧通过代替双帧门禁。

第一次首帧在 pair 的约 2973ms 完成截图、3614ms 完成判断；第二帧约在 3754ms 开始，约 6287ms 后收到取消。第二次首帧截图耗时约 9101ms，判断完成于 9502ms；第二帧约在 9605ms 开始，只剩约 400ms。主要延迟发生在截图进程退出前，不能仅以本地 JavaScript 热点解释九秒命令延迟。

两轮主机均为 3 核、7GiB，失败附近 load average 很高。沿用[既有 iOS 命令迟滞记录](ios-simulator-command-stalls.md)的边界：load average 不是 CPU 利用率，空闲内存不是完整内存压力，不据此认定 OOM、某个服务或唯一根因。两轮原件分别保存在 Actions artifact `13298326101`、`13304283790`，没有覆盖首轮失败。

## 根因与纠正

确定的诊断缺陷是额度在身份检查前就被消耗。第二轮第一张慢截图领取额度，但进程内核身份为 `/bin/bash`，随后被白名单拒绝；后续真正九秒的截图已不能再采样。Apple 的合法 simctl 工具可以先由 Bash 初始化，再 exec CoreSimulator 内的原生程序，不能仅据 Bash 身份认定为用户进程或 runner 自定义包装器。

采样器继续绑定本任务 spawn 的 ChildProcess、PID、PPID、出生时间和存活状态，增加对 Bash 启动阶段的支持。身份不符、查询失败或查询期间已取消均不消耗实际采样额度；在途身份查询互斥，一轮仍至多启动一次真实采样。取消、独立五秒 drain、迟到失败与原截图命令均保留。

本机 Xcode 27.2 的 `xcrun --find simctl` 返回 Apple Bash 脚本，脚本设置选中 `DEVELOPER_DIR`、核 CoreSimulator 版本并可能执行 first-launch。CI 使用 Xcode 16.4，不能把本机脚本当作 CI 原件，也不能强制要求 `--find` 返回 Mach-O，或直接跳过 Apple 初始化。没有采用直接替换底层工具的方案。

另一个已测热点位于逐像素比较：每像素重复创建 offsets、RGB delta、通道数组和回调。改为每行三个偏移及 RGB 标量计算，仍遍历所有像素、保持累计顺序、前景和 control 阈值、优先级独立颜色及 Image/ScrollView oracle。十秒预算、PNG、连续两帧及离线逐帧重算均未改变。

## 验证

四项采样回归在原 owner 上失败，修复后与现有取消、身份、双帧和组件证据用例合计 195 项通过。新增像素回归覆盖每个 RGB 通道的 10/24/2 阈值、15/16 前景像素、5% 不匹配边界，以及最后一行和最后一列，防止通过稀疏采样获得虚假的性能收益。

以旧实现独立保存的计算结果对比两轮 CI 的 384 份可解码帧，所有检查点逐字相同。首轮超时留下的一份截断 PNG 无法解码，明确排除，未按成功计算。两轮原始 pair、PNG 和各自阶段身份均未改写。

Node 24.22.1 下对同一张 1206×2622 原件及 480×384 比较区，旧实现 CPU profile 的评估主函数占约 78.8%、GC 占约 8.4%。同进程交替测量、预热五次后各测三十次，评估中位数约 8.35→1.15ms，P95 约 10.10→1.40ms。该结果只证明局部开销减少，不能证明 simctl 延迟根因已消除；准确新 head 的远端运行仍需单独验收。

Taro Webpack 首次三组 build peak RSS 的中位数为 1308.46→1403.82MB，+7.29%；同提交有限复测为 1298.65→1284.33MB，-1.10%，原 5%/64MB 门槛通过。未执行反向确认，结论限于首次退化未复现，不声明 GC 根因或性能改善，也未修改产品性能门槛。

### 后续宿主延迟与明确的主机合同

修复提交 `1d9d9f06a` 的 hosted iOS 已完成 baseline、TSX HMR、CSS HMR：264 份原始帧检查全部通过，270 次截图全部成功，中位数约 583ms、P95 977ms、最大 2721ms。后续 `570afa4ea` 只改 PostCSS 和复盘，相同 RN 实现却在 CSS HMR 的 `flex-direction/default` 再次失败，因此前一轮成功不能作为延迟根因已解决的结论。

新失败原件为 artifact `13309747523`。首帧开始前已消耗约 2643ms，源码对应 pair JSON 的异步写入阶段；首次截图约 3667ms，解码约 199ms，评估仅 6.48ms，三个检查点全部通过。第二帧开始于约 6617ms，截图约 3327ms 后被原十秒外层预算取消。缺少写入细分指标，不能确定前奏来自磁盘、线程池还是调度。190 次成功截图中位数约 1537ms、P95 2834ms、最大 7437ms，说明本轮整体宿主操作更慢。

唯一采样在失败约七分钟前，未与失败 pair 竞争。采样确认所属 Bash 进程随后变为同 PID/PPID 的真实 simctl；截图结束时取消符号处理，没有可用栈文件。进程快照有 693 个进程、200 个 runnable 状态，其中 192 个为模拟器直接子进程；仅能记录这一时刻，不能由此证明具体服务或 OOM。没有主机 swap 或 memory-pressure 证据。

运行日志显示通用 `macos-15` 实际解析为 `macos-15-arm64`。根据 [GitHub 标准 public runner 规格](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#standard-github-hosted-runners-for-public-repositories)，该主机为 3 核、7GB；显式 `macos-15-intel` 为免费标准 4 核、14GB。将 iOS 主机标签明确固定为 Intel，并通过 `DEVELOPER_DIR` 固定 Xcode 16.4。[官方 Intel 镜像清单](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md)仍提供 iOS 18.5 与 iPhone 16 Pro。架构校验继续按实际宿主检查 arm64/x86_64，不伪装 ABI，不选择付费 larger runner。

新增 workflow 合同先在原标签上失败，修复后验证主机、选中 Xcode、原 18.5 设备、完整入口和 10s/5s 预算。主机方案仍需准确提交的 hosted 验收，不能预先宣称 Intel 一定消除所有截图迟滞。未更改支持集、PNG、像素门槛或双帧要求。

候选 `4534f2d67de675fac05666c94e3d3a279dacc6e3` 在临时分支的 [Intel 验证](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41808240617/job/126500847322)确认 macOS 15.7.9、Node 24.22.2 x64、Xcode 16.4（16F6），但在原有 `brew install cocoapods` 准备步骤失败，未进入 Expo。该镜像已通过 Ruby 3.3 提供 CocoaPods 1.17.0；重复 Homebrew 安装又引入 Ruby 4，随后因 `/usr/local/bin/pod` 已有链接而退出。[准确镜像清单](https://github.com/actions/runner-images/blob/macos-15/20260824.0482/images/macos/macos-15-Readme.md)和日志均确认工具已存在。将准备步骤改为 `pod --version` 验证并消费预装工具，不覆盖链接、不改写 Ruby；缺失或失效仍立即阻断。补充回归要求验证预装 pod，并拒绝恢复无条件的重复安装。

## 适用边界

本轮修改采集器与评估器，不改 demo、生成样式、组件夹具或 `RN_FIXTURE_HASH` 输入，不重写 static 基线。没有本地原生设备验收，不用定向单测或原件离线重放宣称当前源码已通过 hosted iOS。后续仍失败时应读取新采样和准确阶段原件，不继续相同 head 的盲重跑。

## 规则评估

不新增 AGENTS。现有资源归属、失败保留、准确 head 和原预算规则足够；用持久回归修正具体实现。
