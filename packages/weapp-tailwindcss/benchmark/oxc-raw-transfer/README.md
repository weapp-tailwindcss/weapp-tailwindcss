# Oxc raw transfer 定向基准

```sh
pnpm --filter weapp-tailwindcss exec tsx benchmark/oxc-raw-transfer.ts --root <仓库目录> --output <报告路径> --verify-only
pnpm --filter weapp-tailwindcss exec tsx benchmark/oxc-raw-transfer.ts --root <仓库目录> --output <报告路径>
```

被测工作树需要已安装依赖并构建内部包。脚本从 `--root` 加载实际 `getOxcSourceAnalysis` 与 `oxcJsHandler`，不需要修改产品 API。两个独立 worker 通过各自的模块缓存包装 `oxc-parser.parseSync`，强制普通 AST 或 raw transfer；若调用次数不符合预期、分析失败或 handler 回退，则验证失败。

固定输入由 727 条完整对象记录构成，含中文、emoji、模板字面量、条件比较和类名分支，UTF-8 大小约 125 KB，不截断代码。等长编号注释使每个样本的缓存身份唯一；每个 pair 的两个模式使用完全相同的输入，并比较完整分析对象及最终输出字符串。

默认执行 3 轮，每轮每阶段预热 5 pair，再采样 20 pair，先后次序交替。`--pairs` 至少 20，`--rounds` 至少 3，`--warmups` 可调整。`--verify-only` 每阶段只检查一组且不输出性能统计。四个阶段分别是分析缓存未命中、分析缓存命中、handler 缓存未命中和 handler 缓存命中；暖分析按 200 次批量计时，暖 handler 每组 5 次。每次冷操作必须解析一次，每次暖计时阶段必须完全不解析。

报告保存输入 SHA256、逐样本哈希、Node/依赖版本、被测源文件哈希、轮次统计和原始样本。计时不包括进程启动、IPC、相等断言与哈希计算。三轮之间重建 worker；采样期间源文件与 Git revision 必须不变。

运行前停止同机上的构建、测试和其他性能任务。此结果只能说明 Oxc 分析及 JS handler 的局部耗时，不能作为完整项目构建或 HMR 的加速结论。
