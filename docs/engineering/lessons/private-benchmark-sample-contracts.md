---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: f9f0cd0aad68f3e0774790d15b87fc443c7ef4e8
regressions:
  - packages/weapp-tailwindcss/test/build/benchmark-contracts.test.ts
---

# 私有微基准的输入与非空样本边界

## 症状

依赖升级后的私有 scripts 标准类型检查暴露了统计数组取值可能为空的问题。两份 Vite 微基准的 `legacy` 单模式把空的 optimized 数组送入双侧统计，产生 NaN，写入 JSON 后变成 null。两份 JS 微基准则把空样本的 percentile 当作零，掩盖没有实际测量的状态。

四个入口均允许零轮测量。Vite 对显式 NaN 或 Infinity 还会静默改用默认值，JS 可以在检查轮次之前扫描源码。只给数组取值加非空断言，无法修复这些输入与报告问题。

## 根因与纠正

测量次数、预热次数和超时由 CLI 输入边界负责：测量次数必须为正整数，预热及注入页数必须为非负整数，超时必须为正有限数。省略参数仍使用原默认值，显式非法输入立即失败，早于源码加载、子进程启动、页面注入和报告写入。原 Vite 的5轮测量、1轮预热、120000ms超时，以及 JS 的5轮或8轮默认值保持不变。

共享统计入口拒绝空样本和非有限样本，再按受检查的索引取值。Vite 保留偶数样本取中间两项平均、奇数取中项、方差除以 N 的算法；JS 保留最近秩 percentile，包括最近秩50作为中位数的既有语义。不能顺手将这两种中位数定义合并。

双侧比较只在 `both` 模式生成；意外缺少任一侧测量仍报错。单模式保留该侧原始 runs，summary 为显式空数组，不伪造另一侧为零，也不输出 null 比较。

## 验证

在本任务独立依赖工作树、Node24.22.1/pnpm12.15.0 下，以包含本地改动的源码执行：

`CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/build/benchmark-contracts.test.ts --update=none`

四个真实 CLI 的零轮次回归在接入校验前均失败，其余28项控制通过。另补两份 Vite 的 runs、warmup、timeout、mode 缺值回归：裸选项不能被当作省略后领取默认值。最终40项通过。CLI 用例使用任务临时目录、不存在的输入 glob 或工作目录，要求明确输入错误、退出1且无报告；不执行实际性能测量。统计回归覆盖奇偶样本、总体方差、零样本值、最近秩、空集、非有限数、两种单模式和双侧缺失，并检查输入数组不变。

标准原配置 `pnpm --filter @weapp-tailwindcss/scripts exec tsc --noEmit --pretty false` 从116降至106条诊断，仍失败。没有修改编译选项、排除源码或使用非空断言掩盖样本问题。原始红绿日志保留在忽略的本地证据目录。

## 适用边界

这里只修复 `tools/weapp-tailwindcss-scripts` 的四个私有微基准。它不修改正式版本对比的3次 build、3次 HMR、RSS 预算或保护门禁，不构成任何性能改善结论。PR 准确 head 的 Windows PowerShell、正式 RSS 与本地原生事件延迟阻塞仍需各自证据，不能用本次40项通过替代。

## 规则评估

不新增 AGENTS 条目。现有根因修复、测试及不放宽预算规则已经覆盖，持久回归明确区分 CLI 输入、测量样本和比较报告的所有权。
