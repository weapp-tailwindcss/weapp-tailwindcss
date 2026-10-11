---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 5dfe898895655e95a7031e02dc45156ea30174eb
regressions:
  - benchmark/version-compare/test/process-memory.test.mjs
  - benchmark/version-compare/test/pr-report.test.mjs
---

# MPX 内存回归的平台证据边界

## 症状

[CI run 37333248802](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/37333248802) 的 MPX 峰值 RSS 首次增加 10.99%，反序确认增加 11.26%，两轮都超过原门槛。实际 checkout 是合并提交 `5dfe898895655e95a7031e02dc45156ea30174eb`，对比 `7abfff12a4960d7bb799b81b2d6a37fbdb47c591`，环境为 Ubuntu 24.04 / Node 22.23.3。

## 根因与纠正

产品根因尚未确定。两轮都是五个进程，峰值增量约 240 / 244 MB，几乎全部来自最深层 Node 编译 worker；没有增加进程的证据。但仅凭 RSS 轨迹不能判定泄漏、GC 或某个缓存负责。

原 Linux 样本没有 `memoryDebug`。本地使用原 CI checkout、原 build/HMR 各三次及相同比较基线，并启用已有 `WEAPP_TW_HMR_MEMORY_DEBUG=1`。macOS / Node 22.22.3 的峰值增加 0.90%、稳态增加 0.73%，通过原门槛。两个平台和 Node 补丁版本不同，本地成功不能撤销 Linux 的重复失败。

本地十二条构建/HMR 诊断显示两侧缓存计数相同：process cache 23、hash 31、stale 0，source scan 8 entries / 13 files / 1 snapshot。三轮 heapUsed 基线约 606→1308→2030 MB，当前约 558→1278→1990 MB；双方变化相近，但计数稳定也不能排除单个对象增长。

CI 的 MPX 分片现在对基线和当前代码同时启用已有堆/缓存诊断。只增加诊断证据，不调整采样、顺序确认或性能阈值；其他分片保持关闭。下一份 Linux 样本需用这些字段定位首次偏离，再决定是否存在可复现的源码缺陷。

## 验证

- 在独立且干净的 `5dfe898` worktree 执行 `WEAPP_TW_HMR_MEMORY_DEBUG=1 node benchmark/version-compare/scripts/run-ci.mjs --guard --baseline-ref 7abfff12a4960d7bb799b81b2d6a37fbdb47c591 --build-runs 3 --hmr-runs 3 --timeout 180000 --poll-interval 30 --only demo-mpx-tailwindcss-v4__mp-weixin`，使用独占临时工作目录及结果目录，退出 0。
- 原 CI 首次、反向确认及本地 JSON 原始样本全部保留；本地没有因通过而重复采样。
- 解析 Benchmark YAML，确认 build/HMR 原采样表达式与 guard 命令不变。
- 完成后清理本任务临时比较副本并归档诊断 worktree，原始结果保存在任务附件目录。

## 适用边界

这次只修正诊断缺证，没有宣称修复内存回归。本地 Docker daemon 当前不可连接，不能把未执行的 Linux 对照写成完成。全仓 Goal 的性能起点仍固定为 `4488cabc93782100b856dfd434a1fb21c3daa407`；上述 CI 比较基线不取代它。

## 规则评估

不新增 AGENTS 规则。沿用保留首次样本、有限确认、定位首次偏离后修复和不放宽阈值的约束。
