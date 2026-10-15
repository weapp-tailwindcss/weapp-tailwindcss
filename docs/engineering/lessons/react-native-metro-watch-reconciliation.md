---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: b46a8ead75026bdb53d7e311461ba45be91b3ab6
regressions:
  - packages/react-native/test/metro-watch.test.ts
  - packages/react-native/test/metro-watch-reconciliation.test.ts
  - packages/react-native/test/metro-watch-refresh.test.ts
  - packages/react-native/test/metro-refresh.test.ts
---

# Metro 文件监听必须核对原生通知遗漏

## 症状

完整验证在上述基线的第二阶段失败。`metro-watch.test.ts` 创建监听后立即原子替换 `style.css`，30 秒内没有收到生产回调，诊断中的原生 `change` 事件也为零；仅记录 `pending: 'first'` 与首次保存。该轮构建已通过，单测为 9669 项通过、1 项失败、1 项预期失败、44 项跳过，后续阶段未执行。原始证据在 `e2e/.artifacts/full-validation-recovery/canonical-5d015434-2a2f-4855-af05-dc2f84ce3935/`。

独立工作树再次运行原有两项监听测试通过，不能推翻完整轮的失败。[此前的测试同步修订](react-native-metro-watch-test-synchronization.md)已移除额外的一秒轮询等待，但没有解决这次整个测试预算内均无原生通知的情况。

## 根因与纠正

已确认的设计缺口是：显式文件保存能否启动刷新完全依赖 `fs.watch` 通知。监听父目录已避免原子替换后继续监听旧 inode，但不能保证每次通知交付。`compileStableInput` 只保证已启动编译的一致性；没有刷新请求时，它不会主动发现文件变化。尚未证实此次通知缺失的具体操作系统内部机制，不能把 macOS 启动窗口写成唯一根因。

[监听实现](../../../packages/react-native/src/metro/watch.ts)保留父目录的非持久原生监听，并在同步返回前记录文件的 `dev/ino/size/mtimeNs/ctimeNs`。每 100 ms 核对当前版本，用于补齐首次保存和后续遗漏通知；计时器 `unref()`，不阻止进程正常退出。不能依赖异步监听的首次 stat 作为唯一基线，因为它可能已经看到第一次保存后的版本。atime 不参与版本，避免读取本身触发刷新。

目标文件的原生事件仍立即通知，并更新版本基线，随后定期核对不再重复通知同一版本。相邻文件事件不触碰基线，以免吞掉目标文件尚未被通知的变化。缺失是一个版本，因此删除、重建以及两次核对之间的原子替换均能恢复；非缺失的 stat 错误关闭监听并通过原生 `error` 事件报告，保留未处理错误语义。

返回值保持原生 `FSWatcher` 身份、事件与 `ref/unref` 方法。显式 `close()` 同步停用回调和计时器，随后调用原生关闭；原生自主 `close` 也清理计时器，重复关闭安全。目录继续使用原生递归监听，不用根目录 stat 冒充后代文件内容变化检测。

刷新一致性单测改为在 `watchInput` 边界安排通知，以隔离人为控制的编译 generation 与新增的真实核对计时器。新增整合测试保留生产 `watchInput → entry.refresh → manifest` 链路，只屏蔽原生事件并替换 Tailwind 生成器；连续原子保存后均验证运行时颜色、manifest 文件和发布版本。

## 验证

环境为 macOS arm64、Node 24.18.0、pnpm 12.9.1；源码为基线加本次改动。所有普通 Vitest 命令使用 `CI=1` 和 `--update=none`，不更新快照，不增加保存前等待，不放宽原有 30 秒测试上限。

先新增“原生通知缺失时仍发现返回后立即发生的连续原子保存”回归，在产品修改前得到 `expected last vi.fn() call to return 'first', received undefined`。它屏蔽全部原生通知，证明原实现无法发现保存；修复后由同一回归通过。原始红灯输出保留为 `red.log`，不以随后单跑通过覆盖。

```bash
CI=1 pnpm --filter @weapp-tailwindcss/react-native exec vitest run test/metro-watch.test.ts --update=none
CI=1 pnpm --filter @weapp-tailwindcss/react-native exec vitest run test/metro-watch.test.ts test/metro-watch-reconciliation.test.ts test/metro-refresh.test.ts test/metro-store.test.ts --update=none
CI=1 pnpm --filter @weapp-tailwindcss/react-native test --update=none
pnpm --filter @weapp-tailwindcss/react-native build
pnpm exec turbo run build --filter=@weapp-tailwindcss/react-native...
pnpm --filter @weapp-tailwindcss/react-native typecheck
pnpm exec eslint --no-ignore packages/react-native/src/metro/watch.ts packages/react-native/test/metro-watch.test.ts packages/react-native/test/metro-watch-reconciliation.test.ts packages/react-native/test/metro-watch-refresh.test.ts packages/react-native/test/metro-refresh.test.ts
pnpm release status
pnpm agents:check
git diff --check
```

首次独立基线为 1 文件 2 项通过，首次定向绿灯为 4 文件 26 项通过，首次包回归为 10 文件 63 项通过。新增 ctime 回归后的最终包验证为 10 文件 64 项通过；最后完善测试清理后，仅复验对应监听文件，13 项全部通过。这些是不同阶段的重叠验证，不累加。新回归覆盖立即连续保存、同大小同 mtime 替换、无可区分 inode 时的 ctime、缺失和重建、相邻事件过滤、原生事件与核对去重、atime、同步关闭、迟到回调、原生自主关闭、stat 错误和目录边界。

首次包构建通过，类型检查因新工作树缺少 `@weapp-tailwindcss/postcss/native` 和 `weapp-tailwindcss/generator` 声明产物失败；先构建依赖闭包，再按原类型入口复验，不修改类型门槛。初次显式 lint 的行内多语句与 timer 参数规则错误直接修正，不使用忽略或放宽规则。原始失败与后续成功输出分别保留。

最终依赖闭包构建 15 项成功、零缓存；包类型检查通过。四个新增或修改测试及其源码导入另用临时配置继承包 tsconfig，执行 `pnpm exec tsc -p .codex-tmp/metro-watch-lifecycle-test-types.json --pretty false` 通过。首次把配置放在系统临时目录时无法从配置目录解析 node/vitest 类型，改为工作树内的忽略目录后复验，不修改项目编译配置。显式包含测试的 ESLint 零错误，保留原有失败诊断 `console.error` 的一条 warning。`pnpm agents:check` 和 `git diff --check` 通过；规则检查最初指出旧记录缺少 `supersededBy`，补齐替代链接后通过。

`pnpm release status` 确认 RN 的 patch intent，并将 Expo 示例作为依赖消费者传播 patch，没有执行版本写入或发布。独立设计审查及主流程最终只读审查没有发现阻止提交的问题。所有监听测试释放所属 watcher 后删除临时目录；13 项可控时钟回归还在清理后核对零计时器。包进程均正常退出，没有创建浏览器、IDE、模拟器或常驻服务。

## 适用边界

本次只进行包和依赖闭包的定向验证，没有在子任务中启动全仓流程、浏览器、IDE 或设备。Windows/Linux 主机事件与真实 Metro 设备 HMR 未实机验证；版本核对使用 Node 文件 API，保留既有路径解析和公开接口，不新增平台路径约定。目录 `sourceGlobs` 仍依赖原生递归通知；此修复只为显式文件目标提供版本核对，不扫描目录或修改刷新稳定性算法。仅元数据无法识别人为保持全部版本字段完全相同的内容替换。

中文 patch intent 仅涉及 `@weapp-tailwindcss/react-native`；不修改版本、不发布。没有 demo 或样式生成预期变化，不更新 static 基线。主任务集成后仍须重新预检和完整验证，因此本记录保持 `partial`。

## 规则评估

不新增或放宽 AGENTS。已有根因回归、跨平台文件 API、错误证据保留和资源所有权要求足以约束本次修复，以持久测试落实通知、刷新和释放边界。
