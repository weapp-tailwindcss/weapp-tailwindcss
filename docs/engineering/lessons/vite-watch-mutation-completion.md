---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: ba995704f5881bb1bb4894150348f4877a1a612a
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-plugin.template-delete-watch.test.ts
---

# Watch 验收必须绑定本轮源码变更

## 症状

完整扩展轮次 `52246bd6` 的根构建通过，全量单测有 7674 项通过、1 项失败：删除 AXML 模板后，最终 `dist/app.css` 仍包含旧候选。后续 3—46 阶段没有调度。单文件 4 项及一次有界诊断的 32 项均未自然复现，不能用这些成功覆盖首次失败。

## 根因与纠正

测试将注册监听后的第一个 `END` 当成本轮删除完成，却没有确认该构建是否已消费删除事件。已有构建尚在写盘时发生删除，旧构建先发 `END`，真正处理删除的下一轮尚未开始。旧 CSS 在此时仍存在，不能据此认定生成器没有删除样式。

确定性复现通过真实 Vite/Rollup 构建，在上一轮 `writeBundle` 已写盘后设置屏障，再删除模板并释放屏障。原等待逻辑的四种显式来源/模板扩展名组合全部失败，轨迹显示失败前没有模板 `delete` 事件。测试原先的 `generateBundle` 观察器还早于 `enforce: post` 的 CSS finalizer，快照不含转译后类名不代表最终产物正确。

现在先监听目标模板的 `delete`，再等待其后的 `END`；写盘屏障与构建结束等待都响应构建错误和测试取消，并移除监听。临时根创建后解析真实路径，保证与 Rollup 模块身份一致，避免 macOS `/var` 和 `/private/var` 别名。产物观察移至 `writeBundle`，同时保留磁盘断言。屏障在 finally 无条件释放，随后关闭本轮 watcher；afterEach 也等待同一份幂等收尾，确认结束后才删除临时目录。

## 验证

- 原确定性交错场景修复前 4 项失败；修复后的正常与在途构建场景共 8 项，另有 2 项错误/取消回归验证两类等待都释放监听。
- 命令：`CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/bundlers/vite-plugin.template-delete-watch.test.ts --update=none`。
- 首次完整失败、诊断代码和前后结果归档于本轮 `e2e/.artifacts/full-regression/52246bd6-d0aa-4772-a4a2-eaaf1155569f/`，464 个采样 PID 均已退出。

## 适用边界

适用于本例单配置 Rollup watcher：`change` 在前一轮 `END` 之后、消费该变化的新构建之前分发。没有变更产品 CSS 缓存、输出基线或超时门槛，不需要 change intent 或 static 基线更新。完整扩展流程仍需在最终提交上重新执行。

## 规则评估

不新增 AGENTS；通过真实构建交错回归固定变更与完成事件的归属，避免使用重复运行或固定等待掩盖失败。
