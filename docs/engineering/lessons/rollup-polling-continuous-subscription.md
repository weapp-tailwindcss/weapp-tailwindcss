---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 13bbea6d9f99c3c152947c94a09c316ceecc9a8f
regressions:
  - scripts/ci/demo-matrix/rollup-polling-lifecycle.test.mjs
  - scripts/ci/demo-matrix/rollup-polling-identity.test.mjs
  - scripts/ci/demo-matrix/rollup-polling-readiness.test.mjs
---

# Rollup polling 更新的连续订阅

## 症状

PR #1314 的13bbea6在两个独立任务中先于真实文件替换失败：

- [Demo Watch Diagnostic run39644920853/job119377832836](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39644920853/job/119377832836)：issue-uview-plus-cssentries/cjs/directory/atime=true。
- [Portable 枚举 run39644921002/job119379566461](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39644921002/job/119379566461)：同demo，file/atime=false。

均在五秒准备预算内缺恢复mtime的raw回执：946684799000→946684801000后，未见恢复946684800000。尚未执行最终rename，也尚未运行repeated-watch业务流程。两份完整日志SHA256分别为`eb4c21295ad4dd26fde57d1156cdb06a04bdaba498348e796de1d8110d235c0c`、`705b409294872d307ce5bb74693d4cd607f44fad3c1e9ef2dd5411d9bf0abf96`，保存在忽略的`.tmp/ci-1314/`。

## 根因与纠正

Rollup4.63.x的Linux/FreeBSD workaround会对每次change先unwatch再add。polling使用按路径stat的`fs.watchFile`，普通update无需为inode换代重新订阅。重绑会关闭已开始采样的StatWatcher，并异步创建下一代；新代首次stat只保存baseline，不发change。准备probe收到raw后若被重绑，紧随其后的恢复或替换可能落进新代初始baseline，登记句柄、Task idle或上一代raw都不能证明它已经采样。

这条生命周期缺陷已由确定性回归复现：保留真实原生raw，故意暂停首次订阅之后的下一代注册，旧实现仍因真实update进入屏障并关闭旧订阅。首红记录显示1失败、15未选择；未增加预算或伪造文件事件。CI原trace未记录订阅代次，因此这条时序是已复现的缺陷，不能追认成两个历史任务的完整宿主根因。

对仓库已登记的Rollup4.63.0、4.63.1、4.63.5补丁，仅让有效`watcher.options.usePolling`下的普通update保持连续订阅。采用Chokidar解析后的选项，覆盖`CHOKIDAR_USEPOLLING=1`对显式false的覆盖。fs.watch、delete和create沿用原重绑流程；首次订阅与删除恢复的其他窗口不冒充已修复。Taro的Rollup3.30.0已有独立订阅生命周期补丁，本次不改。

没有循环补发restore或放宽五秒门槛。准备仍要求真实probe/restore raw、正确bundle默认值0和fixed mtime、空闲状态；最终替换仍要求独立offset的完整curr/prev原生快照、change、模块失效和实际bundle值6。

## 验证

- 新生命周期用例覆盖CJS/ESM、Linux/FreeBSD分支、显式/环境启用polling。原生StatWatcher在当前macOS真实执行，不将平台分支选择写成Linux设备验收。验证多次元数据更新、恢复及一次等长同mtime内容替换，前后均不重新调用目标watchFile。测试取消时先关闭归属、释放屏障，等待主体和全部在途注册后恢复spy及清理目录。
- 实际构建identity回归补充两demo的CJS/ESM Linux分支，保留BigInt文件身份、原始raw与实际bundle，不用Task事件计数代替产物。框架实际解析为uni的4.63.0、uview的4.63.5；4.63.1补丁仍需消费它的环境另验。
- `pnpm install --frozen-lockfile --ignore-scripts`通过。锁文件仅变更上述三份补丁的SHA256引用，没有依赖升级；patch-commit生成的无关依赖重算已从本任务改动中移除。
- `CI=1 pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/rollup-polling-lifecycle.test.mjs scripts/ci/demo-matrix/rollup-polling-identity.test.mjs scripts/ci/demo-matrix/rollup-polling-readiness.test.mjs --update=none`：3文件52项通过（清理加固后）。
- `CI=1 pnpm test:demo:matrix`：清理加固前后分别执行，均54文件427项通过。之后仅合并重复的os导入、补异步predicate返回后的严格deadline核对，并再次定向复验，不放宽预算。

## 适用边界

这里不把一个已采样订阅推广为首次订阅即保存的生产保证，也不宣称异步stat排空、原生inode精度和删除恢复的所有窗口已根治。当前head的hosted CI要重新核对准确SHA；旧head成功、不同run成功或本机分支测试都不能替代它。不改demo源码、样式和static基线，依赖patch只影响工程watch链路，无公开包发布intent。

临时patch沿用现有Rollup来源与登记；上游参考为[Rollup watch实现](https://github.com/rollup/rollup/blob/master/src/watch/fileWatcher.ts)。移除条件是仓库实际解析的上游版本已区分有效polling update，并通过本篇的真实raw、生命周期和实际构建回归，不能仅按版本号删除补丁。

## 规则评估

不新增AGENTS。现有生命周期、先红后绿、失败证据和禁止放宽门槛的规则足够；用可执行回归纠正“上一代raw可以证明下一代ready”的错误假设。

Refs #1307, #1308, #1309
