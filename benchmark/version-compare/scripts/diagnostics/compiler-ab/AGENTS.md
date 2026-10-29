# 编译器配套 A/B 诊断规则

<!-- agents:cwd=root -->

## 适用范围

- 本目录、独立 `taro-webpack-compiler-diagnostic.yml` 入口及本轮创建的无 Git 元数据副本。

## 核心职责

- 固定 Linux / Node 22.23.4，通过三个完整冷构建样本，比较当前 Taro 4.3.1 下的 Webpack 编译器及其可选 esbuild peer 上下文。
- 保留准确源码 SHA、准确基线、工具生成锁、原补丁、真实模块身份、逐资产和阶段证据。

## 变更原则

- 编译器、workspace、补丁和锁的实验性变更只允许写入本轮拥有且不含 `.git` 的临时副本，不能写源 checkout 或借用其它任务的依赖目录。
- 原正式锁及完整 SHA 单独归档；两侧使用对称移除准确 Webpack/WDS 可选 CLI peer 后的工具派生锁，不能称 current 仍是原锁。
- 按每个 importer 的实际可达图保留一般 opaque 歧义守卫；只有目标 manifest 与三个准确 Taro parent 路径能传入编译器轴授权。非轴 metadata/绑定保持，所有新增/移除 snapshot 均须有授权路径与 incoming 证据，不可达项保持原样。
- 唯一附加轴为已核实的可选 Webpack/Terser 5.6.1/esbuild 0.21.5 上下文合入 esbuild 0.28.2；完整附着边与路径写入合同。Terser 源码和其它绑定相等，不得全图归一化其它 esbuild。
- 所有 main/child/worker 启用真实加载守卫；webpack-cli 实际加载、Terser 实际消费 esbuild 或守卫缺证均使测量无效。不得 stub 模块、改变加载结果或减去编译工作。
- 固定源码、Taro、压缩配置、完整编译工作量和原预算；不得主动请求 GC、关闭压缩或更改正式升级目标。
- 此实验仅供因果诊断，不能替代正式性能门禁、全端预检或真实平台验收，check 名称及并发组必须独立。
- 所有子命令必须有截止、定向终止及独立 close/reap 确认；未确认停止时保留临时副本，记录首错与清理错。

## 测试要求

- 覆盖锁轴、逐 importer 的 context 分裂与绑定反例、可选配套合同、隔离保护、main/child/worker 加载守卫、完整资产 hash、被动观测与失败/清理路径。
- 定向 fixture 不运行真实框架构建，不安装或操作其它任务的 checkout。

## 推荐验证命令

- `node --test benchmark/version-compare/scripts/diagnostics/compiler-ab/test.mjs`
- `pnpm agents:check`
- `git diff --check`

## 提交前检查

- 确认未修改正式依赖、预算、产品代码、demo 或 static 基线。
- 确认 workflow 仅由 `workflow_dispatch` 触发，artifact 保留原锁 SHA、新锁、补丁、差异轴和首败证据。
- 确认没有将诊断成功描述为正式验收通过。
