---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: ecf72073789d388e98a377a955398ee6cddd8abd
regressions:
  - packages/weapp-tailwindcss/test/watch-cli-options.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-regression.unit.test.ts
---

# watch CLI 的可选参数必须符合真实严格类型合同

## 症状

[输出完整性观察顺序回归](watch-output-integrity-observation.md)的扩展类型检查发现 `watch-hmr-regression/cli.ts` 存在 10 条诊断：9 处 `process.env` 点访问违反 `noPropertyAccessFromIndexSignature`；返回对象把可能为 `undefined` 的值无条件写入可选字段，违反 `exactOptionalPropertyTypes`。工具包自己的 `tsconfig.json` 已启用这两个选项，不是临时探针新增的要求。

## 根因与纠正

原 CLI 总会创建 `miniProgramScope`、报告路径及若干可选数值属性，未提供值时仍保留值为 `undefined` 的自有属性。接口的 `field?: T` 表示属性可以缺席，并未声明已存在的属性可以取 `undefined`。修改接口、关闭严格选项或添加断言会掩盖构造边界的问题。

CLI 现在先按原来的解析规则取得值，仅在值不为 `undefined` 时把可选属性写入返回对象。私有 CLI 的对象形状收敛到既有可选类型，读取未提供选项的结果仍为 `undefined`。比较使用 `!== undefined`，因此显式数值 `0` 和空报告路径字符串均保留；CLI 优先于环境变量、无效数值回退、scope 筛选与小程序模式、500ms 插件预算默认值均保持原有语义。环境变量改为索引访问，`INIT_CWD` 仍经原来的路径解析和 workspace 查找流程处理。

持久类型回归通过 TypeScript API 读取真实工具包配置，只把编译入口收窄为 CLI，没有替换编译选项。值回归覆盖默认属性缺席、全部数值选项的环境回退和 CLI 零值优先、无效数值、scope、报告别名及调用目录。旧用例把“可选字段存在且值为 undefined”作为预期，现在同时检查读取结果仍为 `undefined`、属性确实缺席。

## 验证

macOS、Node 24.18.0、pnpm 12.9.1、Vitest 5.0.4。先在本记录基线运行新增回归，12 项中 6 项失败、6 项通过；其中持久类型用例重现全部 10 条诊断，属性合同用例重现多余的自有属性。原始结果保留在 `cli-red.log`。修复后的 5 文件、147 项全部通过，无 skip 或快照更新：

```sh
CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-cli-options.unit.test.ts test/watch-output-integrity.unit.test.ts test/watch-output-integrity-observation.unit.test.ts test/watch-hmr-runner-cleanup.unit.test.ts test/watch-hmr-regression.unit.test.ts --update=none
```

真实工具严格配置的扩展探针现在包含三个新改测试及其源依赖，`pnpm exec tsc -p .codex-tmp/output-integrity-test-types.json --pretty false` 通过。正常核心包入口 `pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false` 也通过。临时配置只负责扩大本轮检查范围；永久单测里的 TypeScript API 回归负责今后自动发现 CLI 的同类类型缺陷。原先 10 条诊断及与未改源码逐字节相同的基线日志仍保留，没有覆写成通过结果。

对本次拥有的五个源码和测试文件执行 `pnpm exec eslint --no-ignore`，旧大型回归文件暴露 24 条已有诊断。限定该文件调整 19 处导入及命名排序、四处正则字面量花括号转义，并用转义模板字面量保留工作流期望的原始字节 `${{ matrix.artifact_case || matrix.watch_case }}`；没有禁用规则或修改期望含义。修正后再次运行上述 5 文件、147 项回归及显式 ESLint，均通过，规则和 diff 检查也通过。没有运行 Prettier 或批量处理其它文件。

全面验收还须在集成后的准确提交重新预检并运行完整入口，定向通过不能替代后续阶段，本文保持 `partial`。

## 适用边界

修复属于私有测试编排工具，不改变公开包类型、发布产物、HMR 验收预算或筛选值。未修改 demo、样式 fixture、快照或输出监控实现，无需 change intent 或 static 基线更新。

## 规则评估

不新增 AGENTS，不放宽已有类型约束；用读取真实配置的持久回归覆盖原本缺少自动检查的 CLI 边界。
