---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5
regressions:
  - benchmark/version-compare/test/project-selection.test.mjs
  - packages/weapp-tailwindcss/test/ci/benchmark-memory-confirmation.test.ts
  - packages/weapp-tailwindcss/test/ci/benchmark-report.test.ts
---

# 性能执行器的空选择与缺证放行

## 症状

主代理在固定 de4551e8daa6c76858d8ebdfd3166961b8b2a512 测量时，把两个小程序项目的 `__mp-weixin` 误写为 `__weapp`。执行器完成两侧准备后，生成 `rows: []`、`compares: []`，却以 `performanceGuard.passed: true` 退出。此结果作废，原日志、报告与 `invalid-selection.json` 保存在 `.tmp/perf-de455-vite-fixed/`，不计通过或性能复测。

## 根因与纠正

CI 分片入口原有未知 key 检查，手工 `run-ci` 与独立 `run-matrix` 没有复用：后者直接过滤项目，未知 token 被静默丢弃。报告只判断违规列表是否为空，无法区分未测和通过。内存反向确认也存在相同漏洞：空结果、单版本、缺项目或重复行都可能被当成原 RSS 违规未复现。

共享选择函数逐个检查请求 token；未知项、合法混非法项和显式空选择均失败，不猜测修正拼写。两个执行入口在版本读取、复制、网络与构建前完成检查；原有项目目录别名、多目标和去重语义保留。

原始矩阵按本轮选中项目与两个版本逐对检查，缺行、重复、替换和仅有 core 微基准均拒绝。每个应执行阶段还必须有本轮要求数量的有限样本及有效中位/P95；只有身份、空 summary 或缺少样本均不能视为完成。主执行器在追加 core 数据前校验，内存确认也独立校验；缺证时保留主轮失败，不产生成功 summary。内存确认的零 build、预登记不支持模式与原始执行错误仍交给已有策略，不改变时间、内存或统计门槛。

## 验证

先运行新增内存确认回归，14 项中 6 项以“实际 true、预期 false”失败，固化原漏洞；首次修复后两份现有报告/确认文件共 44 项通过。复核发现完整身份但无测量的第二层缺口，再固化 2 项红例，补齐样本检查后两份文件共 46 项通过。独立选择与真实 CLI 回归先通过 19 项，随后补稀疏身份及阶段测量回归。CLI 使用临时哨兵文件和缺失 versions 验证检查确实发生在准备与构建前。路径使用 `node:path` 与 `os.tmpdir()`，不依赖本机目录。

原报告测试中检查内联 filter 文本的断言已移除，由真实选择与 CLI 行为回归接替。该旧文件的 `--no-ignore` ESLint 暴露 16 条既有格式/Buffer 问题；准确 de4551 原文件经相同 stdin/filename 检查为 17 条，确认没有新增此项债务，未批量格式化。其余本轮脚本和新增测试独立检查。初轮及第二轮失败日志分别为 `.tmp/benchmark-completeness-red.log`、`benchmark-missing-measurements-red.log`；最终报告/确认回归在 `.tmp/benchmark-measurements-green.log`。

最终独立选择、CLI、稀疏身份与测量合同为 27 项通过，日志 `.tmp/benchmark-selection-measurements-final.log`；六个本轮脚本/测试的定向 ESLint 通过，规则检查为 67 条规则、356 份文档、1016 条命令、零错误，`git diff --check` 通过。再以新合同重读原 Mpx 两行与 Vite 四行真实工件，样本完整性全部通过；这不改变原性能门禁结论，也没有重新采样。

## 适用边界

纠正 ID 后的固定测量保存在 `.tmp/perf-de455-vite-corrected/`，它实际测了 Taro Vite 与 weapp-vite 两项目、两版本、各三轮 build/三轮 HMR。Taro Vite 通过原门禁；weapp-vite 的构建中位 2817.67→14506.27ms、HMR 中位 6548.98→7102.14ms、HMR P95 6610.76→11657.61ms，三项原门禁失败。两侧该项目均缺插件 timing，不能据此定位某个插件。两侧最终八份 WXSS 字节完全相同，没有产物膨胀证据。

随后仅做一次 CPU 诊断构建，两侧保留原独立副本，在相同构建环境上增加 CPU profile，耗时约 4339.62/4278.89ms；这是诊断，不能替代原门禁或抹去失败。主机同时观察到 load average 20.63/29.02/30.91、系统安全服务约 365.8% CPU，以及普通只读命令和 Node worker 启动迟滞；这些是环境异常事实，尚不能证明首次性能差异的具体根因。原始诊断与两侧日志在 `.tmp/perf-de455-weapp-cpu/`，不直接归因为噪声或产品缺陷，不通过重复采样等待偶然通过。

Mpx 的另一组固定对照通过既有门禁且无内存违规，但构建、构建插件与 HMR 插件中位分别上升 18.06%、7.92%、11.17%，各精确单侧 p=0.20，不能写成所有耗时退化低于 5%。它是本机 Node 24.18.0 对照，不替代 hosted Node 22 或全面原生验收。

## 规则评估

不新增 AGENTS，不放宽门槛。用可执行选择与行完整性合同阻止缺证放行，保持整体验收 partial。
