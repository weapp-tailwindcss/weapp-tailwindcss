---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1286
baseline: 79bc7a68a14b4f736e675e7d5c98915cbff010ef
regressions:
  - e2e/lynx-ios-build-target.test.ts
  - e2e/lynx-native-device.test.ts
  - e2e/lynx-ios-container.test.ts
  - e2e/lynx-native-artifacts.test.ts
  - e2e/lynx-ci.test.ts
---

# Lynx iOS 构建身份与运行就绪分离

## 症状

[Version PR CI 38344797509](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38344797509) 的 attempt 1、head `4daddc195203537f097ade1d0928bb18cffa70fa`，Lynx iOS job `115125913267` 在成功 create、boot、bootstatus 后，精确 UDID 的 `simctl list devices <ID> --json` 再次超过原 30 秒上限。尚未进入 host、bundle、Pod、原生构建或样式断言。旧 run `38320948522` 也在这个边界失败，不能把重复故障当作单次偶发而盲目重跑。

当前失败诊断记录 3 核、7 GiB 主机 load average 从 255 升至 273，692 个进程中有 176 个 runnable，其中模拟器的 168 个子进程有 149 个 runnable。精确查询已真实 spawn，约 33 秒被 SIGTERM 回收，stdout/stderr 均为空。`sample` 自身超时，没有有效线程栈。证据证明严重调度拥塞，不足以证明 OOM、CoreSimulator 死锁或具体内部阻塞点。

成功与失败运行都出现 terminal `Finished`，旧失败甚至在 bootstatus 后较长时间才进入查询。不能据此认定固定等待会解决问题，也不能把 bootstatus 成功当作后续查询必然健康的证明。

## 根因与纠正

可确认的设计问题是把“构建目标身份”与“运行设备就绪”耦合：bundle、host staging、xcodegen、Pod 和原生编译需要确定目标，不需要 guest 已 Booted；旧流程却在任何准备之前执行运行就绪发现。

CI 在创建自身模拟器后、启动之前，仍按原 30 秒预算查询真实精确库存，要求明确、available 的 Shutdown 目标。准备文件保存原始库存、构建身份和真实 checkout HEAD，并绑定 GitHub run ID 与 attempt；只允许本轮 macOS hosted CI 消费。过期、损坏、缺失、身份冲突或写入失败均阻断，不回退其他设备，也不覆盖旧文件。准备阶段失败和命令诊断始终上传。

runner 以该证据进行 bundle、Pod 和 xcodebuild。真实编译完成后才执行原 120 秒 bootstatus。CI 自建目标的 ID、runtime 和 destination 已由启动前不可覆盖 manifest 锁定，`bootstatus -b` 又针对同一 UDID 等待启动完成，因此不再在 hosted runner 上重复调用全局 CoreSimulator `list` 查询；该查询在高并发主机上曾在原 30 秒窗口内卡住，且不会增加身份信息。安装前仍核对返回设备与 manifest 的 ID、runtime、destination，并保留本地借用设备的 Booted 查询。构建失败不进入就绪查询，就绪失败不安装、不启动、不产生成功报告。查询和启动没有新增重试，原 60 秒 launch、像素断言和提交基线保持原有标准。

默认本地入口仍先发现已 Booted 的借用设备，不消费 CI 准备文件。就绪等待与现有安装后容器恢复都不通过 `-b` 自动启动本地设备；该能力仅保留给 CI 自建目标。iOS 执行逻辑按职责提取，Android 的运行和报告语义保持原样。

## 验证

阶段顺序回归先在保留旧“就绪查询早于构建”顺序的提取实现上失败 2 项，纠正后通过。回归覆盖构建未完成时零就绪查询、构建失败、查询超时不重试、状态/runtime 漂移、真实库存精确命中、重复/模糊/缺失目标、准备文件绑定与不可覆盖、本地无启动能力，以及原生 runner 的实际失败阻断接线。

本地 Node 22.23.3 与 24.18.0 的 10 个定向文件各 95 项通过，定向 TypeScript `--strict`、ESLint、agents 与差异检查通过。Vitest 命令为：

```sh
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-ios-build-target.test.ts e2e/lynx-native-device.test.ts e2e/lynx-native-environment.test.ts e2e/lynx-ci.test.ts e2e/lynx-native-artifacts.test.ts e2e/lynx-ios-container.test.ts e2e/lynx-native-options.test.ts e2e/lynx-native-command.test.ts e2e/lynx-command-observer.test.ts e2e/lynx-command-host.test.ts --update=none --coverage.enabled=false
```

额外按 e2e 配置的 `exactOptionalPropertyTypes`、`noPropertyAccessFromIndexSignature` 等选项检查导入图，发现既有 `native-artifacts.ts`、`native-command-observer.ts` 和 compatibility `geometry.ts` 类型错误；这些报错行与排查基线一致，本次没有将该扩展检查记为通过。未运行本地全面设备验收，未修改 demo、样式用例或 static 基线。

作者 head `15e3932c95cea6487408278ea4bb2fe4fb0bf246` 的 [Lynx Native Compatibility 38348833717](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38348833717) attempt 1 已全部成功，Android 与 iOS 均实际执行。iOS job `115136512042` 的准备文件绑定本轮真实 PR merge checkout `705d2f0cb159976ee6a0ae01bbaa12df8ba00c96`，锁定自建 `C7303DB1-EA5E-4495-817D-FC48BEB9AE92` 的 Shutdown 构建目标。构建后 bootstatus 实际用时约 1.74 秒，原 30 秒精确 Booted 查询约 563 毫秒成功，随后安装、启动、原像素/几何断言、支持矩阵基线比较和报告上传成功。原始日志、准备文件、命令事件与报告已保存；该轮成功不替代更新后源码 head 或版本 PR 的全面验收。

## 后续启动失败与跨入口生命周期修正

准确作者 head `00cc20a5ee424022a094e5f1fee1802e410f1cb5` 的 [Lynx Native Compatibility 38354875761](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38354875761) attempt 1，iOS job `115155662740` 在 `simctl launch --terminate-running-process` 原 60 秒上限失败。真实 checkout 为 PR merge `2a66912922e12c9289768109db9cc65f33b2dadb`，父提交为 main 与该作者 head，准备文件绑定正确。此前 xcodebuild、bootstatus、精确 Booted 查询、安装和容器查询均通过；尚未进入报告、截图或产品断言。launch stdout/stderr 均为空，随后真实 SIGTERM/close。采样栈停在 `launchApplicationWithID → _sendBridgeRequest → host_support_mig_launch_app → mach_msg2_trap`；3 核主机 load average 约 328，可用内存约 211 MB，720 个进程，表明严重资源压力，不能单独认定 OOM 或唯一系统内部原因。

继续审查发现 workflow 虽已在 boot 前准备 Shutdown 目标，却仍立即执行 boot 与 bootstatus，让模拟器与约 22 分钟的 bundle、Pod、Xcode 构建重叠。helper 内已有构建后唯一受控 `bootstatus -b`，CI 的早期启动完全冗余。现在 workflow 只 create、准备并导出目标；首次启动留给构建完成后的 helper。本地借用设备、同一 UDID/runtime/destination 核对及所有原时限保持原有边界，不增加 sleep、重试或异步绕过 launch 确认。

跨 workflow 合同回归要求 native runner 前没有 boot/bootstatus，在保留旧 workflow 时真实失败 1 项，移除两条命令后通过。helper 回归明确验证挂起 build 时没有设备命令，完成后才按原 120 秒调用同目标 `bootstatus -b`；启动失败不查询、不安装启动、不重试。Node 22.22.3 的 4 文件、58 项定向测试通过；完整 10 文件定向回归在 Node 22.22.3 与 24.18.0 各 96 项通过。此修正消除明确的资源生命周期重叠，尚不宣称新 head 的 launch 已通过。

## 后续 hosted 就绪枚举失败与收敛

准确作者 head `dbdf97b8acebe6c9964901e29e18cfa0810eaca4` 的 [Lynx Native Compatibility 38364946617](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38364946617) attempt 1 已完成 native build 与 `bootstatus -b`，随后同一 UDID 的 `simctl list devices <ID> --json` 在 30 秒窗口内超时。job `115188014357` 未进入安装、启动、报告或产品断言；主机 load average 约 `276 → 293`、可用内存约 134–156 MB，继续证明 hosted 调度拥塞，但不足以断言 OOM、CoreSimulator 死锁或唯一内部原因。

启动前 manifest 已绑定本轮 run、attempt、checkout SHA、UDID、runtime 和 destination，且不能覆盖；`bootstatus -b` 已针对该精确 UDID 等待成功。CI 自建目标因此直接由受控 bootstatus 产出 Booted 设备身份，不再重复调用会触发全局 CoreSimulator 服务连接的 `list` 查询；本地借用目标仍执行原有 Booted 查询和身份校验。该边界保持原 120 秒启动预算、安装/启动/报告/像素门槛与失败阻断，不添加 sleep、重试或放宽断言。

## 适用边界

这项修正消除无用的早期运行就绪依赖，也移除了 hosted runner 上启动完成后重复的全局设备枚举；它仍要求原 120 秒 bootstatus 成功，并保留安装、启动、报告和产品断言。是否能在新的准确 head 上完成真实 iOS 验收，必须由新的 Lynx CI 证明。若仍失败，保留新的最早分歧和诊断继续定位，不增加超时、不加固定 sleep、不跳过设备或产品断言。

## 规则评估

不新增 AGENTS，不改变公开包行为，无需新 change intent；以执行阶段、证据绑定和回归维护现有设备所有权边界。
