---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1172
baseline: d6269d23ffac4c95e7aaf7c63c4b310f9db9164a
regressions:
  - scripts/ci/demo-matrix/watch.test.mjs
---

# 虚拟模块回归夹具的包边界

## 症状

Windows Node 24 的 Demo Watch Diagnostic 在运行 Gulp 前的矩阵单测失败：默认虚拟模块 watcher 在初始观察期编译 3 次，超过原有上限 2。失败任务为 102314611693，工作流运行 34303286786。

PR #1316 的 [Windows Node 24 检查](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39947616501/job/120394019819)再次出现三次空闲编译；本轮失效记录仅指向夹具项目父目录。此时输入与输出已分目录，且 `missingDependencies` 为空。

## 根因与纠正

读取真实 compilation 图发现夹具没有 package.json，解析器把共享临时目录直到磁盘根的 package.json 列为 missingDependencies；绝对入口还触发拼接 context 的失败解析路径。原测试因而同时观察了无关缺失路径，不能把次数直接归因于虚拟模块轮询。

夹具现在先建立自己的 package.json，使用 bundler 相对入口，并逐次断言 missingDependencies 为空。初始最多两次编译、真实写入触发重编译、更新后保持空闲的原断言全部保留；额外记录 invalidations，后续异常仍失败。

本轮继续读取真实 compilation 图，发现 `fileDependencies` 包含 `source`、项目父目录及祖先目录，`contextDependencies` 和 `missingDependencies` 均为空。watch 启动前父目录只有 `source`，首轮完成后新增 `dist`；仅把输出移到相邻目录仍会改变图中的父目录。新增父目录内容不变断言后，旧夹具在本地确定失败，并显示新增 `dist`。

现在在 watch 启动前创建完整的输入、输出目录，首次及更新后同时检查输入目录和项目父目录内容不变。每轮记录文件、目录、缺失及构建依赖，失败时连同 invalidations 输出；不删除图依赖、不忽略父目录事件，也不调整空闲次数或观察时间。夹具只加载 Webpack 与 webpack-virtual-modules，不加载 weapp-tailwindcss。

## 验证

旧夹具追加新图边界断言，本地确定失败：Virtual fixture has unexpected missing dependencies。修复后的图 missingDependencies 为空。`pnpm test:demo:matrix` 的 51 项全部通过。

负对照 `WATCHPACK_POLLING=100 node scripts/ci/demo-matrix/fixtures/virtual-watch.cjs` 仍因初始编译 6 次失败，说明没有放松对轮询循环的检测。该记录属于前一次修复，不单独用于证明本轮 Windows 行为。

上述 51 项记录属于前一次包边界修复。本轮在 macOS、Node 24.18.0 执行 `CI=1 pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/watch.test.mjs --update=none`，8 项通过。默认 watcher 保留首次不超过两次编译、虚拟模块真实更新及更新后稳定断言；新增强制 polling 负对照，只接受首次空闲重复编译或更新后未稳定这两种原断言失败。

提交 `6c5031219a184e9c896645436be522392a15bf1f` 的 [Demo Watch Diagnostic](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39950474641) 中，9 个真实 repeated-watch 任务全部通过，包含此前失败的 Windows Node 24 Taro Vite Vue JD，以及 Windows Mpx、Gulp 和其他平台组合。条件未执行的 output-copy 任务不计成功。该结果验证了修复在当前矩阵中的行为；对三次失效的归因仍以已捕获的父目录变更与图依赖为范围，不推断其他 watcher 故障。

## 适用边界

本次修正限于回归夹具隔离，不修改 Gulp 或 webpack-virtual-modules 产品实现；Gulp 实际 watch 仍由独立矩阵验收。对其它异步 watcher 问题不得增加固定次数阈值掩盖失败。

本轮没有修改 demo 源码或 CSS/JS 产物基线，临时 fixture 项目由测试自行创建和清理，无需更新 e2e static 快照。

## 规则评估

不新增规则，沿用构建图取证和回归先行要求。
