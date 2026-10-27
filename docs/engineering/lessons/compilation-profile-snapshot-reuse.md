---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417
regressions:
  - packages/weapp-tailwindcss/test/context/generation-snapshot-reuse.test.ts
  - packages/weapp-tailwindcss/test/context/opaque-configuration-revision.test.ts
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

后续 review 发现，不透明插件的结构投影曾把整个后代子树退回默认指纹模式。同一个插件内部替换具有不同私有字段或 WeakMap 状态、但枚举属性相同的 adapter 时，revision 因而不变。归一化现在只跳过当前对象的重复身份包装，普通记录、数组、Map、Set 与多层不透明实例的所有后代继续保留身份模式。默认通用指纹仍只比较原有可枚举结构。

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
- 后续深层身份回归先在未修改的生产实现上得到 18 项失败、18 项对照通过；失败包含所有中间插件与不透明父实例均不变时的深层 adapter 替换。修复后连同现有快照、通用指纹和关闭回归，5 个文件、67 项通过，覆盖 profile 版本、旧请求失效、默认指纹语义和循环检测。

## 适用边界

本次证明减少了重复的对象遍历与配置快照创建，尚未证明消除了 CI 的 160ms 增量，也未验证 Vite 的 RSS 回归。

已核对的 Taro Webpack authored 来源包括 `app.css` 3341 字节、普通分包样式 128 字节、独立分包样式 133 字节及 issue-998 样式 187 字节。字符串是原始值，复制配置不会逐字节复制 CSS；这些源码大小也不能代表展开第三方样式后的完整请求规模。正式性能结论仍需要相同源码、参数、预算和输入证据下的真实框架 benchmark。

未调整性能阈值、采样数量、demo、static 基线、包名、公开配置或会话隔离方式。完整设备验收、包构建和当前 PR head 的正式性能门禁由主任务继续完成，因此记录保持 `partial`。

## 独立 worktree 的共享依赖事故

2026-10-25 16:12:37.997～16:12:38.104 UTC，排查工作树将父工作树的 `.bin` 与 `.pnpm` 一并符号链接。首次 `pnpm exec` 未关闭 pnpm 12 的自动依赖校验，隐式安装在 `.pnpm` 非真实目录处报错前，已重写共享 shim；这次失败存在写入，不能称为安全失败。

只读核对确认 78 个共享 shim 带入排查工作树的绝对路径，其中根目录 47 个，其余分布在 13 个包目录。`cross-env` 的实际脚本仍解析到父工作树依赖，`packages/build-all` 的 `wetw` 则指向排查工作树尚未构建的 dist。Git 状态无法显示这些 ignored 文件；没有事故前的依赖快照，也不能据元数据时间证明全部依赖内容均未变化。

发现后停止安装与依赖写入，保留排查工作树，并向主任务交付影响范围。主任务在验收安全窗口运行 `pnpm install --offline --frozen-lockfile --force --ignore-scripts` 恢复父工作树入口，45.6 秒完成，5828 个包全部复用、下载为零。恢复后 78 个排查路径引用均消失，`tsx`、`cross-env`、`wetw` 均回到父工作树的相对入口，tracked tree 保持 clean。后续定向命令显式使用 `--config.verifyDepsBeforeRun=false`，不再触发安装或改写依赖。

入口恢复仅证明依赖关系重新建立，不能使事故前后已运行的完整验收自动有效。完整验收结论仍由主任务按实际源码、依赖身份及本轮预检证据另行确认。

## 规则评估

不新增 AGENTS 规则。现有的配置与会话分离、先复现后修复、明确资源所有权和不得凭重跑放行的约束已覆盖代码问题；通过持久回归与关闭后的回收证据约束。依赖事故暴露的是执行遗漏：独立 worktree 不会隔离符号链接指向的写入，共享依赖目标也应计入已有的单 checkout 写入归属。保留具体事实和恢复边界，不以扩大规则代替核对实际解析路径。
