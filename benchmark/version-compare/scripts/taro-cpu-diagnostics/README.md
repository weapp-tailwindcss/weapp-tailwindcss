# Taro Webpack CPU 诊断

本入口只接收调用方已经完成复制、frozen install 与 build:pkgs 的两个无根 `.git` prepared root；不准备依赖，不改生产源码。固定项目是 `demo/taro-webpack-react-tailwindcss-v4`，固定命令是各 role 的真实 `scripts/taro-build-runner.mjs build --type weapp`。

每侧只运行一次，顺序为 base、current。任一侧失败立即停止，后续侧记为 unstarted。调用方需要提供每侧的完整来源提交 SHA、lock SHA256 与 runner SHA256。来源提交是准备阶段凭证，不是无 Git 副本自行证明的 tree 等价。根与项目 node_modules、根虚拟 store、命令入口和 CLI 包/bin 的物理路径必须属于对应 role。

```js
import { runTaroCpuDiagnostics } from './run-taro-cpu.mjs'
const report = await runTaroCpuDiagnostics({
  roles: [
    { role: 'base', root: baseRoot, sourceCommit: baseSha, lockSha256: baseLockSha, runnerSha256: baseRunnerSha },
    { role: 'current', root: currentRoot, sourceCommit: currentSha, lockSha256: currentLockSha, runnerSha256: currentRunnerSha },
  ],
  outputDirectory: newOutputDirectory,
  preloadFile,
})
```

`outputDirectory` 必须是不存在的新目录，其父目录已存在，且位于两个 role 外。CLI 等价入口接受 `--roots-file <JSON> --output <新目录>`，JSON 含 `roles`。可降低 timeout，不能超过固定 600000ms。

直接派生当前 Node，传 `--cpu-prof --cpu-prof-dir=<role output> --require <preload>`；不通过 NODE_OPTIONS 开启 profiler。默认 Node 文件名包含 pid/thread/sequence，避免 fork 继承固定名字后相互覆盖。仅本次派生 PID 的 thread=0 profile 被识别为主进程；其它 profile 保留 hash，不能把它们当作已完成整个进程树的验收。继承的 profiler、preload、Inspector、覆盖率或主动 GC 配置会被拒绝；普通 Node 内存选项记录在报告中。

`WEAPP_TW_TARO_DIAG_IDENTITY` 为单个 JSON，字段严格为 role/root/sourceCommit/lockSha256/runnerSha256/preloadSha256/output。preload 在 runner 重写 argv 前绑定原始入口，且仅主线程注册退出 observer。读取和来源元数据已拆为两个同目录 helper，报告分别保存 helper 的实际哈希；driver 准备清单同时核对这些文件。退出时只读取 `require.cache` 中 `loaded === true` 的目标 CJS，不加载业务模块、不 hook Module._load。runner 自身既有的 Taro 兼容 hook 保持原样。

每侧输出原始 stdout/stderr、CPU profiles、`loaded-cjs.json`；根输出 `taro-cpu-diagnostic.json`，包含原始文件 hash、同一 PID 的 identity、已完成/未启动 role 和首败。日志固定每流 8MiB，所有 profiles 合计 64MiB、最多64个；CJS manifest 8MiB，单侧证据96MiB，controller2MiB。超过上限即 incomplete；保存的日志前缀明确记录 discardedBytes 与 complete=false。超时仅清理该次子进程组（Windows 精确 PID tree），不会按进程名清理其它任务。POSIX 主进程 close 后仍检查自建进程组；同组后代未退出时保留 SIGTERM 宽限期后升级 SIGKILL，并有界确认组已消失，无法确认即 incomplete。正常主进程退出却留下同组后代也作为生命周期失败清理。

原始 Node CPU profile 的 `timeDeltas` 可能含负值。采集结构完整与采样时间单调性分别记录：保留原始文件和 SHA，不排序、不钳位、不改写；主进程 `sampleTiming` 报告负值数量、最小时间差和 `monotonic`，不因负值单独判定证据截断。非整数或超出有符号 32 位范围的时间差、逐样本累计时间越出 profile 起止范围、长度不一致、缺少数组或非法起止时间仍是证据失败。采样时间或业务窗口未对齐的归因保持 `unknown`，不会用于正式性能放行。

所有报告都必须含 `diagnosticOnly: true`、`budgetAcceptance: false`。CPU profile 覆盖整个主进程，包括启动、preload 和退出 observer 的文件哈希、序列化、写入开销。它不能称为 processAssets 热点；没有同次对齐窗口时，相关归因一律 `unknown`。退出时磁盘 hash 也不能证明字节正是最初加载时的源码。缺失 map 为 unavailable/unknown；现存越界、损坏或超限是证据失败。

维护者应执行真实 Node fixture 后再接入独立诊断工作流；该入口本身不改变 run-ci 或正式预算。
