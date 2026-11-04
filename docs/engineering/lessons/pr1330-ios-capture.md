---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1330
baseline: 5ad094d94539692e82362a5d7877221f8d03e339
regressions:
  - e2e/react-native-ios-screenshot-sample.test.ts
  - e2e/react-native-pair-pixels.test.ts
  - e2e/react-native-artifact-evidence.test.ts
  - e2e/react-native-ci.test.ts
  - e2e/react-native-ios-launch-publication.test.ts
  - e2e/react-native-ios-architecture.test.ts
  - e2e/react-native-launch-wait.test.ts
  - e2e/react-native-ios-capture-readiness.test.ts
  - e2e/react-native-ios-context-request.test.ts
  - e2e/react-native-failure-capture.test.ts
  - e2e/react-native-metro-evidence.test.ts
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
  - claim: 明确 Intel 与预装 CocoaPods 合同的候选完整通过三阶段及原件核验
    kind: native
    status: passed
    sha: e14f99f4c34136c3e8b7b3f094d34388b9506158
    environment: macos-15-intel，4 核 14GiB，Node 24.22.2 x64，Xcode 16.4，iOS 18.5，CocoaPods 1.17.0
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41810042228/job/126507013013
  - claim: 正式提交在 Intel 主机基线首对截图超时，候选成功不能证明迟滞根因消除
    kind: native
    status: failed
    sha: 9c4ce90f4a4675b00bae33d195226aba0e2c4b2b
    environment: macos-15-intel，4 核 14GiB，Node 24.22.2 x64，Xcode 16.4，iOS 18.5
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41815248201/job/126524469573
  - claim: 后续 Intel 首帧超时，采样确认 Apple 包装脚本正在等待选中 Xcode 的子进程
    kind: native
    status: failed
    sha: b4e97053e37f8d6c5109b3ffe012612083474fdc
    environment: macos-15-intel，4 核 14GiB，Node 24.22.2 x64，Xcode 16.4，iOS 18.5
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41820274196/job/126541614433
  - claim: 准确镜像的 16.4 包装脚本与全局组件版本不等，官方初始化后仍未对齐
    kind: ci
    status: passed
    sha: c75a90a06e59ad03c96a23d9504449b753ab3eb8
    environment: macos-15-intel 镜像 20260824.0482.1，Xcode 16.4/16F6，CoreSimulator 1051.17.8；临时诊断，不运行原生语义验收
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41828578534
  - claim: 同镜像只有 Xcode 26.3 的原始包装脚本与全局组件版本匹配
    kind: ci
    status: passed
    sha: 0dcf25e99d47100f5511641ffea39d5f09d878a3
    environment: macos-15-intel 镜像 20260824.0482.1，Xcode 26.3/17C529，CoreSimulator 1051.17.8；只读清单，不运行原生语义验收
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41829463678
  - claim: 对齐工具链后构建安装启动成功，首帧仍耗尽原双帧预算
    kind: native
    status: failed
    sha: 5460437eeb7ddcd7eb149e987c48e2826f92fd7a
    environment: macos-15-intel，Xcode 26.3/17C529，CoreSimulator 1051.17.8，iOS 18.5
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41830744232/job/126577283213
  - claim: 绕过启动等待时四项 HTTP 回归失败，修复后相关七文件一百五十项通过
    kind: unit
    status: passed
    sha: 5460437eeb7ddcd7eb149e987c48e2826f92fd7a
    environment: macOS arm64，Node 24.22.1，基于该提交的未提交启动边界修复，未操作设备
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-ios-launch-publication.test.ts e2e/react-native-ios-architecture.test.ts e2e/react-native-reporter-session.test.ts e2e/react-native-native-wait.test.ts e2e/react-native-ios-build.test.ts e2e/react-native-ios-runtime.test.ts e2e/react-native-ios-launch.test.ts --update=none --coverage.enabled=false
  - claim: 内存诊断超时取消，采样未见 swap 活动，不能定位截图阶段
    kind: ci
    status: failed
    sha: 1b7cdcd5c25f9df003a57534478b1be8729e8cb9
    environment: macos-15-intel，基于 5460437e 的临时只读内存监控，50 分钟 job 上限
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41839269270
  - claim: 后续相同 RN 实现的基线首帧截图和解码超过十秒，失败诊断又延迟收尾
    kind: native
    status: failed
    sha: 3b4864a47aa4d23a8f302e2f135ea7d2ccaae604
    environment: macos-15-intel，4 核 14GiB，Xcode 26.3，iOS 18.5，attempt 2；job 最终取消，保留首次双帧失败
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41863470874/job/126736098909
  - claim: Metro 取消与就绪结果持久化期间停止启动的三项回归在原边界失败
    kind: unit
    status: failed
    sha: 3b4864a47aa4d23a8f302e2f135ea7d2ccaae604
    environment: macOS arm64，Node 24.18.0（低于 engines，仅保留负向复现），基于该提交的未提交工作树，回归先于对应边界修复；未操作设备
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-failure-capture.test.ts e2e/react-native-ios-capture-readiness.test.ts --update=none --coverage.enabled=false
  - claim: 明确切换合规 Node 后复验启动就绪、失败诊断及受影响证据链二十五文件三百五十九项通过
    kind: unit
    status: passed
    sha: 71cc3f1b14888a2a317b7ace3e86a127c3b95060
    environment: macOS arm64，显式 Node 24.22.1，准确已提交源码的后续复验；仅定向单测，未操作设备
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-ios-launch.test.ts e2e/react-native-ios-build.test.ts e2e/react-native-ios-build-scratch.test.ts e2e/react-native-ios-runtime.test.ts e2e/react-native-ios-architecture.test.ts e2e/react-native-ios-launch-publication.test.ts e2e/react-native-ios-capture-readiness.test.ts e2e/react-native-failure-capture.test.ts e2e/react-native-metro-evidence.test.ts e2e/react-native-ios-screenshot.test.ts e2e/react-native-ios-screenshot-streams.test.ts e2e/react-native-ios-host-resources.test.ts e2e/react-native-ios-screenshot-sample.test.ts e2e/react-native-ios-screenshot-sample-lifecycle.test.ts e2e/react-native-native-wait.test.ts e2e/react-native-launch-wait.test.ts e2e/react-native-runtime-artifacts.test.ts e2e/react-native-artifact-evidence.test.ts e2e/react-native-reporter-session.test.ts e2e/react-native-important-evidence.test.ts e2e/react-native-static-entry-scope.test.ts e2e/react-native-phase-evidence.test.ts e2e/react-native-phase-capture.test.ts e2e/react-native-ci.test.ts e2e/react-native-evidence-protocol.test.ts --update=none --coverage.enabled=false
  - claim: 就绪探测通过后首个正式截图仍超过原十秒预算，探测时 Metro 尚未完成打包
    kind: native
    status: failed
    sha: 71cc3f1b14888a2a317b7ace3e86a127c3b95060
    environment: macos-15-intel，4 核 14GiB，Node 24.22.2，Xcode 26.3，iOS 18.5
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41894194692/job/126799625308
  - claim: 没有真实 context 请求时旧实现会提前开始截图探测
    kind: unit
    status: failed
    sha: 71cc3f1b14888a2a317b7ace3e86a127c3b95060
    environment: macOS arm64，显式 Node 24.22.1，基于该提交仅加入未提交负向回归
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-ios-capture-readiness.test.ts --update=none --coverage.enabled=false -t '应用仍在打包'
  - claim: context 事件和受影响启动、取消及证据链二十六文件三百七十六项通过
    kind: unit
    status: passed
    sha: 71cc3f1b14888a2a317b7ace3e86a127c3b95060
    environment: macOS arm64，显式 Node 24.22.1，基于该提交的未提交 context 生命周期修复；未操作设备
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-ios-launch.test.ts e2e/react-native-ios-build.test.ts e2e/react-native-ios-build-scratch.test.ts e2e/react-native-ios-runtime.test.ts e2e/react-native-ios-architecture.test.ts e2e/react-native-ios-launch-publication.test.ts e2e/react-native-ios-capture-readiness.test.ts e2e/react-native-ios-context-request.test.ts e2e/react-native-failure-capture.test.ts e2e/react-native-metro-evidence.test.ts e2e/react-native-ios-screenshot.test.ts e2e/react-native-ios-screenshot-streams.test.ts e2e/react-native-ios-host-resources.test.ts e2e/react-native-ios-screenshot-sample.test.ts e2e/react-native-ios-screenshot-sample-lifecycle.test.ts e2e/react-native-native-wait.test.ts e2e/react-native-launch-wait.test.ts e2e/react-native-runtime-artifacts.test.ts e2e/react-native-artifact-evidence.test.ts e2e/react-native-reporter-session.test.ts e2e/react-native-important-evidence.test.ts e2e/react-native-static-entry-scope.test.ts e2e/react-native-phase-evidence.test.ts e2e/react-native-phase-capture.test.ts e2e/react-native-ci.test.ts e2e/react-native-evidence-protocol.test.ts --update=none --coverage.enabled=false
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

候选 `e14f99f4c34136c3e8b7b3f094d34388b9506158` 的[准确提交验证](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41810042228)中 Web、Android、iOS 全部通过。iOS 的 baseline、TSX HMR、CSS HMR 各有 44 份 receipt、88 帧，共 264 帧、792 个检查点全部通过。逐帧哈希、大小、receipt、旁车和入口原件一致；阶段索引引用的 33 份归档也逐份通过哈希、大小和阶段身份校验。artifact `13313223993` 共 29,194,316 字节，其 ZIP SHA256 为 `7821d46925230bde49f3fa673eccb38936e608242e0475ae826cd65de5ed6869`，与上传日志相同。

270 次截图全部成功，中位数约 1260ms、P95 1570ms、最大 4144ms。双帧验收最大约 6130ms，保持原十秒上限；cleanup 为 `pending: false`、`settled`，没有失败采集诊断。实际运行身份为 x86_64、4 核、14GiB、iOS 18.5、Xcode 16.4（16F6）、CocoaPods 1.17.0。该候选在本轮 Intel 环境完整通过，不能据单轮成功保证消除所有宿主延迟，也不能将低空闲内存解释为旧故障的确定根因。合入 PR 后仍以最终提交完整检查为准。

推送临时分支时先遇到 SSH 500，随后公钥认证失败，最终使用已有 GitHub CLI 登录的 HTTPS credential helper 完成推送，没有更改全局 Git 认证。一次未核实推送结果就发起的 dispatch 实际仍指向旧候选 `4534f2d67`，对应 run `41809782183` 已取消，不计入验证。随后先由 API 确认远端为 `e14f99f4`，再触发上述准确提交运行。后续推送必须检查退出状态及远端 SHA，不能以已发起 push 推断 ref 已更新。

正式提交 `9c4ce90f4a4675b00bae33d195226aba0e2c4b2b` 的相同 iOS 实现在 Intel 主机再次失败，artifact `13315404713` 保留基线 `layout-aspect/default` 首对原件。首帧从约 23ms 开始，截图约 6477ms、解码 1153ms、评估 50ms，三个语义检查均通过；第二帧约 7873ms 开始，约 2106ms 后被原十秒预算取消。PNG 已落盘不能代替真实命令完成，门禁保留失败并完成 SIGTERM 收尾，未将文件存在视为通过。

本轮实际仍为 x64、4 核、14GiB，现场有 771 个进程，simctl 与采样器均曾处于不可中断等待态；采样取消，没有可用栈。load average 约 100–108、低空闲内存和单次进程 CPU 记录不能证明 swap、OOM 或具体服务为唯一根因。没有完整阶段索引或完成报告，不能沿用候选的 264 帧成功代替本轮验收。候选 ZIP 与本轮失败 ZIP 均已分别核验完整性，失败结果不会覆盖为成功。

### 版本错配的直接证据与工具链对齐

`b4e97053` 的 Intel 首帧命令再次耗尽十秒，未完成解码与评估；artifact `13319423317` 保留完整采样。38 个样本均显示 Bash 的 `__wait4`，同刻精确父子关系为本轮 Node → Apple Bash 包装脚本 → `/Applications/Xcode_16.4.app/Contents/Developer/usr/bin/xcodebuild`。进程快照不含 argv，不能仅凭可执行名确定子命令参数。构建临时目录在首帧前约 56 秒已清理，现场无构建进程，排除本轮构建清理与截图重叠的解释。

随后两次独立小型诊断只读取镜像工具链、调用官方初始化和列出运行时，不创建或启动设备，不计入产品验收。首次 artifact `13322380272` 保存准确 Xcode 16.4/16F6 的 729 字节 Apple 脚本，SHA256 为 `6dae42329c6cc5c2919065636a235890384c62ce3672edc10497fead2d52bc8b`。脚本要求 `EXPECTED_VERSION="1010.15"`，全局组件实际为 `1051.17.8`；条件使用精确不等，因此会在每次调用重新执行所选 `xcodebuild -runFirstLaunch` 后才 exec 原生 simctl。

显式官方初始化调用完成无输出，后续 `-checkFirstLaunchStatus` 零退出，但前后组件均为 `1051.17.8`。该诊断的 sudo 调用经 tee 管道，未单独记录其退出码，因此不把它写为独立成功证明。镜像[安装脚本](https://github.com/actions/runner-images/blob/f10516542b8f2fef89b652a8d5f5de63aa543b77/images/macos/scripts/build/Install-Xcode.ps1#L33)本已初始化各 Xcode；不能将故障概括为从未执行 first launch，也不能声称再执行一次便能降级全局组件。

第二次 artifact `13321167938` 保存同镜像所有已安装 Xcode 的原始脚本与版本。只有 Xcode 26.3/17C529 要求的 `1051.17.8` 与全局组件匹配；26.2 要求 `1051.17.7`，16.4 要求 `1010.15`，其余版本也不匹配。26.3 脚本 SHA256 为 `8e4ed565409890f1fd518099f98bb6ccac7419605574d802ac7356fd34f63a5b`。iOS 18.5/22F77 已安装可用，但清单查询仍选中 16.4，不能把它描述为 26.3 的真实编译或运行通过。

将 RN workflow 的完整工具链改选 `/Applications/Xcode_26.3.app/Contents/Developer`，保留 Apple 包装脚本及 iOS 18.5/iPhone 16 Pro。启动设备前核对 first-launch 状态、所选工具路径与准确 CoreSimulator `1051.17.8`，镜像组件再次漂移时立即阻断，避免把初始化成本带入语义采集预算。[Apple 支持表](https://developer.apple.com/support/xcode/)列明 26.3 支持本镜像 macOS 15.7.9 和 iOS 18.5 Simulator；[Expo SDK 54 的官方构建镜像](https://github.com/expo/expo/blob/c8e39590d7dd6d408a8d0f04b6eae3691f674c54/docs/pages/build-reference/infrastructure.mdx#L522)已默认使用 26 系列。SDK 升为 26.2 的编译、链接和渲染差异仍需准确提交完整原生验收，不能由诊断成功代替。

新合同在旧 16.4 配置上失败，修复后与 iOS 构建、运行、截图四文件共 80 项通过。没有修改采样器、原命令完成判断、支持集、PNG、双帧要求或 10s/5s 预算，也没有增加预热截图、固定等待或直接绕过 Apple 脚本。

### 对齐工具链后的失败与独立启动边界

候选 `5460437e` 的完整 RN workflow 中 Web 和 Android 全部通过；iOS 的 Xcode 26.3/17C529、CoreSimulator 1051.17.8 预检通过，SDK 26.2 的编译、安装和直接启动也成功。本轮实际应用为 x86_64、deployment target 15.1；构建临时目录已清理。随后基线 `layout-aspect/default` 第一帧截图耗时约 8627ms，解码约 1185ms，在 pair 约 9865ms 时完成三个语义检查，未留出第二帧预算，原门禁保持失败。

artifact `13325523509` 的 ZIP SHA256 为 `de6c90ba52764603196b364688417fa8a652aac09c4b3dc7538088ec3514b645`。采样已进入实际 CoreSimulator Mach-O，没有发现此前的 xcodebuild 初始化子进程；只能说明错配路径已去除，不能据此宣称截图迟滞消失。数分钟后的诊断截图更快，时刻与状态不同，不能当作预热修复证据。RSS 求和含共享页，低 free、load 和累计 page fault 也不能独立证明 swap 或 OOM。

另一个代码审查确认的问题是启动与采集的边界：`requireLaunchCompletion` 只约束最终报告返回，`/context` 原先只等待 Metro publication。应用启动后，CLI 仍需写入 launch 回执、删除 scratch、关闭输出，此时客户端已可能获得 context 并请求第一对截图。此缺口允许重叠，但不是上述失败的已证实原因；本轮失败时 scratch 已在采集前清理。

iOS 现在从开始就使用 pending 的启动门禁。真实 CLI Promise 完整结束且 `failed/exitCode` 合格后，仍在原 1800 秒预算内核对本轮 `removed`、设备、bundle ID 和 installed-app 单 slice ABI；通过后才读取当前 publication。`/context` 的等待不占用十秒截图预算，未授予 publication 的直接 `/case` 请求继续返回 409。主路径同时观察启动和报告，不以报告反过来解锁 context，避免循环等待；首个请求之前的启动拒绝也立即被观察并保留原错误。

每个 context 等待随 owner 取消，取消不会改写 CLI 的真实结果；迟到成功或失败都不能重新授予 context。HTTP 回归覆盖未绑定、未完成、提前失败和关闭后的两种迟到结果，绕过等待时四项均失败，修复后与 ABI、构建、启动、报告及预算回归七文件共 150 项通过。真实构建回执的 `active` scratch 仍阻断，只有有效 `removed` 回执能发布。Android/Web 继续消费原 publication 路径，后续 HMR 仍逐阶段检查 publication。这一修复仍需准确新 head 的 hosted 验收。

复查又发现 `Promise.all` 先失败并不会停止另一个报告等待器。启动校验失败后，现在先取消并等待报告任务结束再进入主清理；循环在异步读取、恢复操作前后检查 signal，轮询 timer 和已开始的 iOS 恢复命令均支持取消。真实 peer 收尾错误与首错一起保留，正常取消不覆盖首错；CLI 包装保留原结果作为 cause。补充四项 peer 等待回归及真实命令取消回归后，按 workflow 原生预检入口执行十九文件 302 项全部通过；ESLint、actionlint、AGENTS 与 diff 检查通过。

临时内存诊断 `41839269270` 在 50 分钟 job 上限取消，没有完成原生证据发布。artifact `13331187910` 只有内存 NDJSON，ZIP SHA256 为 `37c5ca1a72c86e40308ebd7ee4daeb46960a3df5a7c0b864c3ac11690c775331`。13:55:50.734–14:24:38.371 的 116 组有效样本中，348 次查询均零退出：swap 总量及使用量始终为零，Swapins、Swapouts 和 throttled 增量均为零，`memory_pressure -Q` 为 78–82%，压缩器物理占用峰值约 199.38MiB。pageins 不能算作 swap，RSS 求和也不能算物理内存占用。本轮没有支持 swap thrash 或 OOM 的证据。

Expo 入口在 13:56:04 打印，超时后 runner 仍清理 xcodebuild、ibtoold 和 Node worker；没有本轮构建日志、最终 receipt 或截图，不能确定最后构建阶段，更不能把上述内存数据与未取到的截图时刻关联。运行证据先写临时目录，受控结束才发布到工作区，强制取消可绕过该发布；缺少发布原件不能推断 runner 未执行，也不能证明原生 cleanup 通过。没有据此实施未经证实的内存调参或生命周期重排。

### 首帧吞吐与失败诊断的生命周期

`3b4864a47` 的 attempt 2 已完成构建、安装、启动与 scratch 清理，但在 baseline 的 `layout-aspect/default` 首对失败。artifact `13351827126` 的 ZIP SHA256 为 `23a7d27e4036b3402cc8feff11d1f4f72deed091caab0f517ff6b0dfd18e904c`，与 API 摘要一致。唯一首帧的大小、SHA256 和 x86_64 身份均匹配；独立重算 geometry、pixel、control 三项全部通过。截图命令约 9095ms、读取约 13.6ms、同步解码约 2395ms、评估约 148ms，首帧评估完成于约 11682ms，不能以单帧通过替代原十秒连续双帧门禁。

现场为 4 核，load average 约 189、空闲内存约 45MB；没有全局 swap 或 memory-pressure 原件，不能认定 OOM。现场无 xcodebuild、clang 或 Swift 编译进程，没有据此拆分 iOS 编译与运行 job。此前成功运行与该提交的 RN 实现完全相同，旧首对只需约 2495ms；九分钟后备用截图约 2175ms，但负载也已降至约 51，因此不能由此证明一次固定预热就能解决问题。

启动 CLI 现要求截图、读取、完整 PNG 解码在十秒窗口内连续完成两帧，完成后才退出零并允许父进程发布 context。探测位于构建、启动和 scratch 收尾之后，使用同一进程及原启动截止时间；窗口耗尽才可在剩余预算内再探测，设备、身份或 PNG 错误立即失败，不刷新三十分钟预算，不提前启动五分钟报告或三分钟恢复计时。每次取消均等待真实命令完成，不能用 `Promise.race` 留下后台采集。探测原件与宿主资源写入独立的 `ios-capture-startup` 目录并标记 `diagnostic-only`，不生成 case receipt、不覆盖父截图诊断、不占用或替代真实语义双帧预算。最终诊断写入期间若 owner 取消或到期，仍拒绝就绪并保留失败记录；CLI 在返回前再次核对原 owner 与绝对截止时间。

首错已正常传播，但 Metro failure snapshot 与备用 `failure.png` 开始相隔约 8 分 52 秒；该路径仍有无超时的设备日志采集和写盘。缺少逐命令计时，不能把全部间隔归于某一条命令，也不能称 Node 永久挂死。本轮将失败诊断提取为单一三十秒 owner，Metro 文件、设备日志和备用截图共用取消与单调截止检查，不能在慢日志后再领取完整预算。日志输出由 execa 直接写入文件并等待关闭，取消后保留部分 stdout/stderr；Android dump 与读取分别检查同一个截止时间。最后的诊断 JSON 属于持久化收尾，不声称文件系统本身受严格墙钟三十秒封顶。原错误、诊断错误和后续会话清理错误仍由既有聚合链保留。

Metro 取消以及最终就绪写盘期间取消、到期的三项回归先在原边界失败；修正后与真实子进程取消、部分日志保留、启动发布、ABI、截图 drain 和三阶段证据回放合计二十五文件 359 项全部通过。ESLint、actionlint、AGENTS、架构检查及 release status 通过。workflow 和持久兼容测试入口已纳入新回归。该工作树尚未获得新提交的 hosted iOS 结果，不能将本地单测或旧提交成功视为当前原生验收通过。

### 就绪探测必须晚于应用的真实 context 请求

`71cc3f1b1` 的 hosted iOS 再次失败，artifact `13358436016` 的 ZIP SHA256 为 `4699ac2219e508549ec9235bd1236f201368fb6aaed0648ba34f2dfe5ad191aa`。三轮探测的最后一轮在约 4.404s、9.792s 完成两帧解码，但原 PNG 仍显示 “Bundling 39%”；Metro 响应尚未结束。正式首对发生于约 73 秒后，第一条 simctl 在原十秒内未产出有效 PNG，文件为零字节。探测不是当前可用吞吐的证明，更不是正式语义通过。

确定的生命周期缺陷是把原生 launch 返回当作 JavaScript 已运行。修正后，宿主只在本轮 capability 认证通过的 `/context` 请求中发布一次启动事件，事件绑定 version、runId、invocationId、device 与 bundleId。CLI 在原 owner 和原三十分钟绝对截止时间内等待该事件，再开始既有双帧探测；只有 ENOENT 可轮询，损坏事件或身份不符立即失败。事件通过临时文件和 rename 原子发布，避免读取半份 JSON，不向客户端提前授予 context，也不新增报告或截图预算。

单个 HTTP 请求断开不取消共享任务。事件写入由 reporter 的任务 owner 取消，独立追踪真实完成；写入或 rename 期间取消会清理本 publisher 已提交但未接受的事件。drain 沿用既有五秒上限并保留期限失败；在途状态在真实收尾前保持，最终归档门禁不能复制或删除仍在写入的目录。后续 HMR 请求复用首次事件，不覆盖其来源。新增回归先证明旧实现会在没有 context 请求时提前截图，再验证认证、并发、身份、断开请求、原截止时间、写入取消与超时后保留目录。

现场 load average 约 168、空闲内存约 29MB，未发现活跃原生编译进程；spawn 约 443ms 不能解释完整十秒。没有足够采样将剩余耗时归于 PNG 编码、IOSurface、磁盘或 swap。本轮只修正已证明的探测时点，仍须由新 head 的真实 iOS 验收确认效果。上一修复的失败诊断已在本轮三十秒 owner 内取消并结束，未重现原来的八分五十二秒悬挂。

本轮二十六文件 376 项定向回归在显式 Node 24.22.1 下通过；新 head 的 hosted iOS 仍待验收。

历史环境记录同时纠正：三项负向边界复现和最初 359 项运行实际使用默认 Node 24.18.0；发现后明确指定 Node 24.22.1，并在准确 `71cc3f1b1` 上重新通过 359 项、ESLint、AGENTS、架构和 release status。低于 engines 的首次运行不能作为合规验收。

### 启动准备共用截止时间与中断原件

`19deb9de09fcd6b19cc0ca397bb5fe42f4d557c7` 的[正式 iOS job](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41905362956/job/126838842424)在五十分钟上限取消。Expo 步骤开始于 20:37:52Z，20:38:14.858Z 打印 tsx 入口后没有内部阶段记录；没有本轮日志、回执或截图文件可上传，无法判定最后停在准备、构建、启动还是采集。不能据此认定模块死锁、设备故障或某一命令挂起。

代码边界确认：原三十分钟 owner 在环境收集、static 生成与 Metro 准备之后才建立，前置 simctl 没有取消，HTTP 只有 socket inactivity 限制，最终进程等待也可能无界。修复从证据会话创建前建立唯一绝对三十分钟截止时间，环境查询、真实 static 子进程、报告服务、文件准备、Metro 与 native launch 共用它，传给 CLI 的是同一个绝对值。static 同步编译在独立受管 Node 中执行；父进程在真实 close 后重读固定原件并核对基线、摘要和当前依赖，不接受子进程任意返回路径。

控制器区分取消的逻辑拒绝与实际操作终态，五秒排空期限只建立一次，晚到成功不能覆盖超时。取消后终止本轮进程树并等待 close，晚到文件句柄或报告服务在原操作内部关闭；全局 owned 集合防止 spawn 完成但局部变量尚未赋值时丢失清理。真实 ABI 回执读取同样属于启动 owner，取消后不得修改环境或发布 context。Metro HTTP 使用完整响应的绝对两秒预算，持续滴流不能延长等待。截图双帧十秒、截图 drain 五秒及 job 五十分钟均保持原门槛。

阶段事件按 runId、invocationId、序号原子落盘；超时后的 completed 记录删除，failed 仅供诊断。workflow 给临时证据目录绑定 run/attempt，在运行失败或取消后单独上传 diagnostic-only 原件，不把它当作正式报告。正常原生证据仍走原发布与审核入口。真实子进程回归覆盖同步死循环取消、static 生成后的父回读、错误 invocation 拒绝，以及根先 close、无 stdio 后代忽略 TERM 的进程组消失确认；没有本地设备验收，新 head 的原生效果仍须 hosted iOS 确认。

显式 Node 24.22.1 下，原 iOS 前置清单二十八文件 396 项通过；随后资源与进程组补充回归的九文件 118 项通过，CSS 与 workflow 三文件 104 项通过。ESLint、actionlint、AGENTS、架构及 `pnpm change status` 通过。`tsc -p e2e/tsconfig.json --noEmit --incremental false --pretty false` 报出大量既有错误（包括 ES2021 lib 与现有代码的 ErrorOptions/Array.at 不一致），未调整全仓类型配置；另用相同严格选项与 Git HEAD 源码逐项对照当前修改文件，修正新增诊断，既有错误单独保留。

### 自然退出也必须收回本轮进程组

最终审查发现，启动命令只在取消时收回进程组；根自然 close 后，原入口从 owned 集合删除它，遗留的无 stdio 后代仍可能存活。真实 Node 回归先在 `5a3a4c71` 失败：根返回零，但本轮进程组仍存在。修复在 POSIX 根 close 时立即收回当前组并等待确认；simctl/static 命令同样先确认组消失，再交付结果。Expo 的真实启动完成门禁还等待该清理，不能由零退出先解锁 context。Windows 保持在根仍存活时执行精准 taskkill，未对已退出的 Windows 数字 PID 追加追杀。

该自然退出用例与真实同步死循环、先取消后根 close、static 子进程和命令 mock 两文件十九项通过。原件与预算保持不变；这一补充会形成新的准确 head，`5a3a4c71` 的检查不得代替后续提交。

## 适用边界

本轮修改采集器与评估器，不改 demo、生成样式、组件夹具或 `RN_FIXTURE_HASH` 输入，不重写 static 基线。没有本地原生设备验收，不用定向单测或原件离线重放宣称当前源码已通过 hosted iOS。后续仍失败时应读取新采样和准确阶段原件，不继续相同 head 的盲重跑。

## 规则评估

不新增 AGENTS。现有资源归属、失败保留、准确 head 和原预算规则足够；用持久回归修正具体实现。
