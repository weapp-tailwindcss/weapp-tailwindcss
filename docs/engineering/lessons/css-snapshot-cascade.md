---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1244
baseline: 172c25e33a15713dcc4c1128d65c1cbd99ab54c4
regressions:
  - e2e/snapshot-declaration-order.test.ts
  - e2e/snapshotUtils.test.ts
  - e2e/apps-generator-mode-compare.test.ts
---

# CSS 快照去重必须保留层叠顺序

## 症状

全端预检通过后，完整 workflow 的前 9 项质量检查与矩阵断言通过，static 阶段首先在 Gulp 产物比较中发现字节数差异。逐项审查 MPX 基线时，又发现归一化后的主题颜色与真实产物最后一次声明不一致。

## 根因与纠正

既有 `dedupeExactDeclarations` 从前向后遍历，保留第一次相同声明。对于 `red → blue → red`，归一化错误地留下 `red → blue`。该函数还通过 `walkDecls` 递归访问后代，将嵌套规则和条件内的同名声明纳入同一个去重集合。

修复仅处理每条规则的直接声明，并从后向前去重，保留最后一次完全相同的属性、值与 important 组合。新增回归覆盖普通声明、自定义属性、important 优先级及嵌套规则边界，修复前三项均失败，修复后连同既有归一化测试共 36 项通过。

此次 static 差异还包括先前源码变更后尚未同步的产物基线：默认字体及颜色声明与用户主题覆盖同时保留、Vite 来源注释的空格变化、Web 分块中保留的 Tailwind 层声明和属性注册信息。没有通过清空快照或删除断言消除差异；逐项目对照源码、真实 CSS 与 diff，核对选择器数量、用户覆盖顺序和声明内容后更新。

## 验证

单测命令：

```bash
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/snapshot-declaration-order.test.ts e2e/snapshotUtils.test.ts --update=none
```

基线更新均限定 `E2E_PROJECT_FILTER`，每个项目同时检查 `apps-generator-mode-compare.test.ts` 和对应项目的 static 测试：

| 项目 | 对应 static 测试 |
| --- | --- |
| gulp-tailwindcss-v4 | e2e/gulp-tailwindcss-v4.test.ts |
| mpx-tailwindcss-v4 | e2e/mpx-tailwindcss-v4.test.ts |
| taro-webpack-react-tailwindcss-v4 | e2e/taro-webpack-react-tailwindcss-v4.test.ts |
| taro-vite-react-tailwindcss-v4 | e2e/taro-vite-react-tailwindcss-v4.test.ts |
| taro-webpack-vue3-tailwindcss-v4 | e2e/taro-webpack-vue3-tailwindcss-v4.test.ts |
| taro-vite-vue3-tailwindcss-v4 | e2e/taro-vite-vue3-tailwindcss-v4.test.ts |
| uni-app-vite-tailwindcss-v4 | e2e/uni-app-vite-tailwindcss-v4.test.ts |

例如 Gulp 使用以下限定命令；其他项目分别替换过滤值与测试文件，不运行全量 `-u`：

```bash
E2E_SKIP_OPEN_AUTOMATOR=1 E2E_PROJECT_FILTER='^gulp-tailwindcss-v4$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/apps-generator-mode-compare.test.ts e2e/gulp-tailwindcss-v4.test.ts -u
```

去重修复后，Gulp 与 MPX 的对比基线又通过 `E2E_PROJECT_FILTER='^(gulp|mpx)-tailwindcss-v4$'` 限定重建。weapp-vite 项目直接通过不更新基线的验证，未修改它的快照。每次更新后仍需以 `--update=none` 复验；完整验收另需新鲜全端预检。

七个项目的 static 测试、全项目 `apps-generator-mode-compare.test.ts` 及两个快照辅助层测试共同以 `--update=none --bail=1` 复验：10 个文件、74 项全部通过，无跳过。对 44 份变更 CSS 快照的 AST 审查未发现选择器删除，原有规则中属性的最终声明值保持一致；这项结构审查不替代后续真实运行时验收。

后续完整运行通过以上对比及动态类名回归后，在 HBuilderX 的 `uni-app-x-vdom-tailwindcss-v4` static 快照发现同类默认变量保留差异。该项目单独通过 `E2E_SKIP_OPEN_AUTOMATOR=1 E2E_PROJECT_FILTER='^uni-app-x-vdom-tailwindcss-v4$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-x-vdom-tailwindcss-v4.test.ts -u` 更新，再将 `-u` 替换为 `--update=none --bail=1` 复验通过。仅 `app.wxss` 增加 10 行默认声明，后续用户覆盖及其他产物未变。

## 适用边界

完整 static 后续跑完 131 个文件时，剩余两处基线差异为 uni-app 分包的默认变量/注释空格和 issue #1214 rpx watch 的同值重复声明。限定 `E2E_PROJECT_FILTER='^subpackage-uni-app-vite-tailwindcss-v4$'`，运行 `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/subpackage-uni-app-vite-tailwindcss-v4.test.ts e2e/issue-1214-rpx-calc-watch.test.ts -u` 更新这两项；再使用 `--update=none --bail=1` 复验。分包只更新 main.wxss，watch 仅删除 5 条同值重复记录，未更改行为断言。

这是测试辅助层的语义修复，不改变发布包的转换行为，也不触发包版本提升。原有不相关归一化策略保持原样；本次不能据此证明整个 CSS 归一化器与浏览器计算样式完全等价。

旧 workflow 在 static 首次失败后由本任务发送 SIGINT 停止继续调度，退出码 130 是中断结果，首个真实失败保留在单文件复现日志中。后续多端、HMR、视觉阶段尚待完整验证。

## 规则评估

不新增规则。继续遵守先定位首次偏离、补失败回归、限定项目更新基线、修改后新建预检的现有要求。
