---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 87e1628127ab27eda402213768d70b1c2988166f
regressions:
  - e2e/apps-generator-mode-compare.test.ts
  - e2e/taro-webpack-react-tailwindcss-v4.test.ts
  - e2e/taro-webpack-vue3-tailwindcss-v4.test.ts
  - e2e/issue-1160-static.test.ts
  - e2e/issue-1164-static.test.ts
---

# 样式修复应覆盖所有消费入口的 static 基线

## 症状

提交 `87e162812` 的完整扩展轮次 `521b648e-7f3d-4dd1-aa3a-d7ff5d0b46f9` 通过前 19 阶段，在第 20 阶段停止。static 共 1133 项通过、10 项失败、36 项既有条件跳过；其中五个文件的失败来自此前样式修复漏更新的快照。其他失败属于测试夹具、设备环境隔离及依赖安装，不在本记录中视为已修复。

首次日志、内存采样和收尾记录保存在同轮 `e2e/.artifacts/full-regression/` 目录；本轮没有边测边修改或提交。

## 根因与纠正

`0d8aedec69` 修复了透明十六进制颜色在前置厂商声明之后丢失兼容回退的问题，但此前仅更新了 Taro Vite 两个 demo。Webpack React/Vue3 也消费同一 PostCSS 管线，其 NutUI 渐变及颜色从透明十六进制改为 `rgba()` 符合目标浏览器兼容要求。限定这两个 demo 重生成普通 static 和生成器比较入口；React/Vue3 总字节数分别增加 48/182，选择器集合与其他能力指标不变，Web 产物无差异。

`ba5605893a` 将 uni-app x 自动局部规则从模板首次出现顺序改为确切 Tailwind 来源的生成顺序。Issue 1160 的宽度规则移到 style/color 之前，`border-style` 和 `border-color` 不重置宽度，变量仍取同一节点最终的 solid/dashed/none；覆盖案例中的 `border-width:2px` 仍先于 `border-top-width:0px`。保留声明数组真实顺序，增加长短写覆盖顺序和 dashed/none 的明确断言，不用排序抹平级联证据。Issue 1164 只有 CSS 遍历带来的对象键插入顺序变化，全部属性值保持一致。

本次不再修改产品算法，也不新增发布 intent；对应公开行为已由上述提交的中文 intent 和持久单测覆盖。

## 验证

- `CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_PROJECT_FILTER='^taro-webpack-(react|vue3)-tailwindcss-v4$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/apps-generator-mode-compare.test.ts e2e/taro-webpack-react-tailwindcss-v4.test.ts e2e/taro-webpack-vue3-tailwindcss-v4.test.ts -u`：3 文件、25 项通过，重生成 58 份基线，审查后仅 9 文件有内容变化。
- `CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_PROJECT_FILTER='^uni-app-x-vdom-tailwindcss-v4$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1160-static.test.ts e2e/issue-1164-static.test.ts -u`：2 项通过、2 项既有设备入口跳过，仅更新两个 H5 JSON 基线。
- 禁止更新模式使用同样五个入口及 `E2E_PROJECT_FILTER='^(taro-webpack-(react|vue3)|uni-app-x-vdom)-tailwindcss-v4$'`：5 文件、27 项通过、2 项既有设备入口跳过，147.30 秒；结果保存在 `.tmp/static-output-followup-verify.log`。
- 修改的测试通过 ESLint，全部差异通过 `git diff --check`；独立只读审查确认更新范围及层叠语义。

## 适用边界

此次验证是限定 demo 的静态编译与产物验收，不代表微信 IDE、Alpha 原生 HMR、真实设备或最终 46 阶段已通过。Issue 1164 的 Harmony 和微信可选入口在此次定向 static 中没有执行。

## 规则评估

不新增 AGENTS。既有规则已要求受影响项目重生成基线；此次纠正的是消费入口覆盖遗漏。后续按共享管线的所有消费者核对入口，保留实际 CSS 顺序和语义断言，不将快照格式化当作兼容修复。
