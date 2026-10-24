# Uni 输入与分配诊断

这两个手动模式用于定位性能失败，不能证明正式性能验收通过。`--input-diagnostics` 记录完整候选和来源，不启用 inspector；`--allocation-diagnostics` 额外启动包含 major/minor GC 已回收对象的统计分配采样。二者分开运行，均要求一个完整 Git 基线 SHA、已登记的 Uni 小程序项目、3 次冷构建和同一 watcher 的 3 次修改/回滚。禁止与 `--guard` 同时使用。

## 运行入口

在仓库根目录、依赖和对应 Node 已准备好时执行。将以下示例的 Git 基线改为本次对比的准确 commit；诊断期间保留首败工件，不以结果替代正式门禁。

```sh
pnpm bench:ci -- --input-diagnostics --baseline-ref fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417 --only demo-uni-app-vite-tailwindcss-v4__mp-weixin --build-runs 3 --hmr-runs 3 --result-dir .tmp/benchmark-input-diagnostic
```

分配模式使用同一参数，将 `--input-diagnostics` 换成 `--allocation-diagnostics`，并使用独立结果目录。工作流为这两个模式固定 Node 22.23.3；本地应核对实际 worker 的 `process-start.json`，不能以父 shell 的版本代替。该版本 V8 inspector 支持 `includeObjectsCollectedByMajorGC` 和 `includeObjectsCollectedByMinorGC`。实现不发送 GC 或 heap snapshot 请求；协议失败则停止诊断。

Linux 使用 Benchmark 工作流的手动入口，选择准确 PR 分支，填写同一完整 `baseline_ref`、上述 `only`、`build_runs=3`、`hmr_runs=3`，仅启用 `input_diagnostics` 或 `allocation_diagnostics` 之一。两个输入默认关闭。等价 CLI 模板如下；`PR_BRANCH` 需要替换为真实分支名：

```sh
gh workflow run benchmark.yml --ref PR_BRANCH -f baseline_ref=fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417 -f only=demo-uni-app-vite-tailwindcss-v4__mp-weixin -f build_runs=3 -f hmr_runs=3 -f input_diagnostics=true
```

显式 `gc_diagnostics=true` 仍保留已有自然 GC、预算和反序确认行为。所有显式诊断 dispatch 的 job（包括 skipped job）使用独立 Diagnostic check 名及并发组。普通 PR 的 check 名、预算和调度逻辑保持原行为；诊断成功不能替换正式 PR 的失败。

新输入/分配模式使用同一确定性 `twbenchdiagnosticround1..3` 修改标记，不读取时钟或进程身份。初始来源已包含本轮标记时立即失败。这样两侧实际写入保持等量；原正式及自然 GC 模式仍使用原 marker 规则。控制器会记录生成规则，实际文本哈希仍需逐项比较，不能只比较归一化后的 marker 哈希。

## 证据与解释

- `allocation-preparation/*/instrumentation.json`：副本原文和插桩后的 SHA，以及唯一 AST 锚点。源码工作树和含 `.git` 的目录不能插桩。
- `gc-diagnostics/*/*/allocation-controller.json`：准确执行命令、限定范围的构建环境、源码初始/修改/回滚实际 SHA、预期 SHA、marker 和阶段时间。marker 归一化 SHA 仅供辅助比较，实际 SHA 始终保留。
- `inputs-N.json`：各来源层的完整候选和源码 SHA、UTF-8 字节数、UTF-16 长度、完整编译候选集合。每次冷构建 1 份；watch 包含首次构建、3 次修改、3 次回滚和结束共 8 份。最后一份来自停止采样，未发生新编译，因此不虚构编译候选集合。
- `allocation-N.json`：从启动以来累计的完整原始统计分配 profile、采样参数和阶段。该数值不是存活堆或 RSS，不能直接和进程树 RSS 相减。源码映射缺失时保留生成模块身份并标记不可跨构建比较。
- `allocation-frames-N.json`：原始 profile 对应的全部栈帧与映射；只读取准备副本内仓库模块的源码和 sourcemap。第三方 `node_modules`、副本外模块及越界符号链接保留原始函数名、模块身份和行列，明确标记未映射、不能跨构建比较。原始 profile 与 `inputs-N.json` 在映射前写入；映射失败保留这些首败证据，但状态仍失败，不产生完整验收结果。控制器同时核对原始 profile 和映射文件的哈希。
- `diagnostic-input-comparison.json`：两侧对应阶段逐项比较候选和来源哈希，额外候选列出所属来源层及 SHA。仅来源 key 的已知项目根会归一化；源码中的根目录文字、marker 等内容差异保留。若实际输入不同，本轮分配差异不能解释原正式失败。
- `allocation-diagnostic.json`：明确标记 `diagnosticOnly=true`、`budgetAcceptance=false`。这两个模式在正式预算和反序确认前返回，不产生正式通过报告。

观测器只以 `WeakRef` 登记实际 store，不延长生产 store 的生命周期。每阶段先取 profile，再序列化候选；后续累计 profile 包含此前观测开销。来自诊断模块及其子调用的栈标记为 `diagnosticAllocation`；此标记能帮助区分直接观测分配，不能消除 inspector 对 GC、时序和进程内存的影响，也不能完整归属全部 V8 内部分配。

## 固定范围

采样间隔固定 256 KiB，每会话最多 8 个阶段、32 个 store、每 store 4096 个来源条目、每集合 100000 个候选；每文件最多 16 MiB、每会话输出最多 64 MiB。栈映射最多读取 128 个准备副本内仓库模块、累计 32 MiB；原始采样仍覆盖完整 worker 生命周期和第三方调用栈，不因映射范围收紧而删减样本。超限、未知锚点、worker 缺失或阶段不匹配使诊断失败，不截断后继续。

这些限制约束诊断输入/输出和阶段数，不能硬性限制 V8 inspector 内部的采样内存。watch 停止握手最多等待 10 秒；失败仍由原 runner 结束自己创建的子进程并恢复已修改来源。没有强制 GC、额外业务重建或产品源码埋点。
