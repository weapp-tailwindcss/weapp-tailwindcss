# Tailwind CSS 4 engine 迁移验证

## 实现与来源

- 工作分支：`codex/migrate-v4-engine`；仓库基线：`2c89c3509ba5ee8d47ab6b4f145f9b6069b5632d`。
- 上游基线：`@tailwindcss-mangle/engine@0.2.0`，npm 发布证明指向提交 `6bf58cebe073a06dfeac7ed44f55ecff50deb763`。
- 新包 `@weapp-tailwindcss/engine@0.1.0` 保留候选提取、位置报告、源码扫描、v4 design system、生成会话、裸任意值与缓存释放。较大的实现拆为目录模块，保留公开函数签名。
- 根入口与 `/v4` 同时提供 ESM、CJS 和类型声明；移除 v3、自定义生成器、多版本分发与 HTML parser 兼容导出，并移除上游 `publishConfig.exports` 覆盖。
- 主包、PostCSS 与 CLI 改用 workspace 新包；产品生产依赖树和打包产物均无旧 engine。测试、demo、示例继续通过 npm 版 `tailwindcss-patch` 使用其间接依赖，锁文件保留该部分。
- Tailwind CSS 入口通过新 engine 的 `createRequire` 上下文解析，覆盖 workspace 与 pnpm 发布安装布局，不再向上猜测相邻目录。

## 通过的检查

在 macOS 本地工作树运行；pnpm 为 `12.4.1`，pnpm 脚本内 Node 为 `25.6.1`，满足仓库 engines。

| 检查 | 命令与结果 |
| --- | --- |
| 依赖一致性 | `pnpm --filter @weapp-tailwindcss/cli... install --frozen-lockfile --ignore-scripts --offline` 通过；锁文件只有 engine importer、catalog 和三个消费包依赖变更 |
| 构建 | `pnpm --filter @weapp-tailwindcss/cli... run build` 通过，包含 engine、三个消费包及其 workspace 构建依赖 |
| Engine | `CI=1 pnpm --filter @weapp-tailwindcss/engine test --update=none`：12 个文件、143 项通过；覆盖真实 Tailwind 4.3.3 编译、扫描、模板/JS/SFC/CSS 提取、位置、生成会话和导入 |
| Engine 类型与 lint | `pnpm --filter @weapp-tailwindcss/engine typecheck`、`pnpm --filter @weapp-tailwindcss/engine lint` 通过 |
| 主包类型 | `pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.build.json --noEmit --noCheck false --pretty false` 通过 |
| PostCSS | `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/source-scan.test.ts test/generator-plugin.test.ts test/uni-app-x-style-value.test.ts test/uni-app-x.test.ts test/uni-app-x-border.test.ts --update=none`：53 项通过 |
| CLI | `CI=1 pnpm --filter @weapp-tailwindcss/cli exec vitest run --update=none`：57 项通过，含 build/watch 回归 |
| 发布配置 | `pnpm release status` 识别中文 intent 和新包，未修改版本、发布 npm 或创建 tag |
| 规则与差异 | `pnpm agents:check`、`git diff --check` 通过 |

主包定向运行 `test/tailwindcss`、`test/extractors.test.ts`、架构与 workspace 依赖契约，以及 runtime class set、source candidate boundary、generator candidates、Vite source scan/source candidates 的相关测试。新增运行 JS literal、classname、handlers 分支与 stale fallback 回归。首次运行发现工作树未安装 demo/website 的图标插件依赖，使用对应项目的 frozen-lockfile 离线安装补齐，再重跑失败的 generator plugin 回归通过；未改动测试预期。

包入口解析测试覆盖从 package.json 解析、engine 模块上下文的 workspace/pnpm 布局、无法解析的自定义包。路径测试通过分别注入 `node:path.posix` 和 `node:path.win32`，覆盖反斜杠、盘符、跨盘拒绝、根目录、相对 glob、缓存身份及报告逻辑路径；没有把这些测试计作 Windows 实机执行。

对四个包分别执行 `pnpm pack --json --pack-destination <临时目录>`，核对 tarball manifest 不残留 workspace/catalog 协议，三个消费包引用 `@weapp-tailwindcss/engine@0.1.0`，exports 的具体文件或通配目标存在，产物无旧 engine 引用，新包无 v3 声明或代码。将 tarball 解包到仓库外临时目录，接入当前已安装依赖后，验证四个包、engine `/v4` 和主包 `/vite` 的 ESM/CJS 加载与真实 v4 生成；另以 TypeScript NodeNext 分别检查 `.mts`、`.cts` 消费方。该验证覆盖解包布局，未执行从 npm 注册表安装尚未发布的新包。

## 未通过与未执行

- `pnpm --filter @weapp-tailwindcss/postcss exec tsc -p tsconfig.build.json --noEmit --noCheck false --pretty false`：75 条既有错误。
- `pnpm --filter @weapp-tailwindcss/cli exec tsc --noEmit --pretty false`：14 条既有错误。
- 对原工作区基线执行相同命令，比对所有 `error TS` 行，两个包的错误内容和数量完全一致。PostCSS 包括 color-mix/cascade-layers 的空值与 AST 类型，CLI 包括 `src/build.ts` 的可选属性及参数类型；本次未新增错误，也未放宽类型选项。
- 主包既有 7 个跳过用例维持原状，本次未新增 skip。
- 未执行全仓测试、设备/IDE 多端 E2E 或 Windows/Linux 实机验收。本任务使用定向单测、编译器集成与包构建检查，不把这些结果作为多端预检证据。
- 未改动 demo、issue 复现页或原有输出快照，没有需要重建的项目 static 基线。

## 规则调整

按确认的方案，将 Tailwind CSS 4 生成必需的 CSS 解析、`@source` 处理、选择器别名和产物 AST 划归 engine；平台兼容转换仍归 PostCSS。同步根规则、包规则、新 engine AGENTS 与规则索引，架构测试约束 engine 不反向依赖产品适配包、旧 engine 或官方生成插件。

## 2026-09-19 合并主分支

合并 `main` 的 `287239cd7`，纳入 PostCSS 样式归属调整和微信 rpx 主题风险诊断。4 处源码冲突保留新的 PostCSS facade 与扫描分析接口，同时使用 `@weapp-tailwindcss/engine`。新迁入的 `packages/postcss/src/source-scan/candidates.ts` 也切换为新 engine；架构测试新增四个产品包源码不得残留旧 engine 引用的检查，防止代码迁移绕过 manifest 约束。

本轮主包严格类型检查首次发现主分支 rpx 诊断代码的 5 处 `TS4111`，将环境变量访问改为方括号写法，保持诊断行为和环境变量优先级不变，复验通过。

本轮在相同 macOS 工作树完成以下定向验证，所有 Vitest 命令均设置 `CI=1` 并显式传入 `--update=none`：

- `pnpm --filter @weapp-tailwindcss/cli... install --frozen-lockfile --ignore-scripts --offline`：通过，合并后的锁文件无需重新解析依赖。
- `pnpm --filter @weapp-tailwindcss/cli... run build`：通过；类型修正后再次执行 `pnpm --filter weapp-tailwindcss build`，通过。
- `pnpm --filter @weapp-tailwindcss/engine exec vitest run --update=none`：12 个文件、143 项通过。
- `pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/source-scan.test.ts test/source-candidates.test.ts test/generator-plugin.test.ts test/css-entry-source.test.ts test/tailwind-source-analysis.test.ts test/style-transform-ownership.test.ts test/rpx-theme.test.ts test/rpx-candidate-compat.test.ts --update=none`：8 个文件、57 项通过。
- `pnpm --filter weapp-tailwindcss exec vitest run test/tailwindcss test/ci/architecture-contract.test.ts test/ci/workflows.test.ts test/bundlers/generator-css-candidates.unit.test.ts test/bundlers/css-entry-analysis.unit.test.ts test/bundlers/tailwind-v4-source-analysis.unit.test.ts test/bundlers/rpx-theme-warning.integration.test.ts test/bundlers/vite-source-scan.unit.test.ts test/bundlers/vite-source-scan-css-entries.test.ts test/bundlers/source-candidate-boundary.unit.test.ts test/bundlers/runtime-class-set-boundary.unit.test.ts --update=none`：58 个文件、441 项通过，保留 1 个文件内的 7 项既有跳过。
- `pnpm --filter @weapp-tailwindcss/cli exec vitest run --update=none`：10 个文件、57 项通过，包含 build/watch。
- 环境变量类型修正后复验 `test/tailwindcss/v4/rpx-theme-warning.test.ts` 和 `test/bundlers/rpx-theme-warning.integration.test.ts`：27 项通过。
- `pnpm --filter @weapp-tailwindcss/engine typecheck`、主包 `tsc -p tsconfig.build.json --noEmit --noCheck false --pretty false`：通过。
- 本轮修改源码的 ESLint：无错误；架构测试文件受仓库既有 ignore 规则排除，已通过 Vitest 验证。
- 四包构建产物扫描未发现旧 engine 引用，四包根入口和主包 `/vite` 的 ESM/CJS 加载通过，主包 `/generator` 的 ESM/CJS 真实 v4 生成通过。
- `pnpm agents:check`：49 份规则、43 份文档、339 条命令、0 错误；`git diff --check` 通过。

本轮没有新增规则，也没有相对最新 `main` 修改 demo 或 static 基线。未重跑 PostCSS/CLI 的严格类型检查、tarball 安装检查、全仓测试或多端实机验收；前述既有类型错误与平台限制仍保留记录，不以定向验证替代全端预检。
