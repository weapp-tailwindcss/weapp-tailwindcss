---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 246279f8444ae055f35e0025738c420ad3f76cad
regressions:
  - e2e/preflight-runtime-scope.test.ts
  - e2e/preflight-runtime-tools.test.ts
  - e2e/lynx-gradle-java.test.ts
---

# 扩展回归的原生工具链预检

## 症状

全面预检验证了 Android/iOS 设备交互，但没有验证扩展流程新增的 RN/Lynx 原生编译工具。运行 `5673670d-8452-409e-b0f2-a72825b6fc48` 领取了普通报告后开始构建；只读审查发现 Lynx 的 Gradle 不在 PATH、有效 Java 是 8、SDK 环境变量为空。设备在线不能证明原生工程可以构建。

本轮根构建的 69 个任务通过，全量单测 6,905 项通过、43 项已有跳过。发现缺口后结束所属预检服务，运行中的单测完成后，门禁阻止后续阶段。本机实际已有 Gradle 8.10.2、Java 21、Android SDK 和 CocoaPods，问题来自配置选择与预检范围缺失，没有通过安装或跳过掩盖。

## 根因与纠正

- 扩展流程必须领取 `prepare --extended` 生成的活动报告。范围由服务端会话校验，不能修改磁盘 JSON 冒充；普通预检保持原有工具要求。
- prepare、verify、领取前验证双端原生工具链；RN/Lynx 原生阶段再次复查。Gradle、Java、SDK、CocoaPods 和 xcodegen 的实际命令及版本随报告保存。
- RN 与 Lynx 原先使用相反的 SDK 变量优先级。共享解析拒绝冲突，预检和运行使用同一选择规则。验证所选 platform、固定 Lynx Build Tools，以及当前 RN 版本声明的 Build Tools/NDK。
- Java 检查针对消费者有效覆盖值，允许全局 Java 8 被有效 JDK 覆盖。Lynx 显式约束 Gradle daemon 的 Java，避免用户级 Gradle 配置覆盖已验证的 JDK；复查实际 daemon 选择。
- 带目录的工具覆盖值、SDK 和 JDK 使用绝对路径，避免仓库预检通过后，在临时原生 host 中解析到另一位置。相关环境变量纳入报告身份。

## 验证

`preflight-runtime-scope.test.ts` 的六个回归在修复前失败，覆盖普通报告冒充、双端缺证、领取与阶段复查。工具回归覆盖 Gradle 缺失、Java 版本、SDK 组件、CocoaPods 两条路径、配置冲突及 Windows/POSIX 路径。`lynx-gradle-java.test.ts` 验证实际构建调用的 launcher/daemon 约束。

`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/preflight-runtime-scope.test.ts e2e/preflight-runtime-tools.test.ts e2e/lynx-gradle-java.test.ts e2e/lynx-native-command.test.ts e2e/preflight-gate.test.ts e2e/preflight-evidence.test.ts e2e/preflight-probes.test.ts e2e/demo-workflow-extended.test.ts e2e/demo-workflow-quality.test.ts --update=none`：9 文件、122 项通过，0 跳过。新增工具链模块严格 TypeScript 检查、改动代码 ESLint 和 agents 检查通过。

## 适用边界

版本与文件探针仅证明工具链可执行和组件存在，不代表 Pods 安装、原生构建、设备运行或性能验收通过。完整扩展流程仍需在最终提交重新预检后执行；本改动不涉及 demo 或样式输出，无需更新 static 基线。

## 规则评估

沿用现有本轮预检、配置绑定和环境缺证阻断规则，以共享选择逻辑和回归落实边界，不新增根规则。
