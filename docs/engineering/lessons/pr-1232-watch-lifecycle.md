---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1232
baseline: 6e685f9d4e04ed6227fe2a14cb6cae35d0ef99f1
regressions:
  - scripts/ci/demo-matrix/mpx-fatal-watch.test.mjs
  - scripts/ci/demo-matrix/mpx-process.test.mjs
  - scripts/ci/demo-matrix/watch-lifecycle-diagnostic.test.mjs
  - scripts/ci/demo-matrix/snapshot.test.mjs
  - scripts/ci/demo-matrix/watch.test.mjs
---

# PR #1232 的 Mpx watch 生命周期

## 症状

[原始 PR Gate](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/35675870655) 的 Windows Node 24 Mpx 分片在支付宝 restore 期间提前退出。此前 production、initial、replace、add 都通过；进程触发 beforeExit(0)，只剩管道，没有文件监听句柄。

style-injector-uni-app 的测试成功，但上传证据的 FinalizeArtifact 返回 intermediary 403。两个汇总门禁是连带失败；上传错误与 Mpx 编译应分别处理。

## 根因与纠正

实际依赖为 Webpack 5.105.4、Watchpack 2.5.2、Mpx CLI 2.2.30。Mpx 的 serveMp 返回首轮就绪 Promise，后续 handleWebpackDone 的致命错误仍使用同一个 reject；Promise 已兑现后 reject 不再生效。Webpack MultiCompiler 则会在致命错误后关闭所有子 watcher，最终形成静默的退出码 0。

回归使用实际安装的 CLI 源码与真实 MultiCompiler，只隔离目标配置和终端渲染。首轮成功后向第二次 beforeCompile 注入错误，原版确实没有 stderr、以 0 退出；补丁独立报告后续致命错误并设置退出码 1。首轮拒绝语义、普通 compilation.errors 后继续监听并恢复的行为保持可验证。

证据采集还有独立的输入干扰：验收循环使用 fs.cp 复制正在生成的产物，Mpx 又没有本轮编译完成门禁。Windows 的 CopyFileW 会排斥并发写入；[争锁实验](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/35686075203/job/106613029485) 中 740 次写入有 730 次 EBUSY，而 macOS 同样实验没有错误。Webpack 的 emitAssets 会把 outputFileSystem.writeFile 错误传给 MultiCompiler，闭合了“证据复制争锁 → 致命编译错误 → 所有 watcher 关闭 → CLI 吞错”的故障路径。

动态证据现在通过共享读取句柄流式归档，不再使用 CopyFileW 读取普通产物；Mpx 必须报告本轮成功或带警告完成后才能读取，旧轮次和编译错误不能放行。静态 production 在编译器进程完成后复制，继续使用 fs.cp。快照回归覆盖持有写入句柄的文件、绝对/相对路径、空目录、二进制、隐藏文件和目录链接。

原始日志中的底层异常已被旧 CLI 丢弃，无法事后恢复其确切错误码；上述竞争条件与吞错机制分别有真实系统和编译器复现，不能把重跑成功当作原始错误码的证明。诊断记录有界的 watcher 创建/关闭调用栈及最后编译阶段；不加保活定时器，不忽略进程退出。

旧 demo 包装器在回归模式下遇到子进程退出 0 会启动永久定时器，已通过真实子进程用例复现并移除。

新增恢复夹具在 Windows Node 24 上另行暴露了 libuv 的 `!_wcsnicmp(filename, dir, dirlen)` 原生断言（[Node 上游记录](https://github.com/nodejs/node/issues/63638)、[libuv 复现与根因](https://github.com/libuv/libuv/issues/5010)）。临时目录的 8.3 别名需要先通过原生 realpath 解析；第一次误用了 JS 实现的 realpathSync，它不会展开这种别名，Windows 复验仍然崩溃。纠正为 realpathSync.native，与已有异步 realpath 夹具采用同一原生解析边界；不降级 Node、不跳过 Windows 回归。这与原始退出码 0 的故障不同，原生断言会直接以非零退出。

## 验证

- `pnpm install --frozen-lockfile`、`pnpm build:ci` 通过。
- `pnpm exec cross-env CI=1 pnpm test:demo:matrix`：84 项通过。
- 两项缺陷回归均保留了修复前失败、修复后通过的证据；普通编译错误恢复用例通过。
- `pnpm exec cross-env CI=1 pnpm e2e:demo:matrix mpx-tailwindcss-v4:wx mpx-tailwindcss-v4:ali mpx-tailwindcss-v4:swan mpx-tailwindcss-v4:tt mpx-tailwindcss-v4:dd style-injector-mpx:wx --update --build-only` 重新生成六个目标的 static 基线，无差异。
- `pnpm exec cross-env CI=1 DEMO_MATRIX_PROCESS_DIAGNOSTICS=1 DEMO_MATRIX_WATCH_DIAGNOSTICS=1 DEMO_MATRIX_ARTIFACT_DIR=e2e/.artifacts/mpx-patch-acceptance pnpm e2e:demo:matrix mpx-tailwindcss-v4:wx mpx-tailwindcss-v4:ali mpx-tailwindcss-v4:swan mpx-tailwindcss-v4:tt mpx-tailwindcss-v4:dd style-injector-mpx:wx`：六个目标的 production、initial、replace、add、restore 全部通过。
- 加入共享读取和 Mpx 完成门禁后，用同一条六目标命令将 `DEMO_MATRIX_ARTIFACT_DIR` 改为 `e2e/.artifacts/mpx-snapshot-acceptance` 再次完整通过。
- [Windows 修复对照](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/35686537105/job/106614465661)：旧 copyFile 在 1600 次写入中出现 1536 次 EBUSY；新 snapshot 完成 2890 次并发写入，零错误，归档字节内容一致。
- 补丁登记之后的 `pnpm install --frozen-lockfile --offline` 通过。仅保留补丁哈希、两个 snapshot key 和三个 importer 引用的变更，剔除 pnpm patch-commit 带来的无关 peer 解析变化。
- [首轮 Windows 诊断](https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/35684374050) 共十二次完整 wx/ali 流程通过，未复现原始提前退出，不能据此宣称根因修复完成。

## 适用边界

CLI 补丁只用于仓库冻结依赖，不随 weapp-tailwindcss npm 包安装。上游 next 分支截至本次检查仍有同样的 Promise 处理逻辑；后续升级需用持久回归确认等价修复后再移除补丁。最新 Windows 修复对照和 PR 检查仍需继续跟进；本轮未执行 IDE 或设备验收。

## 规则评估

不新增 AGENTS 规则。以真实进程、编译生命周期和持久回归落实已有错误传播与证据要求。
