---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 55a49d33de5143dfe112fa4683fe92a175dbc655
regressions:
  - packages/react-native/test/metro-refresh.test.ts
  - packages/react-native/test/metro-store.test.ts
  - packages/react-native/test/metro-watch.test.ts
  - e2e/react-native-metro-worker.test.ts
  - e2e/react-native-metro-evidence.test.ts
---

# React Native Metro 编译与发布的一致性

## 症状

提交 a183ff5b6 的 RN iOS 作业 111951697997 在 TSX HMR 后通过截图检查，随后等待橙色 CSS 探针超时。失败截图显示文字 marker 已更新但整页样式消失，日志报告 `Missing native visual probe: theme-card`。该日志也可能表示颜色缺失，不能仅据此认定节点不存在。

## 根因与纠正

已用受控 watcher 和编译屏障证明两个实现缺陷：一次通知后，CSS 在编译期间由空恢复为完整内容，旧实现仍发布空规则；热更新期间读取者只等待初始化的 `entry.ready`，能够提前取得旧 manifest。初次编译失败的 catch 还没有 generation 保护，可能在新一轮尚未完成时错误地写 ready。

编译入口现在对显式 input/watchFiles 的内容和文件身份做前后核对，并用短暂稳定窗口吸收保存通知。连续变化最多检查五次；过期轮次退出，当前轮次失败明确传递。所有异步读取等待当前刷新，合法空 CSS 不被过滤。虚拟 JS、JSON 和 ready 同目录原子替换，worker 必须读到前后一致的 ready；编译失败或超时不能使用旧文件降级成功。

独立 worker 在配置字段被 Metro 丢弃时，原实现仍使用最早收到的虚拟 JS。真实子进程回归在旧实现得到 `stale-empty-virtual-module`，修复后通过。ready 现在绑定唯一 revision 和 virtualPath；worker 从同一份已核对 manifest 重新生成 JS，不再另读文件或消费过期数据。普通文件监听父目录并过滤目标，连续原子保存不会丢失旧 inode 上的监听。

E2E 在还原源码前保留 CSS、marker、manifest、ready 和哈希，记录发布状态是否一致及文件缺失，供后续定位首次偏离。

## 验证

- 确定性复现：旧实现的两项回归失败，分别得到空样式和提前完成的读取者；修复后通过。
- `CI=1 pnpm --filter @weapp-tailwindcss/react-native test --update=none`：50 项通过，包括旧轮逆序完成、首次迟到失败、当前错误传播与恢复、合法清空、有界变化、跨轮 worker 读取和临时文件释放。
- 包构建、Metro 刷新/存储/证据模块定向 TypeScript、ESLint、`pnpm agents:check` 与 `pnpm release status` 通过。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/react-native-metro-evidence.test.ts e2e/react-native-compatibility.test.ts e2e/react-native-runtime-artifacts.test.ts --update=none`：9 项通过，实际完成三平台 Metro export 和后台 Web 运行检查，没有运行本地原生模拟器。独立 worker 的两种配置保留模式另有 2 项真实 Node 子进程回归通过。
- 扩大 TypeScript 检查到整个 transformer 依赖图时，另发现已有 Babel 7/8 类型混用及 runtime 样式类型错误；单独跟进，不把窄范围检查写成全包类型通过。
- RN 原生 CI 的新轮次仍需实际验证。历史失败没有保存当时 manifest，因此现阶段不能断言上述竞态就是该次 CI 的唯一原因。

## 适用边界

一致性核对覆盖显式输入文件；sourceGlobs 仍依赖现有 watcher 的 generation 通知，不声称任意文件系统写入具备事务性。稳定窗口不能预测任意长时间暂停后才继续的保存；持续写入会明确失败，下一次保存可恢复。原生像素与 HMR 验收门槛未降低，也没有用忽略空规则保留旧样式。

## 规则评估

不新增 AGENTS 规则。现有根因复现、失败证据和发布生命周期要求已经覆盖此类问题，补持久回归及更完整的 E2E 证据即可。
