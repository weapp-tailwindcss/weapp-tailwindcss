---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/commit/4488cabc93782100b856dfd434a1fb21c3daa407
baseline: 4488cabc93782100b856dfd434a1fb21c3daa407
regressions:
  - e2e/gulp-build.test.ts
  - e2e/gulp-tailwindcss-v4.test.ts
  - e2e/starter-build-smoke.test.ts
  - benchmark/performance/demo/test/config-loader.test.mjs
  - benchmark/performance/demo/test/evidence.test.mjs
---

# Gulp TypeScript 入口的 ESM 加载边界

## 症状

依赖升级后，根构建在 Gulp demo 的 `styleCompile` 或 starter 的 `compileStyles` 阶段失败。普通输出可能只有 `Did you forget to signal async completion?`，开启调试后可见 `TypeError: import_postcss_private_rule.Transpiler is not a constructor`。

## 根因与纠正

`postcss-preset-env` 11.5.5 引入的 mixins 插件从 ESM private-rule 插件导入 `Transpiler`，后者同时通过 `module.exports` 导出插件函数。Gulp CLI 优先 `require()` 任务文件，全量 `tsx` hook 把依赖图转成 CJS，内部命名导入因而落到只导出函数的 CJS 接口。原生 ESM 的同一处理通过，Sass 和生成管线不是这次错误的来源。

两个 Gulp 项目改用 `.mjs` 异步入口加载 `.mts` 任务，仅注册 `tsx/esm`。入口的顶层 await 使 Gulp CLI 回退到原生 import，TypeScript 任务及 ESM 依赖保留正确的模块图。PostCSS 配置仍按原来的 CJS 约定加载。同步更新性能配置扫描，保证重命名后仍捕获 Gulp 插件选项。

主工作区另有一次 Mpx 错误：`The 'compilation' argument must be an instance of Compilation`。日志显示同版本 Webpack 分别来自 SWC 1.16.2、1.16.13 两个安装实例，干净 frozen install 中没有复现；这是旧依赖链接状态，不能用修改 Gulp 或放宽 Webpack 类型检查修复。

## 验证

环境为 macOS arm64、Node 24.18.0、pnpm 12.6.0。

- 新增 Gulp 真实构建回归在原入口失败，修复后通过，覆盖样式生成及后续脚本任务完成。
- `pnpm build`：69 个任务成功，其中 59 个缓存命中；交互式 Taro/uni-app 跳过行为沿用根脚本。
- `CI=1 pnpm e2e:static:u e2e/gulp-tailwindcss-v4.test.ts` 重建 Gulp static 基线，无文件差异；随后执行不更新基线的同项目回归。
- `CI=1 pnpm e2e:demo:matrix gulp-tailwindcss-v4:weapp gulp-tailwindcss-v4:tt --update --build-only` 重建微信与抖音基线，无文件差异；去掉更新参数后的两目标 production、initial、replace、add、restore 均通过。
- `CI=1 E2E_STARTER_CASE="^gulp " pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/starter-build-smoke.test.ts --update=none`：3 项通过。
- `CI=1 pnpm exec vitest run -c benchmark/performance/demo/vitest.config.mjs benchmark/performance/demo/test/config-loader.test.mjs benchmark/performance/demo/test/evidence.test.mjs --update=none`：20 项通过。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/v5/apps-demo-generator-config.test.ts --update=none`：10 项通过。

## 适用边界

这是 Gulp 示例加载器和构建产物验证，不代表 IDE、真机或全端环境验收。首次独立工作树构建还遇到一次 escape 缓存命中但产物缺失，无缓存构建后恢复；没有足够证据修改 Turbo 配置。构建日志保留在本次任务的工作树附件目录。

变更仅涉及私有示例、starter、测试及性能配置发现，不改变公开包行为，不新增发布 intent。

## 规则评估

沿用模块边界、根因回归和 static 基线规则，不新增 AGENTS 条目。不得以关闭 mixins 功能、吞掉流错误或全局回退依赖掩盖加载器问题。
