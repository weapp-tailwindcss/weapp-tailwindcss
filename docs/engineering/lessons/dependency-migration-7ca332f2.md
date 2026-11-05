---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/commit/7ca332f2bbada8e6170e4d2a767c28968d95f446
baseline: 7ca332f2bbada8e6170e4d2a767c28968d95f446
regressions:
  - packages-runtime/variants/test/v4.test.ts
  - packages/weapp-tailwindcss/test/js/oxc-parser.test.ts
  - packages/postcss/test/preset-env-contract.test.ts
  - scripts/ci/demo-matrix/nitro-externals.test.mjs
  - scripts/ci/demo-matrix/weapp-vite-runtime-contract.test.mjs
  - scripts/ci/demo-matrix/weapp-vite-engine-compat.test.mjs
  - scripts/ci/demo-matrix/framework-eslint.test.mjs
---

# 7ca332f2 依赖升级的配套迁移

## 症状

依赖声明与锁文件升级后，variants v4 的配置类型、空输入语义没有迁移；Vitest 主包与 UI/coverage 不同版；Taro 的 legacy ESLint 被升级到不兼容的 10；weapp-vite 的精确补充依赖还绑定旧版。preset-env 和 Nitro 的精确补丁也没有跟随版本升级，前者使严格类型回归失败，后者直接触发 `ERR_PNPM_UNUSED_PATCH`。

真实 OXC 回归另外发现 0.157.0 的 raw transfer 将默认导入再导出的合成 `default` 名字还原为七个空字节。立即读取就能复现，无需异步或第二次解析；普通 AST 结果正常。原有完整解析协议断言保留，不能删掉模块元数据比较。

## 根因与纠正

- variants 使用上游 custom 配置类型保留 `twMergeConfig`，函数式 merger 经过已有 unescape、rpx prepare/restore 与 escape 流程，最终不再追加默认 merge。空输入和公开返回类型跟随 v4 为字符串，保留延迟 `cn(...)()`。
- 按用户确认，`cn@0.5.2` 的 Node 支持收窄为 `>=22.12.0`；cn 与 variants 的兼容性变化使用 minor intent。
- Vitest 配套统一为 5.1.0，OXC parser/types 统一为 0.157.0；Taro 专属 ESLint 保留 8.57.1。weapp-vite 7.8.0 的 devframe/agentic 对齐为 1.3.0，保留生命周期、拆包、source map 和关闭租约的行为断言。
- preset-env 11.6.2 仍遗漏 `autoprefixer: false` 类型，因此迁移原最小声明补丁。Nitro 2.13.6 的 RegExp/function inline matcher 仍直接收到反斜杠 module ID，因此迁移规范化补丁并增加跨平台交叉回归。Nuxt 4.6.4 默认 matcher 自行规范化输入，不把它误写成本补丁才能恢复的默认 SSR 故障。
- raw transfer 的模块记录含合成字符串，不满足完整传输协议；适配器发现结构化 `module.hasModuleSyntax` 后使用普通解析的完整结果。无模块语法脚本继续使用 raw；不猜测源码、修造导出名或按版本硬编码补丁。

## 验证

本轮预检发现首次命令实际使用 Node 24.18.0，未满足仓库要求；已在任务环境切换 Node 24.22.1，并重新完成下列安装、构建、单测和类型检查。最终验证环境为 macOS arm64、Node 24.22.1、pnpm 12.15.0；测试源码为 `a8669dcb638ae206b37adf8e868cc025b8047c01` 加本工作区未提交迁移，依赖独立安装，未借用其他 worktree 的 node_modules。

- `pnpm install --frozen-lockfile` 通过；后续补充 variants 测试所需的 escape workspace 开发依赖后，再次由 pnpm 生成锁文件。
- cn：7 项通过；variants：35 项通过；UI：62 项通过；三包 build/tsd 通过。UI 首轮与 engine 测试自带的 dist 重建冲突，顺序复验全部通过。
- preset-env 真实类型及插件、前缀、gradient、v4 定向回归：4 文件 55 项通过。
- Taro ESLint、weapp-vite 发行包契约和关闭租约、Nitro resolver：5 文件 44 项通过。
- OXC parser/契约/fast path、构建配置与 Tailwind helper：5 文件 81 项通过。已有真实大型模块用例修复前失败，修复后完整 program/module/comments/errors 对照通过。
- engine：24 文件 211 项通过，`typecheck` 通过。主包及依赖图的定向构建通过。
- 最终定向 ESLint、`pnpm agents:check`、`git diff --check`、`pnpm release status` 通过；cn、variants 的计划版本分别为 0.2.0、0.3.0。cn、variants、UI variants、主包和 Vite 入口的 ESM/CJS 真实加载通过。

### demo 与原生验收阻塞

首次预检 `ee07fb29-ff22-44be-a3f1-c71963d71541` 因 Node 版本、微信 HTTP 服务未启动和 Android 多设备歧义失败。按用户选择绑定 Android 模拟器，切换任务 PATH 到受支持的 Node，以原生应用入口受控启动微信 IDE，保留原登录态。新预检 `27f2aae3-548d-4740-97dc-e05897ee6f76` 的 prepare、原生 Chrome 完整交互与 verify 曾全部通过；临时 Chrome 标签页已关闭。该报告未被全面入口领取，随后按 15 分钟规则过期，不能用于后续放行。

按变动 catalog 的直接消费关系，27 个 demo 对应 106 个 matrix 目标；style-injector-mpx 的 manifest 未命中本次变动 catalog。Vapor demo 没有 CLI matrix case，另外执行已有 HBuilderX 真实链路。静态更新命令为：

```sh
CI=1 DEMO_MATRIX_CASES='<106 个直接消费目标的 JSON 数组>' DEMO_MATRIX_ARTIFACT_DIR=e2e/.artifacts/dependency-migration/static-update pnpm e2e:demo:matrix --update --build-only
```

范围通过 `scripts/ci/demo-matrix/catalog.mjs` 的 `cases.filter(c => c.name !== 'style-injector-mpx')` 确定。32 个目标已完成 production 构建及语义产物验收，没有产生基线差异；26 项记为 build-only，6 项按其 native/webview-build 契约记为 passed。Harmony 阻塞后受控取消正在执行的 Taro Webpack Vue QQ 目标，该项 SIGTERM 属于主动收尾，不归为产品编译回归。完整 106 项未完成，禁止更新的复验及 HMR 尚未启动。标准 11 个 full-static 用例与 12 个专题/聚合消费者也尚未执行，不把 matrix 的局部结果代替它们。

Vapor 首轮 iOS 因 worktree 未构建 `debug-uni-app-x` 入口失败；补齐该包构建后复验。HBuilderX stable 5.34.2026102909 下，iOS 原生重载的 initial/add/replace/delete/restore 全部通过，包含当轮产物、运行时结构与截图标记；这不是保持运行状态的 HMR。Harmony initial 通过，但更新转入 native fallback/reinstalled，严格 HMR 断言失败；清理又因没有按 session 的 native 停止完成证明失败。错误为 `NativeCleanupBlockedError`，session 为 `ccc21830-33da-4c5e-9426-63b795cff8d2`。

原始证据在本 worktree 忽略目录 `e2e/.artifacts/dependency-migration/vapor-rerun.log` 及 `vapor-rerun/uni-app-x-vapor-tailwindcss-v4-harmony-vapor/`。恢复目录 `native-session-ccc21830-33da-4c5e-9426-63b795cff8d2` 保存 `blocked.json`、`project.json`、原始源码字节和哈希。Git common dir 的持久登记保留，原项目源码和本轮 alias 也保留；不得恢复这些文件、清理 alias、删除登记、换报告或重跑绕过停止边界。矩阵进程已定向中断且恢复自己的临时源码，临时浏览器已收尾；保留的 HBuilderX 项目用于原生任务恢复，worktree 不能归档。

此失败命中仓库已有的 [Harmony 取消边界](harmony-cancel-alias-boundary.md) 与 [持久原生门禁](native-session-persistent-guard.md)，未证明由本次依赖迁移导致。没有可靠停止证明前停止后续调度；完整 demo/HMR 验证仍阻塞。用户已明确接受按上述已验证范围提交并推送 main，要求保留剩余验收阻塞记录；提交只包含迁移代码、依赖与文档，不包含冻结的原生测试源码或 IDE 配置。

## 适用边界

OXC 的保守回退会使达到 raw 阈值的大型 ESM 多解析一次；无模块语法脚本保留原有优化。退出条件为上游正式版修复合成模块字符串的 raw 传输，并通过完整真实解析协议回归；不能仅凭 `rawTransferSupported()` 返回 true 放行。核对时官方 latest 为 0.157.0，尚无后续正式修复版本。

补丁仅随本仓库冻结安装生效，不随产品 npm 包安装。依赖迁移不等于所有 demo、IDE 或设备验收完成；当前记录保持 partial，分别记录实际执行范围。

## 规则评估

不新增 AGENTS 规则。已有依赖配套、精确补丁、独立安装、完整协议和多端预检规则覆盖本次边界，持久回归补足先前未触发的实际失败。
