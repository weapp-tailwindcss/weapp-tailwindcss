---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1330
baseline: 9c4ce90f4a4675b00bae33d195226aba0e2c4b2b
regressions:
  - e2e/react-native-ci.test.ts
verification:
  - claim: APK 构建成功后，模拟器因宿主可用磁盘不足而未启动
    kind: native
    status: failed
    sha: 9c4ce90f4a4675b00bae33d195226aba0e2c4b2b
    environment: ubuntu-latest，Node 24.22.2，API 30 default x86_64，emulator 37.2.13.0
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41815248201/job/126526850431
  - claim: 构建与运行隔离合同在原配置上失败，修复后四文件四十一项定向回归通过
    kind: unit
    status: passed
    sha: 9c4ce90f4a4675b00bae33d195226aba0e2c4b2b
    environment: macOS arm64，Node 24.22.1，基于该提交的未提交 workflow 与测试修复，未操作 Android 设备
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-ci.test.ts e2e/react-native-android-environment.test.ts e2e/react-native-android-window.test.ts e2e/react-native-android-device.test.ts --update=none --coverage.enabled=false
---

# PR 1330 的 Android 模拟器数据盘预算

## 症状

正式提交 `9c4ce90f4a4675b00bae33d195226aba0e2c4b2b` 的 Android APK 已构建成功，KVM 检查也已通过。模拟器启动立即报错：`Not enough space to create userdata partition. Available: 5558.01 MB ... need 7372.80 MB.` 随后的十分钟仅为 action 等待已退出的模拟器，最终 `Timeout waiting for emulator to boot`。

Expo 原生脚本尚未执行，因此没有 Android 测试产物。本轮失败不支持任何 RN 样式或 HMR 的通过、失败结论。首次 job 日志保留在上述 Actions 链接，不重跑覆盖首错。

## 根因与纠正

`reactivecircus/android-emulator-runner@v2` 的本次源码为 `a421e43855164a8197daf9d8d40fe71c6996bb0d`。`disk-size` 为空时沿用 AVD 默认 userdata 容量；指定时由 action 在创建 AVD 后将 `disk.dataPartition.size` 写入 `config.ini`，该输入不扩容宿主磁盘。本轮日志显示该值为空，APK、SDK 与依赖安装后的宿主剩余空间无法满足默认数据分区的分配检查。

最初在未提交工作树尝试 `disk-size: 2G`，合同单测通过后继续核对上游源码，发现该配置不足以证明可修复。[官方 emulator 固定版本源码](https://android.googlesource.com/platform/external/qemu/+/9f0811e72acfc46edc39d3d0baedd796f7d03309/android-qemu2-glue/main.cpp#2382)对 API 24 及以上首次启动将 userdata 提高到至少 6GiB，随后要求宿主剩余空间达到其 1.2 倍；7372.80MiB 与首错一致。该候选未提交、未推送，也未按修复完成计算。

最终在 workflow 中拆分 `android-build` 与 `android`：编译 job 构建 x86_64 debug APK，记录实际 checkout HEAD 和 APK SHA256，再上传同 run、同 producer attempt 命名的不可变 artifact。运行 job 在独立 Ubuntu 主机重新检出相同 ref、冻结安装依赖和构建 Metro 所需 workspace 包，并用同版本 Expo prebuild 生成原生工程。随后只通过 producer 输出的准确 artifact ID 下载输入，核对本 checkout HEAD 与 APK 哈希，再经绝对 `RN_ANDROID_BINARY` 交给原生入口。

当前锁定的 Expo CLI 54.0.28 仍需生成工程内的 Manifest、applicationId 和 scheme 解析启动身份；有效 `--binary` 则跳过 Gradle assemble 和 Gradle 安装兜底，直接安装指定 APK。运行主机因此不保留编译 job 的 Gradle、NDK 和原生中间产物，编译临时空间与模拟器数据盘分别占用各自生命周期。下载目录位于 `runner.temp`，不与发布时会清理的运行证据目录重叠。

运行时显式设置 `disk-size: 6G`，记录宿主 `df` 和测试前后的 `/data` 容量。API 30、x86_64、Pixel 2、4GiB RAM、512MiB heap 和完整原生入口保持原合同。模拟器默认十分钟启动时限及双帧十秒采集预算均未增加，步骤失败仍阻断。runner 把多行 script 逐行执行并等待；pnpm 独占一行，失败会立即传播，后面的容量诊断不会掩盖其退出码。

## 验证

新增 workflow 回归在旧配置上因独立构建 job 缺失而失败。修复后验证依赖条件、相同 checkout、准确 artifact ID、输入哈希/源码身份、prebuild 先后和实际二进制路径，同时保留设备、内存、完整入口及不容错边界。CI 合同、Android 环境事务、窗口坐标和设备身份四个文件共 41 项通过，actionlint 通过。未改 demo、样式产物或 `RN_FIXTURE_HASH` 输入，不重写 static 基线。

单测与工作流检查不会创建模拟器，不能证明独立主机容量足够。远端原生验证仍需在准确新提交完成真实安装、baseline、TSX HMR、CSS HMR 和原件验收。

## 适用边界

该配置只作用于本 workflow 创建的临时 Android AVD，不改变本地用户设备的数据盘或 SDK。真实测试期间若再发生磁盘不足，应读取当轮容量与首错，重新核对资源预算，不能由后续 adb 轮询认定启动时限不够。

## 规则评估

不新增 AGENTS。现有准确提交、失败保留、资源归属和完整验收规则已覆盖本问题；用 workflow 合同固定创建 AVD 时的资源输入。
