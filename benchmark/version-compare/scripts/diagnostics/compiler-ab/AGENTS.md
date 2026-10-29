# 编译器配套 A/B 诊断规则

<!-- agents:cwd=root -->

## 适用范围

- 本目录、独立 `taro-webpack-compiler-diagnostic.yml` 入口及本轮创建的无 Git 元数据副本。

## 核心职责

- 固定 Linux / Node 22.23.4，通过三个完整冷构建样本，判断当前 Taro 4.3.1 下的 Webpack 编译器配套差异。
- 保留准确源码 SHA、准确基线、工具生成锁、原补丁、真实模块身份、逐资产和阶段证据。

## 变更原则

- 编译器、workspace、补丁和锁的实验性变更只允许写入本轮拥有且不含 `.git` 的临时副本，不能写源 checkout 或借用其它任务的依赖目录。
- 原当前锁保持完整 SHA；只允许 Webpack 本身与实际变化的直接配套之依赖闭包变化，peer key 传播必须单列，其它依赖漂移立即失败。
- 固定源码、Taro、压缩配置、完整编译工作量和原预算；不得主动请求 GC、关闭压缩或更改正式升级目标。
- 此实验仅供因果诊断，不能替代正式性能门禁、全端预检或真实平台验收，check 名称及并发组必须独立。
- 所有子命令必须有截止、定向终止及独立 close/reap 确认；未确认停止时保留临时副本，记录首错与清理错。

## 测试要求

- 覆盖锁轴、隔离保护、实际 preload 生命周期、worker、完整资产 hash、被动观测与失败/清理路径。
- 定向 fixture 不运行真实框架构建，不安装或操作其它任务的 checkout。

## 推荐验证命令

- `node --test benchmark/version-compare/scripts/diagnostics/compiler-ab/test.mjs`
- `pnpm agents:check`
- `git diff --check`

## 提交前检查

- 确认未修改正式依赖、预算、产品代码、demo 或 static 基线。
- 确认 workflow 仅由 `workflow_dispatch` 触发，artifact 保留原锁 SHA、新锁、补丁、差异轴和首败证据。
- 确认没有将诊断成功描述为正式验收通过。
