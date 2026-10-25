---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417
regressions:
  - packages/weapp-tailwindcss/test/context/generation-snapshot-reuse.test.ts
  - packages/weapp-tailwindcss/test/compiler/compilation-profile-cache.test.ts
  - packages/weapp-tailwindcss/test/compiler/configuration-snapshot.test.ts
  - packages/weapp-tailwindcss/test/compiler/shadow-configuration-revision.test.ts
  - packages/weapp-tailwindcss/test/ci/framework-boundaries.test.ts
---

# 编译请求配置快照的复用与关闭边界

## 症状

PR #1316 的 [CI run 40205225957](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40205225957) 中，Webpack `processAssets` 三个样本的中位耗时从 3125ms 增至 3285ms，超过既有预算。CSS 任务等待阶段的中位增量为 147.895ms；这是定位方向，尚不能确定具体函数的因果贡献。

在 `67eb89e296fd6448d3fbf9f40729c72017163b6c` 上新增真实兼容桥回归，先观察到两类冗余：

- 真实 Webpack 请求投影让 `cssSources` 与两类样式选项共享来源；兼容桥各自创建复制记录，使同一来源的 getter 被读取三次。
- 配置、owner 和阶段覆盖未变化时，兼容桥仍重新解析生成配置并创建另一份内容相同的冻结 profile。

同时发现配置版本漏项：显式 `uniAppXCssTarget` 更新后，profile 内容改变，revision 却未改变，旧异步请求仍被视为有效。

## 根因与纠正

单次请求的复制记录应属于该请求。兼容桥统一传递一个 `WeakMap`，使来源、编译投影、样式选项与运行时选项共享对应的只读副本；下一次请求使用新的复制记录。候选集合继续逐请求复制，用户来源与配置对象不被冻结。

配置缓存按编译 owner 持有，单个 owner 只保留最近一个只读 profile。每次仍计算结构指纹，以识别原位修改；有效平台、原生样式与样式目标覆盖单独匹配，阶段覆盖来回切换不推进配置版本。真实配置 A→B→A 的 revision 单调递增，旧请求不会重新有效。

指纹补齐实际 profile 输入，包括框架配置、有效平台、Tailwind 主版本、显式样式目标与原生诊断策略。回调按函数身份区分。profile 模式还区分不透明插件与实例身份，避免同函数、同枚举属性的不同插件被错误复用；通用 context 缓存的默认比较方式不变。

缓存属于中立的 compiler 模块，由已有 `disposeCompilerOwner` 协调者在已接收任务排空后显式删除。前序清理失败仍继续删除，旧 `isCurrent` 随之失效；关闭中的外部请求及已关闭 owner 均不能重新缓存。版本查询函数只捕获 owner 和 revision，不捕获配置工厂或 profile。

Vite、Webpack 和 Gulp 的生成兼容桥都使用各自 runtime owner，并通过同一关闭入口清理。直接兼容解析的默认 context owner 同样受此边界保护。公开 Core 的解析后编译实现不经过该兼容 profile 缓存。

## 验证

环境为 macOS arm64、Node 24.18.0、pnpm 12.14.0；基于 `67eb89e296fd6448d3fbf9f40729c72017163b6c` 加本文对应修复，在独立 worktree 验证。

- 修改生产代码前，新增七项快照与配置回归全部失败，包含来源 getter 读取三次、相同配置生成不同 profile 和显式样式目标不推进 revision。修复后同组通过，再补充插件身份、配置往返、平台、框架与主版本更新回归。
- 定向配置、生成、session、Webpack 请求和边界集合：16 个文件、329 项通过，使用 `CI=1 pnpm --config.verifyDepsBeforeRun=false exec vitest run ... --update=none --maxWorkers=1`。
- 后续新增默认 owner 关闭回归，并复验 Vite、Webpack、Gulp 生命周期：5 个文件、28 项通过，其中包含配置缓存的四项复验；不是与上一集合互斥的统计。
- `compilation-profile-retention.mjs` 通过独立 Node `--expose-gc --import tsx` 运行：先确认活动 profile 持有回调和 provider，再关闭 owner。即使宿主继续持有 owner 与旧版本查询函数，两者仍被回收。
- `pnpm architecture:check`：37 个包、1534 个源码文件通过，无新增边界例外。本次 pnpm 调用额外设置 `--config.verifyDepsBeforeRun=false`，避免临时依赖链接触发自动安装。
- 改动的源码、测试及 fixture 使用 `eslint --no-ignore --max-warnings=0` 通过；没有运行自动修复或 Prettier。
- 主包 `tsc -p tsconfig.typecheck.json --pretty false` 通过。新 worktree 最初缺少两个依赖包的发布声明，仅复用同一父工作树已有的 `tailwindcss-config/dist` 与 `weapp-style-injector/dist` 后完成检查，没有启动包构建。这不能替代最终集成后的构建与类型验收。

## 适用边界

本次证明减少了重复的对象遍历与配置快照创建，尚未证明消除了 CI 的 160ms 增量，也未验证 Vite 的 RSS 回归。

已核对的 Taro Webpack authored 来源包括 `app.css` 3341 字节、普通分包样式 128 字节、独立分包样式 133 字节及 issue-998 样式 187 字节。字符串是原始值，复制配置不会逐字节复制 CSS；这些源码大小也不能代表展开第三方样式后的完整请求规模。正式性能结论仍需要相同源码、参数、预算和输入证据下的真实框架 benchmark。

未调整性能阈值、采样数量、demo、static 基线、包名、公开配置或会话隔离方式。完整设备验收、包构建和当前 PR head 的正式性能门禁由主任务继续完成，因此记录保持 `partial`。

## 规则评估

不新增规则。现有的配置与会话分离、先复现后修复、明确资源所有权和不得凭重跑放行的约束已覆盖本问题；通过持久回归与关闭后的回收证据约束实现。
