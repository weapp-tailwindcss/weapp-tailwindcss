---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: baf8a7320d49ca3c5ae936d0cb6fe6de11e5704b
regressions:
  - packages/hbuilderx-runner/test/discovery.test.ts
  - packages/hbuilderx-runner/test/host-connection.test.ts
  - packages/hbuilderx-runner/test/log-output.test.ts
---

# HBuilderX 源码严格类型门禁

## 症状

完整扩展流程 a5060b8b 的根构建、6,937 项单测和 ESLint 通过后，根类型检查在测试辅助包导入的 HBuilderX 进程模块报告两处 TS4111。继续使用该包已有的严格 tsconfig 检查全部源码和测试，共发现 45 处类型诊断。

## 根因与纠正

HBuilderX 包虽然已经配置 strict、exactOptionalPropertyTypes、noPropertyAccessFromIndexSignature 和 noUncheckedIndexedAccess，但没有 typecheck 脚本，也未接入根类型检查。声明构建和 Vitest 运行不负责验证这些源码约束。新增受管子进程测试导入该包后，才让其中一部分实现进入其他包的检查范围。

新增包级 typecheck 并接入根入口，沿用已有严格配置检查全部源码与测试。环境变量按索引签名访问；转发可选参数时只省略 undefined，保留零超时、false 和空字符串的既有语义。没有扩大公开可选属性类型或关闭严格检查。

进程枚举显式使用 UTF-8，但 ReturnType 取到 spawnSync 最后一个重载，将返回值误扩为 string 或 Buffer；改用实际编码对应的 SpawnSyncReturns<string>。测试提供完整的类型化进程结果，日志测试使用未启动的 ChildProcess 对象和内存流，避免不完整对象的强制转换。固定非空用例数组与正则必选捕获组使用各自明确的不变量收窄；删除不能描述嵌套部分匹配的浅 Partial 约束，保留原运行断言。

## 验证

- 修复前：本轮完整流程两处 TS4111；包级真实 tsc 共 45 处诊断。原始日志保存在 `.tmp/full-regression-a5060b8b.log` 和 `.tmp/hbuilderx-types-before.log`。
- 修复后：`CI=1 pnpm typecheck` 通过，含新增 HBuilderX 全源码及测试编译入口。
- `CI=1 pnpm --filter @weapp-tailwindcss/hbuilderx-runner test --update=none`：65 项通过、2 项原有条件跳过；其中 Windows 进程发现契约使用完整返回结构，macOS 真实子进程参数与错误回归通过。
- `CI=1 pnpm --filter @weapp-tailwindcss/hbuilderx-runner build` 通过；修改文件的显式 ESLint、规则及差异检查通过。

## 适用边界

这次修复解决源码类型检查与测试模型的边界，不改变公开 API、运行策略或设备选择，不需要公开包 change intent。未改 demo、样式或 static 基线。Windows 的 mock 契约测试不是 Windows 实机验收；原有 IDE 和 Windows 条件测试跳过不计作通过。

## 规则评估

不新增 AGENTS 规则。持久回归是接入根入口的完整编译检查，直接覆盖原来被构建和运行测试遗漏的实现与 fixture，不用镜像源码的字符串断言替代编译器。
