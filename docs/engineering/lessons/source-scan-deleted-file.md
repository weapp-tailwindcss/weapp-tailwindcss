---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/35518322135
baseline: 4567969368d712dfcbc10abc7b90c77f347b11d6
regressions:
  - packages/engine/test/v4.generation-scan-race.test.ts
  - packages/weapp-tailwindcss/test/v5/postcss-generator.test.ts
---

# 扫描枚举后的文件删除竞态

## 症状

架构 PR 合并后，Release 的发布前单测失败：PostCSS 默认生成器测试尝试读取其他并行测试正在清理的 demo 临时目录，读取 pages-order/index.css 抛出 ENOENT。本次工作流停在 pnpm run test，未执行 npm 发布。报告为 1 项失败、6052 项通过、43 项跳过。

## 根因与纠正

统一生成扫描先通过 Oxide 枚举文件，再逐个读取内容，两步之间文件可能被删除。generation-request 未处理这段竞态，任一来源消失就会终止整个生成过程。PR 分片单测通过不能证明合并后不同并行调度下不存在竞态。

只在候选文件读取处处理 ENOENT 与 ENOTDIR，不吞掉权限、I/O、候选解析或 CSS 编译错误。已枚举的路径仍进入依赖集合，文件重建后继续参与扫描；本轮缺失来源不贡献候选。删除候选时生成会话已有的编译器重建逻辑清除旧 CSS。

原 generator false 测试没有显式传入该选项，且未指定输入路径，默认扫描工作目录。现显式传入 generator: false，将输入放在独立临时目录，保留默认扫描并在结束时清理，避免该测试读取其他测试的临时项目。

## 验证

Node 24.14.1 下，新增测试先在原实现稳定复现三项失败：枚举后删除文件、删除父目录、将父目录替换为文件。修复后三项与 EACCES/EIO 错误传播共五项通过；同一会话验证旧候选移除、其他候选保留、依赖身份保留，以及文件重建后的新候选和 CSS。

本地验证均使用独立工作树，正常 Vitest 设置 CI=1 和 --update=none：

- pnpm exec turbo run build --filter=weapp-tailwindcss...：11 个任务全部实际执行并通过。
- pnpm --filter @weapp-tailwindcss/engine test --update=none：186 项通过，含生成会话、模块缓存及共享扫描契约。
- 主包同时运行 postcss-generator、cssEntries.integration、tailwindcss-v4-hmr、native-generation-session、source-generation-contract 五个文件：55 项通过，其中包含创建和清理原报错临时项目的集成测试。
- Node 22.23.2 独立运行新增扫描竞态文件：5 项通过。
- engine typecheck、生产源码 ESLint、architecture:check（34 包、1281 源码）、agents:check、release status 与 git diff --check 通过。

未运行发布副作用命令，也未将本地定向测试计为合并后 Release 成功；修复 PR 的远端检查结果在 PR 中记录。

## 适用边界

容错仅限已经枚举出的候选来源文件，不适用于显式 CSS 入口、配置加载或真正的读取故障。不重跑带 npm 发布副作用的旧 Release 工作流。未执行本地全面设备/IDE 验收，定向回归不替代全端预检。

## 规则评估

不新增 AGENTS 规则。现有文件增删重建、先失败后修复和测试隔离要求已覆盖本次问题，以确定性的真实文件系统回归补齐证据。
