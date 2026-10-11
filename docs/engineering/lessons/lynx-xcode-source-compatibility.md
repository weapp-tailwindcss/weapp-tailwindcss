---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 357c3bf342f44cf3875f5d407fd630e21134fdf4
regressions:
  - e2e/lynx/source-patch.test.rb
  - e2e/lynx/podfile.test.rb
  - scripts/agents/check.test.mjs
---

# Lynx 固定版本的源码修复与 SDK 边界

## 症状

本机 Xcode 27.0 / 27A266a 对固定 Lynx 4.0.1 源码 host 编译失败。首先是五个 Pods 目标声明 iOS 9/10，不在所选 Simulator SDK 的 iOS 15–27 支持范围。临时提升部署目标后，编译依次暴露四处 `future.get()` 未使用结果，以及菜单、全局窗口、文本绘制和键盘窗口废弃 API 的 `-Werror`。

## 根因与纠正

四处同步结果丢弃有精确[上游修复 334ce5c4](https://github.com/lynx-family/lynx/commit/334ce5c4f388cea6d87f4d9fbab7a98c738f520c)。受管 Podfile 只对 Lynx 4.0.1 回移四个 `(void)`，保留 `get()` 的同步、结果消费与异常传播。完整原始/修复后源码 SHA-256 限定输入和结果；未知版本、源码漂移、部分修复均拒绝。文件权限恢复，重复安装幂等。

依赖的最低部署版本与 host 最低版本可以不同，不能把“所有 Pod 必须不低于 host”当作通用规则。本机的非法边界是 SDK 支持下界；`SDKSettings.json` 的 `MinimumDeploymentTarget` 为 15.0。提升到 SDK 下界仍不能解决该版本整体 API 兼容性；修改窗口归属、文本 selector 等会改变待测引擎语义，Ruby 文本替换测试也不能证明原生行为一致。诊断候选和逐轮失败日志已保留在任务 artifacts，最终安装钩子不应用这些 API 迁移，不改依赖部署版本、不关闭警告、不静默升级固定版本。Xcode 27 完整编译仍明确阻塞。

复盘检查器原先只识别 JavaScript/TypeScript 测试后缀，误拒绝 Ruby 回归。增加 `.test.rb` 并保留存在性和仓库边界检查。Ruby 只由 iOS/CocoaPods CI 执行，通用 Node/Windows 检查不会要求 Ruby。

## 验证

`ruby e2e/lynx/source-patch.test.rb` 使用带上游许可证的原始源码，验证只改四处未消费结果、保留 `Run/get`、幂等、只读权限恢复和版本/源码拒绝。`ruby e2e/lynx/podfile.test.rb` 执行实际安装 hook，验证回移接线、签名设置、依赖部署边界保留和缺失 Pod 拒绝。

实际 `pod install` 应用回移成功；临时部署目标诊断使编译越过原来的四处 `nodiscard` 错误，后续失败属于上述 SDK API 兼容性。未取得完整 iOS 构建或运行通过证据。`pnpm agents:test --update=none` 的 13 项回归通过，覆盖 Ruby 引用以及绝对/越界/缺失/非测试路径拒绝。

Android 固定父画布 host 的 Gradle 编译成功。这个结果不证明 iOS、像素支持结论或完整扩展验收通过。

## 适用边界

只对受管 host 的 Lynx 4.0.1 生效；上游修复声明回移到 release/4.2 和 release/4.3，升级到包含修复的稳定版本时必须核对实际源码，删除回移入口及对应源码夹具。本修复不宣布 Lynx 4.0.1 支持 Xcode 27。后续需要兼容的工具链，或经过独立原生回归验证的上游 SDK 迁移；不能用改变警告、部署声明或兼容基线绕过验收。

## 规则评估

不新增 AGENTS 规则。将上游精确修复、工具链兼容性和运行验收分开记录，以持久回归约束补丁边界。
