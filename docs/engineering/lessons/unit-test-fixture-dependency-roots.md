---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: ebf6e5cc88c8993ebe856544816d2f03ce4447a6
regressions:
  - packages/weapp-tailwindcss/test/shared/mpx.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack-watch-dependencies.test.ts
  - packages/weapp-tailwindcss/test/v5/web-compat-computed-parity.test.ts
---

# 单测 fixture 必须固定依赖所属项目

## 症状

本地完整验证 `aa549630-7813-4401-af18-a00c929cbccc` 在单测阶段失败。其中三项 Mpx 用例从仓库根 `package.json` 解析 `@mpxjs/webpack-plugin`，一项 Web 兼容比较无法从系统临时目录解析 `@iconify/tailwind4`。本记录只处理这四项及排查发现的 Webpack fixture；同轮 React Native 失败由另一任务处理。

独立工作树最初通过 `pnpm exec vitest` 单独运行 Mpx，23 项通过。临时诊断明确仓库入口的 `process.cwd()` 是仓库根，测试的 `import.meta.url` 和 `__dirname` 仍指向 `packages/weapp-tailwindcss/test/shared`。当前 pnpm 生成的 Vitest shim 会设置 `NODE_PATH`，使未声明于仓库根的依赖也可能通过隐式提升位置解析，不能据此认定原失败已消失。

绕过 shim、仍通过同一 pnpm 调用同一 Vitest 后，原 Mpx 三项稳定失败，另 20 项通过。错误栈明确指向仓库根 `package.json`。包目录入口的 Webpack 监听回归还暴露了相反的假设：`path.resolve('demo/...')` 指向包内不存在的示例，导致 `@tarojs/webpack5-runner/package.json` 无法解析。

## 根因与纠正

测试启动目录、被测包目录和示例依赖根是三个独立边界。Mpx 测试现在从测试文件的 `import.meta.url` 分别创建包与真实 Mpx 示例的 `createRequire`，编译器上下文也固定为包目录，保留插件实例一致性、loader alias、normalize 与真实 Webpack 解析断言。

Webpack 监听测试同样从真实 Taro 示例的 manifest 创建解析器，再从该示例实际消费的 runner 解析 `webpack-virtual-modules`，保留真实虚拟文件系统和监听依赖断言。

Web 兼容 fixture 原来仅链接 Tailwind，但 CSS 显式使用两段 Iconify `@plugin`。现在在被测包声明 `@iconify/tailwind4` 开发依赖，沿用仓库已有 `^1.2.3` 和锁定的 `1.2.3(tailwindcss@4.3.3)`，再从测试文件解析其包目录并链接到临时项目的 scoped `node_modules`。Tailwind 与 Iconify 的目录链接在 Windows 使用 junction，其余系统使用目录符号链接；所有文件系统路径均通过 `node:path` 组装。

新增不启动浏览器的生成回归，真实执行原 CSS 中的插件配置并断言两个图标选择器和 SVG 数据。修复前该回归得到与完整轮一致的 `Can't resolve '@iconify/tailwind4'`，修复后通过；原计算样式和像素比较仍完整保留。产品代码、样式语义和 demo static 基线均未修改，不新增公开包 change intent。

锁文件生成曾附带无关 Vite 和 peer 解析变更；已保留原文件其余字节，仅新增该包 importer 的三行依赖记录，并用 frozen 安装校验一致性。

## 验证

环境为 macOS arm64、Node 24.18.0、pnpm 12.9.1、Vitest 5.0.3。修订后验证基于上述完整基线 SHA 加本次未提交修改，不将该基线 SHA 描述为已包含修复。以下命令均不更新快照。

仓库根入口的原始 Mpx 红灯与修复后单文件绿灯：

```bash
CI=1 corepack pnpm exec node node_modules/vitest/vitest.mjs run packages/weapp-tailwindcss/test/shared/mpx.test.ts --update=none --reporter=verbose
```

修复前 3 项失败、20 项通过，修复后 23 项通过。输出分别保留在忽略的 `.codex-tmp/mpx-no-shim-original-red.log` 和 `.codex-tmp/mpx-no-shim-green.log`；临时路径诊断输出保留在 `mpx-root-diagnostic.log`、`mpx-package-diagnostic.log`，诊断代码未提交。

在仓库根分别通过 shim 与直接 Node 入口运行 Mpx 和纯生成回归：

```bash
CI=1 corepack pnpm exec vitest run packages/weapp-tailwindcss/test/shared/mpx.test.ts packages/weapp-tailwindcss/test/v5/web-compat-computed-parity.test.ts --testNamePattern='mpx integration helpers|loads configured CSS plugins' --update=none --reporter=verbose
CI=1 corepack pnpm exec node node_modules/vitest/vitest.mjs run packages/weapp-tailwindcss/test/shared/mpx.test.ts packages/weapp-tailwindcss/test/v5/web-compat-computed-parity.test.ts --testNamePattern='mpx integration helpers|loads configured CSS plugins' --update=none --reporter=verbose
```

两次均为 24 项通过；浏览器比较的一项由名称过滤明确排除，不算已验收。输出保留在 `.codex-tmp/dependency-roots-shim-green.log` 和 `dependency-roots-no-shim-green.log`。纯生成红灯保留在 `css-fixture-no-shim-red.log`。

包目录入口的 Webpack 回归：

```bash
CI=1 corepack pnpm --filter weapp-tailwindcss exec node ../../node_modules/vitest/vitest.mjs run test/bundlers/webpack-watch-dependencies.test.ts --update=none --reporter=verbose
```

修复前套件导入失败，修复后两项通过。输出保留在 `.codex-tmp/webpack-no-shim-package-red.log`、`webpack-no-shim-package-green.log`。

`corepack pnpm install --frozen-lockfile --ignore-scripts --offline` 和三个修改测试文件的 ESLint 检查通过；另执行 `pnpm agents:check` 与 `git diff --check`。本工作树先独立安装依赖并构建测试所需依赖包，没有链接其他工作树的 `node_modules`。

## 适用边界

本次未启动全面测试、浏览器或设备。现有真实浏览器比较和 Webpack 两种启动入口由主任务合入后统一验证；Windows/Linux 未新增实机结果。生成回归通过不能替代计算样式和像素比较，因此本记录状态保持 `partial`。

## 规则评估

不新增 AGENTS 规则。沿用已有的根因复现、显式路径与依赖边界、修复后不更新快照要求，以现有集成用例和新增纯生成回归落实。
