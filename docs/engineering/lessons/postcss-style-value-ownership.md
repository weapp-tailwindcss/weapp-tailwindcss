---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1217
baseline: a4902b2f16adde86f5037ea8c65ab37d13d8b3f5
regressions:
  - packages/postcss/test/uni-app-x-style-value.test.ts
  - packages/weapp-tailwindcss/test/uni-app-x/style-asset.test.ts
  - packages/weapp-tailwindcss/test/ci/architecture-contract.test.ts
---

# uni-app x 样式值转换的归属补漏

## 症状

CSS 到 class 样式对象的转换已经位于 PostCSS，但主包生成 UTS 样式映射时仍重复维护属性名驼峰转换、`px` 数值化、逗号空白清理和行高类型约定。两份实现会独立演化，且每次声明转换都重复处理属性名。

## 根因与纠正

PostCSS 导出 `normalizeUniAppXStyleProperty` 与 `normalizeUniAppXStyleValue`，CSS 声明转换和主包 UTS 序列化共同消费。主包继续负责选择声明、生成 UTS 映射和构建图关联，不在 PostCSS 引入 bundler 类型或 UTS 代码生成。

行高只可能通过 `line-height` 或 `lineHeight` 映射到原有字符串属性，因此直接识别这两个名称，去掉值处理中的第二次驼峰转换。保留原有行为：普通数值 `px` 转为数字，行高保持字符串，数字行高转为字符串，`rpx`、百分比、表达式等保持原有类型；没有扩大数字识别范围或重写逗号清理语义。

## 验证

- 新增归属契约先在旧代码上失败，证明主包仍拥有重复转换；迁移后契约通过。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss test --update=none`：94 文件，896 项通过，3 项既有跳过。新增 20 个属性名和样式值边界用例，覆盖驼峰/连字符行高、负数/小数 `px`、`rpx`、函数、数字类型和自定义属性的既有处理。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/uni-app-x/style-asset.test.ts test/uni-app-x/harmony-scss-comments.test.ts test/ci/architecture-contract.test.ts --update=none`：43 项通过，包含 UTS 输出和 CSS/SCSS 消费路径。
- `CI=1 pnpm --filter weapp-tailwindcss... build`：依赖闭包及主包构建通过；构建产物 ESM/CJS 稳定入口均能调用新函数。保留既有 mixed exports 提示。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest bench test/uni-app-x-style-value.bench.ts --run`：持久基准通过。
- 修改的 TypeScript 文件经 `eslint --no-ignore` 检查通过，`pnpm release status` 识别两包中文 patch intent，`git diff --check` 通过。

性能对照从本记录的基线提交提取旧主包函数，使用相同输入逐项比较属性名与转换值，然后预热两组各 20 次。输入为 10,000 条交替的 `font-size` / `line-height` 声明，值为 0 至 31 的 `px` 字符串；新旧实现交替执行 30 组，每组 10 次，记录每批中位耗时。单独运行对照时，旧实现为 **3.47 ms**，新实现为 **1.97 ms**，约降低 43%。输出数组逐项一致；本数据只覆盖属性和值转换，不将其表述为真实框架构建或 HMR 的整体收益。

## 适用边界

本次只收敛既有转换，没有改变 demo、IDE 用例或 CSS/UTS 输出预期，没有更新 static 基线。内存输入回归和构建导出检查不能替代设备验收。整体迁移的多端验证仍有 uni-app x 生命周期及 Harmony 热更新边界，见[原有迁移记录](postcss-style-ownership.md)与[截图识别记录](https://github.com/sonofmagic/weapp-tailwindcss/pull/1222)。

## 规则评估

不新增 AGENTS 规则。用归属契约防止重复实现回流，并以两条实际消费路径的回归约束输出一致性。
