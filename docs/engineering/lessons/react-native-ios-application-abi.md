---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: f7ad6800111554a9fd7c3a7231a5a3328492270e
regressions:
  - e2e/react-native-ios-architecture.test.ts
  - e2e/react-native-ios-build.test.ts
verification:
  - claim: 构建和安装二进制的架构证据、启动回执读取边界及邻接回归通过
    kind: unit
    status: passed
    sha: f7ad6800111554a9fd7c3a7231a5a3328492270e
    environment: macOS、Node 24.22.1、本 worktree 未提交修复；原生命令使用受控替身
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-ios-architecture.test.ts e2e/react-native-ios-build.test.ts e2e/react-native-ios-build-scratch.test.ts e2e/react-native-ios-runtime.test.ts e2e/react-native-android-environment-entry.test.ts --update=none --coverage.enabled=false
  - claim: 新实现生成的真实 iOS 应用 ABI 回执与三个阶段报告一致
    kind: native
    status: pending
    sha: f7ad6800111554a9fd7c3a7231a5a3328492270e
    environment: 待修复提交的正常 iOS CI 或完成环境预检后的真实设备验证
    reason: 当前远端仍为 2f87a6ac，修复尚未推送；本地回归不能代替真实 iOS 验收
---

## 症状

PR #1323 的 `2f87a6ac` 正常自动 Expo run `41136744506` attempt 1 全部 job 成功，但 iOS artifact `13017427714` 三阶段报告的 `environment.abi` 为 `x86_64`。同包应用 target 的 build settings 为 `ARCHS=arm64`、`NATIVE_ARCH_ACTUAL=arm64`、`ONLY_ACTIVE_ARCH=YES`。这证明元数据的来源不一致，不能仅凭运行用例成功接受报告中的应用 ABI。

## 根因与纠正

`run-native.ts` 在应用构建前执行 `simctl spawn <device> /usr/bin/uname -m`，随后把该结果覆盖到三个阶段报告。它测量的是另一个 Simulator 进程的执行环境，没有绑定目标应用的主程序或 Debug dylib；改成宿主 `process.arch` 也不能修正这条来源关系。

修复复用已有的构建/安装二进制 SHA256 相等链：对主程序及哈希清单中的全部顶层 `.dylib`，分别执行 built/installed 路径的 `xcrun lipo -archs`。逐文件保存原始 stdout、路径、名称、SHA256 和派生 ABI，解析前先保存原输出。所有文件必须给出一致、唯一的 `arm64` 或 `x86_64`；空、未知、多 slice、两侧或主壳/dylib 分歧、命令失败均在 launch 前阻断并保存失败阶段。

runner 移除 uname 的 ABI 覆盖，改由实际启动/回执边界等待 baseline 启动完成，再消费本轮独立证据目录中的 `ios-build.json`。读取器核对应用和设备、最终阶段、launch PID、scratch 清理、文件组合、stdout、架构与哈希，成功后一次性更新供三个阶段复用的环境。

## 验证

原实现先有 9 项新回归失败，24 项既有构建控制通过。最终 5 文件 98 项通过，禁止更新快照。覆盖 arm64/x86_64、主程序和 Debug dylib 两侧证据、歧义输出、读取失败、回执身份/哈希/路径矛盾、deferred 启动门禁前零读取与环境不变、放行后一次读取、原启动拒绝和错误回执不覆盖环境。新增调用边界由真实 runner 使用；测试没有驱动完整 runner 或真实 Simulator。

显式 lint 使用 `--no-ignore`；首轮样式/导入排序失败保留并修正，不计为产品红。原 300 秒报告、1800 秒初启、120 秒 HMR 及截图预算不变。原失败包封存，不重写报告，不用新候选解释历史 uname 的具体内部架构来源。

## 适用边界

本轮契约证明与构建相同的已安装单 slice 主程序及已登记顶层 dylib 的 ABI，不直接观察运行进程，也不覆盖 `Frameworks`。它会主动阻断可能合法的 fat binary/dylib，不能据此声称 iOS 不支持多 slice；需要支持时须补充明确的 slice 选择来源。新真实 iOS 回执仍待验收，既有 strict2、全面测试和正常审核阻塞均保留。

## 规则评估

不新增 AGENTS 规则。现有“绑定本轮设备、源码和产物身份”的边界已经适用；新增持久回归约束证据来源，避免只修正报告字符串。
