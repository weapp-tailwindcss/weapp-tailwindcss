---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: f5ec2e2d9bd7c24583281e7aa2521c6272840e35
regressions:
  - packages/postcss/test/native-keywords.test.ts
  - packages/postcss/test/native-layout-values.test.ts
  - packages/react-native/test/compiler-native-variants.test.ts
  - e2e/tailwind-react-native-conversion-oracle.test.ts
---

# React Native 字面量编码与布局边界

## 症状

审查 Tailwind 四端能力时，原生编码器把 `position:fixed/sticky` 和部分浏览器对齐枚举直接放入 style，却丢弃 React Native 0.81 已支持的 `display:contents`。默认 `p-4` 的 `calc(var(--spacing) * 4)` 被空白拆碎；五项 margin/padding 则悄悄截取前四项。`ios:hover:*` 等合成变体还会丢失非原生条件。

合成变体复制基础规则的已分配 StyleSheet ID，使基础与变体 lookup 指向同一 ID；后续生成 styleEntries 时，平台/深色条件可能覆盖基础规则。

## 根因与纠正

布局字符串采用开放透传，未按目标 API 的封闭枚举校验。修复冻结 React Native 0.81 支持的 display、position、flex 和对齐取值，对不适用值沿现有 warning 协议明确诊断。来源见 [官方 Layout Props](https://reactnative.dev/docs/0.81/layout-props#position)。`static` 和 `contents` 的编码并不证明旧架构或所有设备都能渲染。

spacing 简写属于 CSS 值语法，必须由值 AST 按顶层空白/注释拆分，保留函数整体并验证一至四项。原生变体派生先检查完整前缀；拒绝浏览器条件，重新分配派生规则 ID，保留基础规则身份。

新增独立字面量 oracle，预期来自官方 Tailwind 参考、冻结的 RN 语义映射和手写字面量表。未知声明、条件或依赖令整个候选保持缺口；不能通过产品的编码结果反推支持。实际观察还保留原生隐藏表达式，以免只比较 style 对象掩盖语义。

## 验证

先运行失败回归：spacing 的 5 项全部失败，复合变体有 3 项失败，StyleSheet ID 隔离回归也先失败。布局枚举先得到 12 项失败，确认真实缺陷后再修复。

本 worktree 未构建依赖，直接包脚本最初因缺少 escape/shared 等产物或 native-runtime 入口失败。使用当前源码映射本轮 PostCSS/RN 模块、其余依赖映射到主 worktree 已构建产物后，以 `CI=1`、`--update=none` 运行包范围 Vitest：PostCSS 141 suites、1,462 项通过，3 项既有测试跳过。最终 RN 全包、布局值/枚举回归与独立 oracle 共 22 suites、184 项通过，包含 StyleSheet ID 与全注册表检查；严格类型检查与 ESLint 通过。未提交源码包含本轮修复，不能把 baseline SHA 当作修复后提交。

`pnpm agents:check` 在本分支因既有 catalog 规则未登记索引、缺少 `e2e/tailwind-inventory.test.ts` 两项失败，主任务整合后需重新检查。

`e2e/tailwind-react-native-conversion-oracle.test.ts` 对固定 23,286 候选先建立独立预期，再执行实际编译，完整核验 1,599 个合同（1,511 正向、88 拒绝），21,687 个保持缺口。补充案例检查 arbitrary 数值、负数、important、dark、平台和不支持的复合浏览器条件。错值、缺四边属性、丢条件、额外 metadata、错诊断均不能通过。

## 适用边界

本记录是纯内存编码回归，不是设备或像素验收。主任务的 iOS Expo 环境在 Pods 安装后报 `Can't determine id of Simulator app`，设备调度由主代理阻断处理。未在本子任务运行浏览器、设备、构建或 static 基线刷新；这些步骤继续由主任务统一验收。因此记录保持 partial。

## 规则评估

不新增 AGENTS 规则。已有“完整独立 oracle”“无法证明则 not-run”和分层证据规则足够，使用持久回归落实。
