---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: ed4500bf5df0282f084aabc248f74e6b7070330e
regressions:
  - e2e/lynx-evidence.test.ts
  - e2e/lynx-native-artifacts.test.ts
  - examples/react-lynx/src/compatibility/native-reporter.test.ts
  - examples/react-lynx/src/compatibility/native-evidence.test.ts
---

# Lynx 报告、运行身份与截图落盘绑定

## 症状

已有 PNG 尺寸和可见 RGBA 验证，但新报告仍可能使用上轮截图。回归先保留历史报告和任意有效差异图片，再通过更新器的 `readNativeReport` 入口读取：原实现返回成功，新增拒绝断言实际失败。

## 根因与纠正

JS 用内存截图计算 checkpoint，写图方法却可缺省且无确认；原生端使用固定文件名，iOS 忽略写入失败，runner 又忽略部分读取/复制失败。报告与磁盘图片之间没有本轮身份及字节绑定。只验证 PNG 可见差异不足以证明图片属于该报告。

runner 现在对整个输出目录独占领取，在设备发现前拒绝复用；避免构建前失败时把旧报告遗留为本轮证据。staging 一次读取 bundle，生成 UUID 和 SHA-256，将同一份字节与身份保存到 host 和附件。两端 host 对实际加载字节重新计算哈希，不只回显参数。

原生存储按 runId 独占目录，逐帧落盘后返回身份、文件名、SHA-256 和长度。失败会使整轮存储进入不可发布状态。JS 等待每帧确认，拒绝超时、旧 run、缺图、待写入时提交及重复发布；迟到的确认不能恢复失败会话。原生发布时由实际写入回执生成 manifest。

收集器先按 catalog 检查完整且唯一的帧集合，再逐张读取、核对字节并写入 `crops/<runId>/`。读取或复制失败直接上抛。实时验收与更新器都强制验证独立 context、bundle、manifest、字节及 PNG 像素；历史报告只保留展示和结论比较用途。

## 验证

- `CI=1 pnpm e2e:lynx --update=none`：示例 4 文件 16 项、根 Lynx 6 文件 52 项通过，包括真实包/Rspeedy 构建及 encoder。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-native-artifacts.test.ts e2e/lynx-native-options.test.ts --update=none`：16 项通过。已有成功输出的目录在任何设备操作前拒绝。
- `CI=1 pnpm exec tsx e2e/lynx/test-evidence-store.ts android` 与 `ios`：编译并调用实际 Java / Foundation 存储实现，将图片目录替换为普通文件制造真实 I/O 失败，确认无回执且不能发布；覆盖 bundle 错配、旧 run、重复帧、非法路径和重复发布。
- Android 完整 host Gradle 编译通过，APK 内 context 和 bundle 的字节哈希与 staging 一致；未安装或启动设备应用。
- `CI=1 pnpm e2e:lynx:static:update` 限定 React Lynx 重新生成静态证据；118 项结论全部不变，仅生成时间变化。随后不更新模式验证通过。
- 示例类型检查及严格定向 TypeScript 通过。原生存储测试接入两个平台的 CI 准备阶段。

## 适用边界

本修复建立证据关联，不证明每个样式语义或双端像素已经通过。iOS Foundation 测试在 macOS 编译执行，完整 Lynx host 仍受本机 Xcode 27 与固定 Lynx 4.0.1 的工具链兼容问题阻塞。最终 Android/iOS 模拟器报告仍需在新协议下重新采集和审查；没有自动更新原生支持基线。

## 规则评估

不新增 AGENTS 规则。用可执行协议、真实存储失败回归和输出目录所有权约束落实现有证据要求，避免依靠人工记得清理旧截图。
