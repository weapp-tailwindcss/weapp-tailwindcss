---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1254
baseline: e600067bfd41b9abb8c39c43d32de9cf2dd68717
regressions:
  - scripts/ci/demo-matrix/gulp-watch-ready.test.mjs
  - benchmark/performance/demo/test/framework-patches.test.mjs
  - benchmark/performance/demo/test/authored.test.mjs
  - benchmark/performance/demo/test/browser-state.test.mjs
---

# 接入成本测试的框架生命周期与隔离依赖

## 症状

- Windows Gulp 重复 watch 的第二次启动中，首次保存没有构建。Actions run `36599634044`、job `109513378065`：保存时间为 `16:47:59.715`，目录及文件监听分别在 `.720`、`.723` 才绑定。
- 发布版隔离消费项目的 uni 小程序完成一次更新后失去后续通知；原始证据见诊断 run `36597236915` 的 shard 12/13/14/26。
- uni-app x 与 weapp-vite 独立安装后找不到 `sass-embedded`；仓库根依赖曾掩盖缺失。
- style-injector 的 uni 配置中包含别名函数，旧捕获器拒绝序列化；uni SSR 的图片加载回调可能晚于页面结构采样。

## 根因与纠正

Gulp 的 clean 删除了随后被监听的临时图片目录。Chokidar 3 在不存在的 glob 根上重复报告完成，导致 ready 早于其余目录扫描完成。先创建所有监听根再注册 watcher，保留原生监听和真实产物断言，不增加固定等待。回归测试直接观测底层绑定；移除目录创建后同一测试失败。

独立消费者遗漏仓库已经登记的 Rollup/Mpx 框架补丁。三组现在复制实际锁文件命中的确切版本补丁，保留原文、哈希和锁身份，并验证共有依赖的补丁一致。明确禁止修改被测发布包。周报说明这是沿用仓库补丁的 demo 工具链，不能解释为无补丁环境的性能；历史锁身份不同的结果不混算。

样式注入器在准备构建的真实 Vite `configResolved` 中预处理全部操作状态。保留配置里的闭包及别名，仅保存输入哈希与 CSS 结果，后续静态准备按路径、内容哈希匹配，缺证直接失败。图片及字体请求也计入页面就绪条件，继续核验页面结构和计算样式。

## 验证

- `CI=1 pnpm test:perf:demo`：90 项通过。
- `CI=1 pnpm test:demo:matrix gulp-watch-ready.test.mjs`：8 次重新创建 watcher，首次原子保存均可见；移除修复后底层监听断言失败。
- `CI=1 node scripts/ci/demo-matrix/run.mjs gulp-tailwindcss-v4:tt --watch-only`：初始、替换、新增、恢复均通过。
- 两个 uni-app x H5、Gulp weapp/tt、weapp-vite weapp 分别以 `--build-only --update` 重建对应 static 基线，再执行不更新验证，产物未产生差异。
- 真实独立 Rollup 4.63.1 消费项目经过 lock-only 解析、补丁注入、裁剪与离线冻结安装；实际解析路径含补丁身份，连续 4 次共享 transform 依赖原子保存通过。在线安装受本机 registry TLS `NotValidForName` 阻塞，保留日志，未禁用 TLS。
- 定向 uni 样式注入准备构建捕获 11 份预处理结果，8 个操作状态均能匹配；该配置链路验证使用本地包，不计入发布版性能样本。

## 适用边界

本记录仍为 partial。Windows 云端复测、发布版三组完整采样及剩余语义差异尚未全部完成，不能将定向验证或缩减诊断当作正式周报。原始失败 artifact 保留。

## 规则评估

不新增 AGENTS 规则；用监听边界、补丁一致性和输入哈希回归固定现有约束。
