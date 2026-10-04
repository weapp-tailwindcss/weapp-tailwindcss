# Repository Guidelines

## 适用范围与优先级
- 本文件维护仓库级安全边界和入口；领域细节放在就近规则，任务闭环见 [工程流程](docs/engineering/agent-workflow.md)。
- 领域规则由就近 `AGENTS.md` 补充；不得削弱上级安全边界。规则相互矛盾时先说明冲突并暂停相关写入，不自行选择较宽松解释。
- 开始改动前，先确认目标目录是否有更近一级 `AGENTS.md`。
- 执行任何任务前必须先做“最近规则检查”：从当前目录向上查找最近的 `AGENTS.md` 并先读取，再开始修改或执行命令。

## 全局硬规则
- 统一使用 `pnpm`，禁止切换 npm/yarn；Node 与 pnpm 版本以根 `package.json` 的 `engines` / `packageManager` 为准。
- 代码默认 TypeScript + ESM，缩进 2 空格。
- 文件超过约 300 行优先按目录拆分（如 `feature/a.ts`），避免 `feature.a.ts`。
- 测试默认 Vitest；修复缺陷或改行为必须补回归测试。
- AI 启动本地全面测试（包括手动编排全仓验收）前，必须完成本轮环境预检：微信 IDE、HBuilderX、iOS/Android/Harmony 模拟器、Web 和当前会话 computer use 全部通过。失败、超时、缺证或状态不明立即阻断并在当前对话通知用户；不得用 skip、optional、旧报告或降级替代放行。入口为 `pnpm e2e:preflight prepare`，操作与恢复统一见 [多端手册](e2e/LOCAL-MULTI-PLATFORM-E2E.md)。定向单测、预检回归及普通 CI 不要求全端环境。
- 验证默认优先本地完成：凡是能通过本地 `pnpm`/Vitest/e2e/构建命令确认的问题，必须先在本地验证并记录命令；只有用户明确要求“PR CI/CD 验证”“盯 CI/CD”或远端环境是唯一可验证来源时，才长时间等待远端 CI/CD。
- 新增或调整 demo、issue 复现页、样式输出回归用例时，必须重新生成对应项目的 e2e static 快照/产物基线，并在验证记录中说明对应项目与命令；禁止只改源码或 IDE 用例而遗漏 static 基线。
- 本项目禁止使用 Prettier 做格式化；不要运行 `prettier`、`pnpm format` 或其它会调用 Prettier 的格式化命令。
- 提交信息遵循 Conventional Commits。
- PR、提交信息和变更说明默认只使用 `Refs #<issue>`、`Related to #<issue>` 或普通链接关联 Issue；禁止默认使用 `Fixes`、`Closes`、`Resolves` 等关闭关键词，也不要在 GitHub `Development` 侧栏建立会随 PR 合并关闭 Issue 的关联。只有用户明确要求关闭对应 Issue 时才允许使用关闭型关联。
- 所有新增或修改的 change intent 内容必须使用中文。
- JSDoc 注释必须使用中文；新增行内注释默认中文（术语可保留英文）。
- Node.js、构建器、CLI、测试与脚本默认必须同时支持 Windows、macOS 和 Linux，不得把 POSIX 路径、分隔符、盘符、大小写或 shell 行为当作跨平台默认值。
- 文件系统路径统一优先使用 `node:path` 的 `resolve`、`join`、`relative`、`normalize` 等 API，以及 `fileURLToPath` / `pathToFileURL` 处理 URL 转换；禁止通过字符串拼接、固定 `/`、`split('/')` 或单次替换反斜杠来实现通用文件系统路径逻辑。临时目录使用 `os.tmpdir()` / `mkdtemp`，禁止硬编码 `/tmp`。
- 必须区分文件系统路径与 bundler module id、bundle asset name、URL/route 等逻辑路径：只有后者可在明确边界统一为 `/`；不得把规范化后的 module id 或 URL 直接当作文件系统路径。涉及路径解析、缓存 key、模块身份或产物归属的改动，至少覆盖 POSIX、Windows 反斜杠、盘符/根目录与相对路径回归用例。
- Tailwind CSS v3/v4 的样式生成统一由 `weapp-tailwindcss` 接管；禁止通过 `tailwindcss@3` PostCSS 插件、`@tailwindcss/postcss` 或 `@tailwindcss/vite` 生成样式。
- HBuilderX / uni-app x 链路必须避免引入会被 CJS 同步 `require()` 的 Tailwind 纯 ESM 官方插件依赖；Tailwind v4 相关能力应继续经 `weapp-tailwindcss/vite`、`@weapp-tailwindcss/engine` 的动态加载链路接入，禁止用 `@tailwindcss/vite` 等 ESM-only 插件替代或兜底。
- 构建插件禁止用 `fs` 直接写入或改写构建输出目录；输出变更必须通过对应 bundler 的插件 API、bundle asset、`emitFile`、loader result 或 stream/file 对象完成，确保产物仍在同一个构建图里。
- 修复构建器问题时必须从 bundler 的生命周期、模块图、产物图与 loader/plugin API 出发；禁止通过硬编码 `src`、`pages` 等项目布局推导源码路径，也禁止在 `generateBundle` 等后置阶段为了弥补状态缺失临时读取源码文件。需要源码内容时，应在 `load`、`transform`、`watchChange`、`handleHotUpdate` 等生命周期缓存，或使用 `ModuleInfo`、chunk metadata、loader result、source map、source-candidates 等构建图数据；确需文件系统扫描的入口发现逻辑必须集中在扫描层，并有回归测试覆盖。
- `submodules/tailwindcss-mangle/` 只允许作为本地源码参考目录，不得加入 `pnpm-workspace.yaml`、`pnpm-lock.yaml`、CI/CD checkout、发布流程或仓库 submodule 追踪；需要 `tailwindcss-patch` 的测试与示例必须消费 npm 发布版。

## 多 Codex / 多代理协作
- 同一个物理 checkout 只允许一个 Codex/代理执行写入型任务；多个 Codex 并发处理不同任务时，必须先为每个任务创建独立 `git worktree`。
- 推荐目录形态：在仓库同级目录创建工作树，例如 `../weapp-tailwindcss-codex/<task-slug>`；不要把并发工作树放进当前仓库目录内部。
- 每个并发任务使用独立分支名，例如 `codex/<task-slug>`；开始前先执行 `git status --short --branch`，确认当前工作树没有其他代理遗留改动。
- 在任何编辑、格式化、测试自动修复、`git add`、`git commit`、`git rebase` 或 `git push` 前，都要重新检查 `git status --short`；如果出现自己没有产生的改动，必须停止并说明冲突来源，不得覆盖、删除或顺手纳入提交。
- 提交并推送后，除非用户明确要求等待 PR CI/CD，否则只需报告已完成的本地验证和推送状态；不要因为远端 CI/CD 较慢而默认阻塞当前任务。
- 禁止在共享 checkout 中用 `git restore`、`git checkout -- <file>`、批量格式化、代码生成或清理命令处理自己不拥有的文件；确需清理时，先确认文件归属。
- 提交前只暂存当前任务拥有的文件；除非用户明确要求“提交所有代码”，否则禁止用 `git add -A` 混入其他代理或用户的改动。

## 仓库常用命令
- `pnpm install --frozen-lockfile`
- `pnpm build`
- `pnpm build:pkgs`
- `pnpm build:docs`
- `pnpm test`
- `pnpm test:core`
- `pnpm test:plugins`
- `pnpm e2e`
- `pnpm run:watch`
- `pnpm agents:check`

## 多端运行

- 普通 uni-app Vite 按 demo 脚本运行；uni-app x 与 HBuilderX 模板优先使用 HBuilderX 链路。CLI 证据不能替代 IDE 或设备证据。
- 平台输出、切换设备、进程归属、WebView 版本、safe class 与截图验收统一遵循 [本地多端手册](e2e/LOCAL-MULTI-PLATFORM-E2E.md)，不要把单机经验复制到根规则。

## 目录规则路由

- `packages/**`：[packages 规则](packages/AGENTS.md)
- `packages-native/**`：[packages-native 规则](packages-native/AGENTS.md)
- `packages-runtime/**`：[packages-runtime 规则](packages-runtime/AGENTS.md)
- `apps/**`：[apps 规则](apps/AGENTS.md)
- `demo/**`：[demo 规则](demo/AGENTS.md)
- `website/**`：[website 规则](website/AGENTS.md)
- `e2e/**`：[e2e 规则](e2e/AGENTS.md)
- `scripts/**`：[scripts 规则](scripts/AGENTS.md)
- `tools/**`：[tools 规则](tools/AGENTS.md)
- `examples/**`：[examples 规则](examples/AGENTS.md)
- `starter/**`：[starter 规则](starter/AGENTS.md)
- 全部层级见 [规则索引](docs/engineering/agent-index.md)；进入目录后继续查找更近一级规则。

## 本地多端 E2E 入口
- H5、微信小程序、Android、iOS、Harmony 的本地 E2E、HBuilderX、设备环境、截图、HMR、结构探针和阻塞记录统一遵循 [`e2e/LOCAL-MULTI-PLATFORM-E2E.md`](e2e/LOCAL-MULTI-PLATFORM-E2E.md)。换电脑时只重新配置工具链和设备 ID，不在规则文件或测试中写入本机绝对路径。
- 当前会话的 Chrome computer use 默认使用原生应用控制入口；入口选择、证据和失败恢复统一见上述手册的“当前会话的 computer use 证据”，不得以专用浏览器认证作为原生入口的前置条件。

## 关键约束索引
- `packages/weapp-tailwindcss` 的 JS 转译必须遵循 `classNameSet` 精确命中原则，禁止启发式兜底转译。
- `packages/weapp-tailwindcss` 的 bundler 适配不得依赖硬编码目录或后置 `fs.readFile` 兜底来还原源码关系；源码关系必须来自构建图、插件生命周期缓存或明确的扫描层。
- `packages/weapp-tailwindcss` 的样式注入、preflight、Tailwind 入口选择和分包样式隔离不得依赖硬编码文件名或输出路径片段；必须来自 CSS 内容、用户显式配置、构建图、loader/transform 阶段缓存或 source-candidates 元数据。
- 通用 CSS 语法解析、tokenize、selector/value parser、AST 变换和平台兼容 PostCSS 管线实现在 `packages/postcss`；`packages/engine` 仅允许实现 Tailwind CSS 4 生成必需的 CSS 解析、`@source` 处理、选择器别名转换和产物 AST，不承担平台兼容转换；`packages/weapp-tailwindcss` 禁止直接依赖 `postcss-scss`、`@csstools/*`、`postcss-selector-parser`、`postcss-value-parser`、`lightningcss` 或 `postcss`，必须通过 `@weapp-tailwindcss/postcss` 消费。
- demo、Web/H5、watch 与 e2e 场景都必须遵守 Tailwind CSS 由 `weapp-tailwindcss` 生成的约束，不能为修复样式或 HMR 问题注册官方 Tailwind 生成插件。
- 运行时封装（`packages-runtime/*`）改动需重点关注 escape/unescape、merge 兼容和缓存边界。
- Release 工作流发布 npm 必须使用 trusted publishing/OIDC：发布 job 使用 Node 24 以满足 npm CLI 的 OIDC 支持要求，保留 `permissions.id-token: write` 与 provenance，禁止在发布步骤注入 `NPM_TOKEN` 或 `NODE_AUTH_TOKEN`。
- 包的 change intent、版本、预发布、npm publish、tag、GitHub Release 与失败恢复统一由 repoctl 编排；使用 `pnpm release`、`pnpm version-packages`、`pnpm publish-packages` 和 `pnpm release:pre`，不要恢复 Changesets CLI/action。
- `release/pnpm-version` 是推送 `main` 后由发布工作流重新生成的分支，禁止直接向该分支手工提交或推送修复。发布 PR 的代码、CI/CD 和规范修复必须先落到 `main`，再由工作流重新生成发布分支，并以重新生成后的 PR head 验证；不得把生成分支上的临时成功当作修复已持久交付。

## 新增 AGENTS 触发条件
- 目录具备独立发布或独立 `build/test` 流程。
- 存在高风险链路（转译、编译、代码生成、批量写文件）。
- 目录职责明显不同于父目录通用规则。

## 子目录 AGENTS 最小模板
- `适用范围`
- `核心职责`
- `变更原则`
- `测试要求`
- `推荐验证命令`
- `提交前检查`

## 补充
- 首次克隆后执行 `pnpm prepare` 初始化 Husky。
- 文档站发布前需配置 `website/.env.local` 并执行 `pnpm build:docs`。
