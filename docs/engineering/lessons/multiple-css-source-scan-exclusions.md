---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/commit/4ca235ff7aa54bf12c619a88aded8edd949361e9
baseline: 4ca235ff7aa54bf12c619a88aded8edd949361e9
regressions:
  - packages/weapp-tailwindcss/test/tailwindcss/v4-scan-source-boundaries.test.ts
  - e2e/apps-generator-mode-compare.test.ts
---

# 多 CSS 入口的默认扫描排除边界

## 症状

Taro Webpack React H5 构建偶发多出 `.container` 的宽度和断点声明，CSS 增加 375 字节、一个 selector。相同源码存在成功和失败结果，添加诊断会改变触发时序，不能以偶然重试通过收尾。

## 根因与纠正

原生生成 session 的输入追踪显示：不同 CSS loader 首先登记时，全局源码的 base 分别为主样式目录和嵌套页面目录。扫描器会解析各依赖的 `@source`，但默认排除仅绑定聚合源码的 base。兄弟目录中的 `tailwind.config.*.js` 因而可能漏过排除，配置里的 `container: false` 被原始候选提取器识别为有效候选，随后进入主样式生成。

修复位于扫描层：保留原来的默认排除范围，并对每个解析后的正向扫描根应用相同规则。扫描根来自 CSS/source 元数据，不依赖 demo 目录或类名。真实页面中的 container 不受影响；也覆盖显式引用项目外部兄弟目录的场景。

## 验证

- `CI=1 pnpm exec vitest run --project=weapp-tailwindcss packages/weapp-tailwindcss/test/tailwindcss/v4-scan-source-boundaries.test.ts --update=none`：修复前 3 failed；两种入口顺序和外部扫描根均能稳定复现。
- 新测试与 `v4-engine`、`v4-import-paths`、`source-scan` 测试集：97 passed，保留既有路径身份回归。
- `pnpm --filter weapp-tailwindcss build`：通过。
- 完整 20 组 generator 的 CSS 产物快照通过；修正独立的汇总过时问题后，Taro generator 11 项正常回归通过，未改变 Taro CSS 基线。
- 框架静态与 HMR 验收继续执行，未完成项不计为通过。

追踪与原始日志保存在本轮忽略目录 `e2e/reports/local-full-run/2026-09-17-full/`，关键记录为 `container-generation.jsonl`、`taro-generation-trace`、`source-scan-boundary-red`、`source-scan-boundary-green-2`。

## 适用边界

验证版本为 Tailwind CSS 4.3.3、@tailwindcss-mangle/engine 0.2.0。修复保证默认排除覆盖各扫描根；不改变用户正向/反向 source 语义，不按 container 名称过滤候选，不将未完成的浏览器或设备验证计为通过。

## 规则评估

不新增规则。通过确定性入口顺序回归和真实构建证据落实已有扫描边界要求。
