---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: ce481947197f0bb85646d90f89cb5f48717030d8
regressions:
  - examples/react-lynx/src/compatibility/native-reporter.test.ts
  - examples/react-lynx/src/compatibility/native-error-diagnostics.test.ts
  - e2e/lynx-native-failure.test.ts
  - e2e/lynx-failure-evidence.test.ts
verification:
  - claim: 本轮既有118个原生案例完成，深色模式六帧及三个切换回执通过独立生产校验器复核
    kind: native
    status: passed
    sha: 13bbea6d9f99c3c152947c94a09c316ceecc9a8f
    environment: macOS，Node24.18.0，pnpm12.14.0，iPhone17Pro/iOS26.5/arm64模拟器，Lynx4.0.1
    command: CI=1 pnpm e2e:tailwind --preflight-report e2e/.artifacts/preflight/07b07c75-2948-4373-bd78-1a44b36304fd/report.json --target lynx-ios
  - claim: 全面能力门禁拒绝将既有原生案例完成等同于全部能力通过
    kind: integration
    status: failed
    sha: 13bbea6d9f99c3c152947c94a09c316ceecc9a8f
    environment: 同轮iOS26.5原生运行，能力报告v2
    command: CI=1 pnpm e2e:tailwind --preflight-report e2e/.artifacts/preflight/07b07c75-2948-4373-bd78-1a44b36304fd/report.json --target lynx-ios
    reason: 17项通过、101项阻塞、1496项未执行，共1597项未通过；缺注册能力夹具和完整语义oracle
---

# Lynx 颜色模式失败的跨桥诊断

## 症状

PR #1314 的 `0c873b02d7b1de1bdc89975bc0f937a854dedb9f` 在 hosted Lynx iOS 运行失败：run `39636208076`、job `119347901214`。实际 checkout `af556147266cee7b85237643124c8cbdf4c42673` 与该 head 的 tree 相同。准备阶段通过，失败发生在 native-run；外层只有“原生颜色模式采集或恢复失败”。

工件 `12364537554` 的完整 ZIP SHA256 为 `e5b6335d55b32a2a8b24447475214d6e4a7bcb1c23b4336aef2bc0b67d284362`。原生 run 为 `5d2ef28e-0ce9-4b70-bf98-9596b3f9421a`，bundle SHA256 为 `464540e544072f1d9ab57d5d40076fc61930e556c7baf176e1f6b243e27bcdfe`，collection 与 run-context 一致。

bundle 的 `background.js:4461` 对应聚合抛错点，不能区分 switch、capture、save 或恢复。原 reporter 只发送外层 name/message/stack，`errors` 和 `cause` 在跨桥前丢失。35 个诊断条目全部导出，但当时固定白名单没有 dark 六帧；不能从缺帧推断 light 阶段失败，也不能归因宿主或 dark 样式。未重跑取绿。

## 根因与纠正

- `fail(runId, message: string)` 宿主接口保持兼容。普通错误发送独立的版本化诊断树；明确环境错误继续发送原根协议，并附带 diagnostics。
- 分类只来自实际 `NativeEvidenceUnavailableError` 与原四个允许码。诊断树的名称、文本、上下文和嵌套 JSON 均不参与分类；产品兄弟错误仍进入最终工件。
- 树按广度保留 AggregateError/errors/cause，限制为32节点、深度8、name128字符、message1024字符、stack4096字符、上下文各256字符。循环、节点/深度/文本超限和不可读取属性明确标记；不在 JSON 序列化后截断。
- 颜色模式 switch、capture、save 包装原错误，记录 phase、runId、requestId、node 和 artifact；恢复错误保留独立 cause。采集锁、恢复流程和所有超时不变。
- runner 校验树后还原普通错误；仅通过模块私有 WeakMap 传递已校验的上下文和截断标记。最终工件不展开任意 Error 属性。跨桥上下文出现非白名单字段时拒绝结构化诊断。
- 失败采集白名单增加 light/dark/restored 的 probe/control 六帧，共40个附件、41个 collection 条目。目录仍是 diagnostic-only，缺失如实登记，不替代成功报告、像素、hash 或回执。

## 验证

以下结果来自 `ce481947197f0bb85646d90f89cb5f48717030d8` 加本轮未提交的诊断修改，不表示 ce 已包含这些修改。

1. reporter→宿主字符串→runner 的失败回归先红：聚合 cause 丢失，16通过/1失败。夹具先隔离颜色模式缺帧，避免更早的可见性截图失败遮住目标。
2. 深度入口和上下文白名单反例再次先红：13通过/2失败；修正深度初值及上下文验证。
3. `CI=1 pnpm --filter @weapp-tailwindcss/example-react-lynx test --update=none`：22文件223项通过。
4. `CI=1 pnpm --filter @weapp-tailwindcss/example-react-lynx exec tsc --noEmit`：通过。
5. `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-native-failure.test.ts e2e/lynx-native-artifacts.test.ts e2e/lynx-failure-evidence.test.ts e2e/lynx-color-scheme.test.ts e2e/lynx-static-evidence.test.ts e2e/lynx-baseline-update.test.ts e2e/lynx-reports.test.ts e2e/lynx-evidence.test.ts e2e/lynx-source-imports.test.ts --update=none`：9文件202项通过。
6. `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-rspeedy.test.ts --update=none`：1文件28项通过，包含实际构建与样式夹具验证。

static 使用 `pnpm e2e:lynx:static:update` 定向重建 examples/react-lynx。生成/编码结论无变化，仅验证时间变化；审查后以 `CI=1` 和 `--update=none` 验证。错误树序列化自身未改变样式支持预期。

### 13bbea6 本地原生结果

fresh extended 预检 `07b07c75-2948-4373-bd78-1a44b36304fd` 的全部脚本、当前会话原生 Chrome 真实读图/输入/点击及 verify 通过。统一入口消费该报告，原生 run 为 `88379e69-458f-4959-920c-d3fc1e7f7761`；源码为上表完整 SHA，bundle SHA256 为 `b73b34e947d6e984b4ad36c3ab419fd7790fd3095f5ded93ee493977bfff4420`。

本轮设备是 iPhone17Pro（deviceModel `iPhone18,1`）、iOS26.5/build23F77、arm64，视口402×874、DPR3。独立构建、安装和采集完成118例（53 supported、65预声明 unsupported），无 pending candidate。`variant-dark` 保留 light/dark/restored 的 probe/control 六帧、请求1/2/3和各自runId；像素重算得到 glyphPixels3740、corePixels3023、whiteMatch1、invalidGlyphColors0、backgroundMismatch0。

运行完成后再次调用生产 `readNativeReport(reportPath, 'ios')`，独立校验181份附件的摘要、PNG、几何、候选和像素语义，全部通过。原件位于 `e2e/.artifacts/tailwind/88379e69-458f-4959-920c-d3fc1e7f7761/lynx-ios/native/`，包括report、raw-report、run-context、真实bundle/CSS/tasm、构建与设备命令和截图。预检报告已finished，挑战端口50036已确认为ECONNREFUSED，临时Chrome挑战标签已关闭。

统一能力报告仍为17 passed、101 blocked、1496 not-run，scopeGaps1291。入口exit1，index登记attempted且blocked；这次没有原生采集故障，失败层级是缺完整encoding/runtime/visual语义判定和注册能力夹具。该结果不能改写为全面验收成功，也不能因exit1重跑原生。

## 适用边界

这次修复的是诊断传输，尚未定位首轮真实颜色模式故障。iOS26.5本地成功不能覆盖hosted iPhone16Pro/iOS18.5的旧失败，不能证明该根因消除。源码变化后的下一次原生运行必须重新完成 extended prepare、当前会话 computer use 与 verify；不能复用本轮lease。全面验收继续为 partial；RN served bundle、注册能力运行时、Image/ScrollView、转换 oracle 与 Web visited 等既有缺口单独保留。

## 规则评估

不新增 AGENTS；用跨桥和最终工件回归落实现有失败取证边界。示例与测试编排修改不改变公开包，无需新增发布 intent。静态基线已经定向生成、审查并以禁止更新模式复验。

Refs #1307, #1308, #1309
