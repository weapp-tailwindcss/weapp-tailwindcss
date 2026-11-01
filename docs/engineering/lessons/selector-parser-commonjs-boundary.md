---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: d0bff4f07b65b9a4f54b5dce3109ce11a659dde4
regressions:
  - packages/postcss/test/selector-parser-bundle.test.ts
  - packages/postcss/test/selector-parent-chain.test.ts
---

# 选择器 parser 的类型守卫必须遵守真实模块边界

## 症状

PR 的模板 smoke、macOS 启动 smoke 和九个跨平台 watch 检查，在构建 UI 包时加载 PostCSS ESM 产物失败。Node 22/24 拒绝 `postcss-selector-parser` 的 `isContainer` 命名导出，尚未进入各自的框架或 watch 断言。

## 根因与纠正

先前选择器修复引入两处运行时命名导入。`postcss-selector-parser` 7.1.7 的类型声明使用 `export = parser`，CommonJS 入口通过 `Object.assign(parser, selectors)` 挂载守卫，再将函数赋给 `module.exports`。属性在运行时存在，但 Node 的 CommonJS 静态命名导出分析无法识别这种挂载方式。

源码测试经 Vite 转换后可以访问这些属性，tsdown 成功生成外部命名导入也不能证明 Node 能加载产物。仅检查产物文件、source map 或另一个未包含选择器代码的入口，会遗漏此错误。

两处均改为从默认导出的 parser 函数对象调用原守卫，保留 `import type`、类型谓词、遍历和选择器输出。继续将该依赖置于原有外部边界，不改成强制打包，也不读取依赖内部文件、增加平台条件或修改依赖源码。

## 验证

本工作树独立依赖、Node 24.22.1/pnpm 12.15.0：

- 新回归用正常 tsdown 配置分别构建全新的公开 `transform` 入口，再交给独立 Node 进程加载。修复前 ESM 项准确复现同一 `SyntaxError`，CJS 产物经 Node import 加载的对照通过。
- 修复后 `pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/selector-parser-bundle.test.ts test/selector-parent-chain.test.ts test/selectorParser.test.ts test/rolldown-build-contract.test.ts test/color-parser-bundle.test.ts --update=none --coverage.enabled=false`：5文件51项通过。产物回归实际转换嵌套不支持伪类、RTL 和嵌套 where 分支，并断言精确选择器。
- 三个修改的 TypeScript 文件显式 ESLint 通过。PostCSS 的 bundle/声明构建和实际消费者 `pnpm --filter @weapp-tailwindcss/ui build` 均通过；既有 mixed-exports 提示和包内 noCheck 边界保留。
- 临时产物只连接本包声明的本工作树运行依赖，不执行安装，不借用其他工作树；在 `finally` 中删除临时目录及链接。

## 适用边界

本地只实际运行 Node 24 宿主。Node 22、Windows、Linux 与各远端矩阵须由新提交的正常 CI 重新验证，不能用旧 head 的成功替代。此修复不证明各 watch 场景已运行，也不解决作者阶段受保护接口、正式 RSS 性能失败和本地全面验收阻塞。

## 规则评估

沿用现有包边界和缺陷回归规则，不新增 AGENTS。模块互操作问题必须包含真实产物的宿主加载与行为验证，不能以源码测试或构建成功代替消费方证据。
