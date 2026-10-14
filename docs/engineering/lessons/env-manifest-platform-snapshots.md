---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1299
baseline: 61d79ffca1ac440e220c52ea597ef238136ff05d
regressions:
  - packages/env/test/manifest.test.ts
  - packages/env/test/platform-snapshots.test.ts
  - packages/weapp-tailwindcss/test/framework.test.ts
---

# Uni manifest 注释与平台快照入口

## 症状

[#1299](https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1299)：官方 uni-app x 的 manifest 带块注释，使用 `detectAppType({ root })` 时无法读取其中明确的框架标记。真实目录中的发布包 ESM/CJS 均返回 `undefined`，等价严格 JSON 则返回 `uni-app-x`。

[#1300](https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1300)：Uni 已有显式环境快照入口，Taro/MPX 消费方需要手工取值才能保持快照隔离。旧单值入口的 `undefined` 会读取进程环境，这是既有约定，并非原 API 缺陷。

## 根因与纠正

manifest 和 package.json 共用严格 `JSON.parse`。新增内部字符串感知的注释扫描，仅用于 manifest；注释替换为空白并保留换行，避免把非法的 `tr/* comment */ue` 拼成合法 token。保留字符串与转义字符，未闭合块注释明确失败，其余语法继续交给 `JSON.parse`。package.json、优先级、父目录搜索和损坏文件回退不变。

新增 `resolveTaroPlatformFromEnv` 和 `resolveMpxPlatformFromEnv`，快照字段直接交给纯分类器。显式空对象、部分快照及 undefined 字段不继承进程；省略快照或传入 undefined 时按调用时读取。MPX 保留 `MPX_CURRENT_TARGET_MODE ?? MPX_CLI_MODE`，包括 current mode 的空字符串。旧单值入口不变，主包根入口和 framework 入口转导出新 API。

没有新增运行时依赖。公开双语 README 和中文 patch/minor intent 同步，版本由既有发布流程计算。

## 验证

2026-10-14，macOS arm64、Node 24.18.0、pnpm 12.9.1，独立 worktree 中验证本次未提交修复；frontmatter SHA 是修复前基线。

- 修复前 manifest 回归 20 项中 12 项失败、8 项通过；修复后 env 6 文件 101 项通过，包括字符串深相等、CRLF、非法 token、损坏文件回退及快照隔离。
- 主包 9 个定向测试文件共 79 项通过。架构产物测试首次因 CLI 尚未构建失败；补建 CLI 后同一失败文件的 13 项全部通过。
- 主包依赖闭包 22 个项目构建通过，并补建 CLI。env 和主包源码类型检查、主包 tsd 通过。
- workspace 外 tarball 消费通过：env 与 framework 的真实裸包 ESM/CJS、注释 manifest、环境快照和严格 NodeNext `.mts`/`.cts` 类型。另在主包目录验证根入口 ESM/CJS 的新导出与 env 为同一函数；这部分使用 workspace 依赖闭包，不宣称主包根入口的包外完整依赖安装已验证。
- 定向 ESLint 使用 `--no-ignore` 覆盖变更的源码、脚本和测试，架构检查通过。

主要命令：

```sh
pnpm --filter @weapp-tailwindcss/env exec cross-env CI=1 vitest run --update=none
pnpm --filter @weapp-tailwindcss/env typecheck
pnpm --filter weapp-tailwindcss... run build
pnpm --filter @weapp-tailwindcss/cli build
pnpm --filter @weapp-tailwindcss/env test:package
pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false
pnpm --filter weapp-tailwindcss tsd
pnpm architecture:check
pnpm agents:check
pnpm release status
git diff --check
```

## 适用边界

本次只验证包级及受影响的主包契约，未执行全面测试、微信 IDE、HBuilderX、设备或浏览器 E2E，未在 Windows/Linux 真实运行。路径读写继续使用 Node 跨平台 API；现有 env CI 提供多系统、Node 22/24 的后续验证。

未改变 manifest 发现位置、尾逗号支持、MPX 别名分类或项目 CSS target/default 策略。没有 demo 或样式输出变化，因此无需重生成 static 基线。未执行版本落盘、发布 npm 或关闭 Issue。

## 规则评估

不新增 AGENTS 规则。沿用 env 的零依赖、只读扫描与快照隔离边界，用持久回归和消费测试固定新行为。
