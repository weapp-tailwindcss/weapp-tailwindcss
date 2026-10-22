---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
regressions:
  - packages/weapp-tailwindcss/test/ci/benchmark-report.test.ts
verification:
  - claim: Ubuntu准确078e的Taro插件稳态P95门禁失败仍未消除
    kind: ci
    status: failed
    sha: 078e6e020db23143cd01826450a5a2b969bda610
    environment: Ubuntu24.04、Node22.23.3、pnpm12.14.0，准确merge dae85f7c94fc223dad1295c5461ee49dc126f31e
    url: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39704711574/job/119583588672
  - claim: 精确两侧源码分别安装构建后，一次有界3build及3HMR诊断完成，取得实际Taro进程CPU原件
    kind: integration
    status: passed
    sha: 078e6e020db23143cd01826450a5a2b969bda610
    environment: macOS arm64、Node22.23.3、pnpm12.14.0；base7d80与current078e独立git archive，只有外部共同benchmark driver加CPU观察，非正式性能验收
    command: node .tmp/run-078e-perf-cpu.mjs
  - claim: Ubuntu首次性能失败的具体保留量与GC触发根因尚未取得证据
    kind: integration
    status: pending
    sha: 078e6e020db23143cd01826450a5a2b969bda610
    environment: Ubuntu24.04准确提交及原3build/3HMR配置
    reason: 本地带采样的单对对照没有复现两次稳态均违规；不能用macOS成功、GC相关性或未采到函数证明CI根因消除
---

# Taro Vite 精确版本 CPU 诊断

## 症状

078e的Ubuntu CI插件稳态P95从1210升至1388ms，+14.71%，两次稳态均超原5%＋10ms门槛。原始三次base为1292/1200/1210ms、current为1453/1388/1282ms，CSS task增量176/67ms占插件增量188/72ms的大部分。[全面运行记录](tailwind-acceptance-2026-10-22.md)保留该失败，未请求重跑或放宽判定。

## 根因与纠正

先核对输入与真实调用路径，不凭新增代码名称决定热点。HMR仍使用原始mutation：固定`bg-[#123456]`及变化marker；该类在两侧原文件已存在，所以这轮更新不保证新增有效utility。不能修改mutation强迫某个增量分支出现，再用它解释原CI。

在系统临时目录分别导出base7d80及current078e，按CI顺序先current、再base执行各自`pnpm install --frozen-lockfile`和`pnpm build:pkgs`；两侧锁不同，不共享dist。Node22.23.3及pnpm12.14.0由缓存真实二进制创建本任务PATH入口，实际Taro进程再次核对`execPath`及`process.version`，不是仅更改driver的Node。

事后逐个核对current的8796个blob与base的8480个blob，各有相同4个PS1文件与Git原始blob字节不同。它们逐字节等于各自tar成员，CRLF归一化后等于Git blob，来自准确版本`.gitattributes`的`*.ps1 text eol=crlf`规则；首次差异记录保留。两个Tailwind参考目录是gitlink，未展开，且不参与本轮Taro构建。其余blob均匹配，不能写成全树原始字节完全一致。

只给两个实际`--watch`的`taro-build-runner.mjs`预加载Inspector。按准确入口、cwd和参数过滤，不采pnpm、guard或普通build进程。产品源码、插件配置、回调身份、缓存、计时范围及默认信号处理均未改；没有包装Promise或`process.exit`。仅共同driver在原`stopChild`前增加私有有界`Profiler.stop`回执，之后仍执行原终止和源码恢复。三个build没有CPU预加载。两端采样间隔同为1000µs，完整记录启动、mutation、rollback及停止边界。

第一份外部driver因macOS临时目录`/var`别名与ESM真实`/private/var`不等，入口guard未运行main，0.235秒后因没有raw失败。该设置失败原记录仍在；修正真实路径后才开始唯一一对实际采样，没有重跑产品样本。

## 验证

| 样本 | base插件ms | current插件ms | current相对base |
| --- | ---: | ---: | ---: |
| HMR1 | 1051 | 1069 | +18 |
| HMR2 | 1202 | 1473 | +271 |
| HMR3 | 1039 | 1013 | −26 |

原`assertBenchmarkMatrixRows`拒绝缺行、row.error或样本不足，`buildSummary`及`evaluatePerformanceGuard`仍使用原5%、10ms、两稳态样本和64MB配置。该带采样对照的guard没有违规，因为只有1/2稳态点超过门槛；P95仍为1202→1473ms，不能替代Ubuntu的正式失败。所有源码marker已按原始字节恢复，宿主、pnpm、runner均退出；私有控制端口关闭。原件和摘要保存在本任务临时目录及[持久hash摘要](evidence/taro-cpu-078e.json)，Git不包含完整profile，不以摘要代替重放。

采样按`timeDeltas`加权，self和inclusive分列；inclusive存在嵌套，禁止相加当总成本。比较mutation-write至rollback-write的同轮窗口，不把初次启动、build或其它轮混入稳态。driver与子进程的私有停止握手时间相互包围；Inspector时钟与hrtime的可行offset区间分别为base[-123,8973]µs、current[12,7738]µs。current原始start在前置hrtime前12µs，零offset检查保持false，未伪装通过。分析另外计算两端offset的敏感性结果，不宣称穷举区间内极值或精确调用耗时。

在这些端点的离散采样中，第二轮GC self为base678.535/682.077ms、current1005.338ms；差异与该轮变慢相关。它属于完整HMR窗口，不等于插件exclusive耗时。没有heap快照、分配来源或GC事件类型证据，不能认定产品无保留量退化，也不能把所有差值归给调度噪声。

第二/三轮`normalizeMiniProgramColorMix`的inclusive约11.792/11.375ms，`collectCustomPropertyValues`约12.790/12.793ms；`removeUnsupportedModernColorDeclarations`为21.290/19.042ms，base相应30.459/26.499ms。`finalizeMiniProgramCssRoot`为71.124/67.416ms，base为77.209/71.999ms。这些类别互相重叠，不能相加。没有采到`collectStaticCustomPropertyValues`不证明它没有执行。当前数据不支持把该次271ms全部归给新增静态变量分析或颜色清理。

源码审查找到稳定颜色Map在部分调用点无人消费的重复计算，但本轮清理采样本身未升高，尚无足够证据认定它是原门禁根因；本片不据此修改产品。后续优化必须先固化保持注册/条件/局部覆盖资格的失败回归，不能删除Root来源准入或按大小跳过语义。

## 适用边界

这是一次有界macOS诊断，不是无采样性能验收，也不是新的全面运行。源码归档、工具、driver和profile完整性可核对；采样器、机器、GC和native/I/O成本仍影响结果。只保留诊断相关性，继续登记原CI失败及pending根因，不追加重复样本直到通过。

新head `f7890bb0ff4e3a1b640166dbe48f53dc411cc0cd` 的普通hosted检查尚在进行，不能继承078e的任何成功。微信环境阻断及原生能力缺口也不因该性能诊断而消失。

## 规则评估

不新增AGENTS，不修改产品、计时门槛、性能统计或static基线。沿用准确输入、有限诊断、原件与资源收尾规则。
