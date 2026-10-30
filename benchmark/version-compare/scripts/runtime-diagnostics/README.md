# weapp-vite HMR 运行时诊断

这个显式模式用于定位 `demo-weapp-vite-tailwindcss-v4__mp-weixin` 的 HMR RSS 差异。它保留原来的三次冷构建、三轮修改与回滚、文件就绪条件和业务关闭流程，只在 HMR 的真正业务 CLI 中启用观测。它不调用现有 Uni/Taro/Mpx allocation 模式，不创建 candidate store，不修改产品或依赖源码。

```sh
pnpm exec node benchmark/version-compare/scripts/run-matrix.mjs --versions-file <独立准备adapter生成的expected-versions.json> --only demo-weapp-vite-tailwindcss-v4__mp-weixin --build-runs 3 --hmr-runs 3 --weapp-runtime-diagnostics --runtime-diagnostic-dir <专属证据目录> --out <专属结果目录/matrix-raw.json>
```

必须由[独立准备 adapter](../source-diagnostics/README.md)先固定两侧完整提交 SHA、Git tree、archive 来源与准备回执，生成无 Git 元数据的副本，分别 frozen 安装、构建并复核安装后全量清单。业务依赖不能软链到其他 checkout。当前侧同样记录实际提交与工作树状态。旧 `run-ci.mjs` 的 HEAD 身份记录不能替代产品 tree/lock/driver 绑定；未生成完整 binding 的版本清单会失败。显式工作流调用 adapter，再合取本模块证据与源码恢复结果。

每侧固定三次冷构建、一个 HMR 会话中的三轮修改和回滚、八个 checkpoint。`hmrSessions=1` 不表示 `hmrRuns=1`。这个模式不能合用 `--guard`、input/allocation 或 GC 诊断，不计算正式预算、不触发反序确认。工作流必须使用专用 check 和并发组，不借用原门禁名称。

## 身份与验收协议

每个版本的 `diagnosticIdentity.binding` 必须是版本 1 的对象，包含 `product: { sourceCommit, sourceTree, root, files }`、`lock: { relativePath, bytes, sha256 }` 与 `driver: { sourceCommit, sourceTree, root, files }`。两个 `files` 清单的每项均为 `{ relativePath, bytes, sha256 }`，其中 `relativePath` 是 POSIX 逻辑路径，在模块边界转为本机文件路径。根 `pnpm-lock.yaml` 必须同时列在 product 清单；真实 weapp-vite bin 和 manifest 也必须在清单中。准备 adapter 还应列入实际 runner、config、构建产物及实际加载包入口等关键输入，并为完整 Git tree 来源、安装后全量清单提供独立证明。

driver 清单至少包含全部 runtime-diagnostics 模块、`run-matrix.mjs`、`process-memory.mjs`、路径及失败协议模块；controller 与 acceptance 的真实执行路径必须属于该 driver。复制到会话的每个 helper 既核对复制字节，也核对 driver 原始文件回执。controller、真实业务 preload 与最终证据校验均重读清单关键文件。每侧清单至多 64 KiB，每个角色至多 4,096 项，每文件至多 16 MiB，两个角色关键文件累计至多 96 MiB；清单超限失败。这些 files 仅证明列出的关键输入，不等于完整 Git tree 证明。

matrix 落盘后，调用方必须用来自准备 adapter 的独立期望版本清单验收，不能使用 raw 自述身份：

```sh
pnpm exec node benchmark/version-compare/scripts/runtime-diagnostics/acceptance.mjs <matrix-raw.json> <expected-versions.json>
```

该命令只验证 matrix 身份、三次 build、三轮 HMR 与每个 build/HMR 会话的非零 RSS 原始进程树样本；任何 `row.error`、零样本或缺轮次均非零退出，并保留原 raw。它返回 `matrixComplete: true`、`runtimeEvidenceVerified: false`，不声明 profile 已通过。完整调用方必须另验每侧 controller 的首败、关闭、身份及 `verifyRuntimeEvidence` 的八份 profile，再合并结果。任一失败都应保留首败，并以工作流 `always()` 上传已产生的工件；不能因 matrix 主程序仅记录错误行而成功退出就宣称通过。

## 证据层次

- `node.resolve`：真实 Node 解析钩子的 specifier、parentURL、conditions 和结果。解析记录不证明模块已加载。
- `node.load`：实际加载钩子返回的格式、物理文件和可取得的真实源码哈希。它不证明模块已求值或某函数已执行。
- `v8.script-parsed`：Inspector 通知的脚本身份、URL、是否 ESM 和原始 sourceMapURL；只证明 V8 已解析。
- `v8.script-source`：Debugger 返回的源码字节哈希。只在明确目标包与准备根内取得，sourceMapURL 不自动映射，也不能通过 chunk hash 判定两侧函数相同或不同。
- `profile-N.json.gz`：固定 256 KiB 间隔、包含 major/minor GC 已回收对象的累计统计分配。它不是存活堆、泄漏证明或正式进程树 RSS。profile 中原始 URL、scriptId、函数名、行列保留，未映射的第三方/生成函数不得跨构建强行比较。
- `gc.ndjson`：自然发生的 GC 通知及回调时刻的内存。没有回调不证明没有 GC；回调内存不能解释为 GC 结束瞬间的内存。

同包同版本的不同 realpath 会分别保留，包括 weapp-vite 消费的 npm engine 与 workspace core 消费的 engine。只归一化已知准备根的显示 key，不合并真实物理身份。目标源码身份的具体范围与限制写入 `process-start.json`。

## 采样阶段与影响

八份累计 profile 依次对应文件就绪、三轮修改输出被观察、三轮回滚输出被观察，以及原业务停止之前的诊断停止点。观测阶段不等于业务 finalizer 成功、HMR preparation 已发布或输入来源相等。模块和 GC 的 phase 只表示最近收到的 checkpoint 窗口，不能当作精确业务操作归属。

控制器会等待每份诊断回执，Inspector、源码哈希、profile 序列化与压缩也会改变时序和分配；后续累计 profile 包含观测开销。两侧使用相同协议，但这不能消除全部观测影响。因此本模式的 build/HMR 时长和 RSS 不用于正式预算，正式复验必须关闭本模式。

## 资源与完整性

wrapper、pnpm 和其他后代继承环境后，只有 `argv[1]` realpath 与包声明 bin、manifest/helper 哈希一致的业务 Node 才注册 Inspector、模块钩子和定时器。诊断不添加业务 signal handler，停止只注销本任务模块/GC observer 和 inspector。原工作负载负责业务进程关闭；状态、stdout/stderr、首败和关闭回执由控制器归档。

每份压缩 profile 最多 16 MiB、逻辑解压最多 64 MiB，worker 证据最多 64 MiB、单路日志最多 8 MiB、控制器摘要最多 8 MiB，会话全部工件总计最多 96 MiB；事件、源码身份文件数和源码字节数另有固定上限。所有上限、未取得源码、协议失败或关闭失败明确记录。超限和缺证失败，保留已写入首败工件，不能通过截断、可选跳过或旧报告放行。

文件读取在同一个 descriptor 上执行，读取前后核对普通文件身份、尺寸和修改元数据，最多读取原尺寸加一个探测字节；不使用 `stat` 后无界 `readFile`。不可变工件出现替换、增长或哈希不符即失败。command/reply 使用明确原子替换协议，仅 descriptor 身份变化允许固定三次重读；格式、哈希或超限错误不重试。元数据核对不是恶意并发写入下的原子快照证明；准备副本、driver 和已关闭证据目录必须由本任务独占，且在边界保持静止。

## 验证建议

先在任务自有、依赖独立的 checkout 运行 `runtime-diagnostics.test.mjs` 的真实 Node fixture，再运行原有 benchmark 诊断与工作负载隔离回归。fixture 覆盖实际 descriptor 增长/替换/关闭首错、关键文件及 driver/hash 绑定、CLI 错误行与零 RSS 非零退出；matrix fixture 中的 RSS 是显式合成协议数据，不能当作真实工作负载证据。专项真实 weapp-vite 运行必须分别确认两侧八份 profile、模块物理身份、退出资源和源码原文恢复；最后关闭诊断，以原正式命令复验。
