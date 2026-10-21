---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: bb55fbaffaabc5480ae6babba6f968d0afd2ea60
regressions:
  - e2e/react-native-ios-build.test.ts
  - e2e/react-native-ios-build-scratch.test.ts
  - e2e/react-native-runtime-artifacts.test.ts
  - e2e/react-native-diagnostic-archive.test.ts
  - e2e/tailwind-external-native-archive.test.ts
  - e2e/tailwind-stage-receipt.test.ts
  - e2e/tailwind-web-history.test.ts
  - e2e/tailwind-web-history-replay.test.ts
  - e2e/tailwind-web-history-runner.test.ts
verification:
  - claim: 连续两轮原生构建、失败归档及历史部分轨迹的回归通过
    kind: unit
    status: passed
    sha: 83d1ceb929f97083e98c7ad7f0125d876c2dfa0c
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0；测试树与该提交内容一致，CI=1、禁止更新快照
    command: pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-ios-build.test.ts e2e/react-native-ios-build-scratch.test.ts e2e/react-native-runtime-artifacts.test.ts e2e/react-native-diagnostic-archive.test.ts e2e/tailwind-external-native-archive.test.ts e2e/tailwind-stage-receipt.test.ts e2e/tailwind-scheduler.test.ts e2e/tailwind-web-history.test.ts e2e/tailwind-web-history-replay.test.ts e2e/tailwind-web-history-runner.test.ts --update=none
  - claim: 移出已确认归属的旧构建目录后，实际 CocoaPods 原失败阶段通过
    kind: integration
    status: passed
    sha: 83d1ceb929f97083e98c7ad7f0125d876c2dfa0c
    environment: macOS arm64、CocoaPods 1.17.0、Xcodeproj 1.28.1、React Native 0.81.5；从 Expo 项目根运行，未启动原生应用
    command: pod install --project-directory=ios
  - claim: 手写 CSS 对照仍复现 WebKit visited 不绘制，尚未定位宿主根因
    kind: integration
    status: failed
    sha: 83d1ceb929f97083e98c7ad7f0125d876c2dfa0c
    environment: macOS arm64、Playwright 1.64.1、WebKit 27.2、Chromium 156.0.8078.4、独占持久 profile、headless true
    command: node .tmp/visited-hand-css.mjs
---

# 原生构建与失败证据的隔离边界

## 症状

十五目标运行 `f197e131-2dee-4e80-9193-3c2bf41f7b78` 的 RN iOS 在生成运行时报告之前退出：CocoaPods `post_install` 中的 `Xcodeproj::Plist.file_in_conflict?` 抛出 `invalid byte sequence in UTF-8`。最终定位为仓库 runner 的产物隔离缺陷，不能仅归为机器环境波动。

同轮 WebKit 的 visited 仍未达到颜色预期，但重放又读取尚未执行的 restored PNG，追加 ENOENT 并丢失全部已采样断言。两项错误独立存在。

## 根因与纠正

旧 iOS runner 把 derivedData 放在 `ios/.tailwind-derived-data`。React Native 0.81.5 的 `new_architecture.rb` 递归查找工程目录中的 `Info.plist`，仅排除 `/Pods`、`Tests`、`metainternal`、`.bundle`、`build/` 和 `DerivedData/`。旧输出中的二进制 plist 因而进入下一轮 CocoaPods；Xcodeproj 先以文本读取，再执行 UTF-8 冲突正则，尚未解析 plist 就失败。

本机旧目录含二十三份二进制 plist，其中六份落入上述扫描范围；原日志没有首个文件名，不指定哪份最先触发。确认该目录属于本任务旧 runner、没有活动构建后，记录摘要并精确移出源码树保留；未删除源 plist，也未转换构建产物来掩盖问题。代码使用源码树外的独占 `os.tmpdir()/mkdtemp` 目录，安装并核对二进制后清理。持久 `ios-build.json` 保留原路径、二进制摘要和 `removed/cleanup-failed` 状态；原路径是历史信息，不能冒充仍存在的 bundle。

临时根先通过 `realpath` 取得物理身份再创建目录。第一次只规范化输入的修复不足：`fb9553723f7e83e3b6744b8a498c98c99e40b991` 的实际 Xcode 构建成功，但把传入的 `/private/var/...` 返回为 `/var/...`，词法比较仍误报越界。原始 `-showBuildSettings -json` 已先保存到 `ios-build-settings.json`，因而清理 scratch 后仍能证明这次实际路径分歧。最终产物检查改为同时解析构建根与已生成应用的物理路径，再执行原相对路径越界保护；不以固定 macOS 前缀替换处理文件系统身份。

确定性回归同时覆盖两种方向的目录别名，以及词法位于根内、实际符号链接指向根外的应用。后两项在仅规范化输入的实现上分别误拒、误收；修复后均通过，根外哨兵继续保留。真实构建返回值与测试证明分别保存，不把单测通过改写为原生运行成功。

清理仅作用于本轮目录，失败时聚合构建、清理及证据写入异常。强杀不能保证 JS 收尾，须按记录的路径和归属恢复。旧版本遗留目录不由新 helper 猜测或批量删除。

另一个归档缺陷是父入口先读 `report.json` 再复制目录。启动前失败没有 report，详细日志只留在会被下一轮覆盖的共享目录，错误又引用已删除的临时路径。现在父进程提前登记 stage binding，子入口初始化独立的 `runtime-session.json`，通过 run、目标、producer 和 invocation 绑定，先归档本次诊断，再单独读取和验证运行时报告。旧调用身份拒收；诊断文件本身不成为运行时通过证据。

历史重放按 sidecar 实际声明的规范文件名读取已产生截图。未执行的 restored 不读文件，但 required assertions 保持完整，缺少阶段为 null/false；声明已经捕获却丢失或损坏的截图仍拒绝。部分轨迹不再因非空断言解引用而丢失诊断。

## 验证

- iOS 连续构建回归在旧实现的第二轮确定因非法 UTF-8 失败，修复后通过；同时覆盖原始构建错误、证据保存失败和资源清理失败。
- 失败归档回归先证明旧 factory 缺独立身份；生产外部调度整合测试覆盖无 report 的启动失败，以及同 run 的旧 invocation 和既有报告误收。
- 历史部分轨迹四个反例先失败：一个缺恢复图 ENOENT、三个缺阶段解引用。修复后已有像素仍能重算，缺阶段和未达成 visited 仍失败。
- 十文件共一百七十六项通过，最后的小型类型兼容调整另以两文件四十八项通过。ESLint、`git diff --check` 和 `pnpm agents:check` 通过。e2e 全仓类型检查仍有大量既有诊断，不记为通过。
- 符号链接路径和 build settings 归档两个反例分别先因误报越界、缺失原始 JSON 失败，随后 iOS 两文件二十八项及 ESLint 通过，均禁止更新基线。记录为 `.tmp/ios-physical-root-red.log`、`.tmp/ios-physical-root-green.log` 和 `.tmp/ios-physical-root-lint.log`。
- 实际 Xcode 返回别名后的第二组两项红例及三十项通过记录为 `.tmp/ios-xcode-returned-alias-{red,green,lint}.log`；没有放宽产物根或应用身份要求。
- 从 Expo 项目根执行的实际 `pod install --project-directory=ios` 安装完成，七十五个声明依赖、七十四个 Pods；只证明原 CocoaPods 失败阶段恢复，未证明本轮 iOS 渲染或 HMR。

原始记录分别位于 `.tmp/ios-scratch-red.log`、`.tmp/history-partial-red.log`、`.tmp/runtime-identity-red.log`、`.tmp/tailwind-evidence-final.log`、`.tmp/ios-pod-source-boundary-green.log`。本轮 iOS 原始失败已手工精确保全至对应运行目录的 `react-native-ios/manual-preserved-diagnostics/`，明确标为诊断。

独立浏览器实验完全不加载 Tailwind，只使用 `a { border: 8px solid #010203 } a:visited { border-color: #123456 }` 和同目标 probe/reference、未访问 control。真实 HTTP 200、可信点击均成立：Chromium 返回与同 profile 重新导航均首帧通过；WebKit 两条路径各约两秒、十七帧仍为未访问颜色。独立样本、HTML、请求及截图在 `.tmp/visited-hand-css/report.json`，实验脚本也保留在该任务目录。它隔离了 Tailwind 依赖，不能证明 WebKit 关闭 visited，也不放宽生产的两秒预算。

## 适用边界

本修复不补齐 RN served bundle、设备消费安装/HMR 链、Image/ScrollView、原生注册夹具或转换 oracle。WebKit visited 仍保持预声明支持下的失败；源头修复后仍须新鲜预检及端侧验收。全面结果见[当日验收](tailwind-acceptance-2026-10-21.md)，不从定向回归推出全部有效。

## 规则评估

不新增 AGENTS。现有构建图、源码与输出隔离、逐次调用身份、原始证据重放和精确资源清理规则已经覆盖该问题；以可执行回归防止复发。

## 后续实际安装边界

三阶段索引 v2 新增设备实际安装 manifest 与 JS realm 身份，逐 case、回执、报告和归档校验。realm 身份不是认证凭据；它用于拒绝整包刷新冒充 HMR。设备读取 `getPublication()`、`getManifest()`，不从公开 context 构造回显。宿主原始摘要与设备内容语义分别比较，不要求合法不同阶段必须具有不同 manifest 摘要。

审查发现安装中途变化会让失败报告再次拒绝，进而阻断 `/error`。错误交付 helper 现在独立捕获报告投递错误，仍发送原始错误；网络或 HTTP 拒绝返回明确未确认回执，设备日志保留原因，不泄漏新的未处理拒绝。该修复有先红后绿回归；摘要类型与随机值为零的身份边界也已覆盖。实际 HTTP/WS 完整交付链、Image/ScrollView 和注册能力仍未补齐，旧报告保留其原协议与原结论。
