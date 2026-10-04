# Rust 内核分发与发布

`packages-native/*` 包含八个平台包，按 `os`、`cpu` 和 Linux `libc` 安装。每个平台包同时提供 JS/WXML 与 PostCSS 两个 Node-API binding：

| 平台 | Rust target | npm 包名后缀 |
| --- | --- | --- |
| macOS arm64 | `aarch64-apple-darwin` | `darwin-arm64` |
| macOS x64 | `x86_64-apple-darwin` | `darwin-x64` |
| Windows arm64 | `aarch64-pc-windows-msvc` | `win32-arm64-msvc` |
| Windows x64 | `x86_64-pc-windows-msvc` | `win32-x64-msvc` |
| Linux GNU arm64 | `aarch64-unknown-linux-gnu` | `linux-arm64-gnu` |
| Linux GNU x64 | `x86_64-unknown-linux-gnu` | `linux-x64-gnu` |
| Linux musl arm64 | `aarch64-unknown-linux-musl` | `linux-arm64-musl` |
| Linux musl x64 | `x86_64-unknown-linux-musl` | `linux-x64-musl` |

包名为 `@weapp-tailwindcss/native-<后缀>`。根入口加载 JS/WXML binding，`/postcss` 加载 CSS binding。平台包不包含安装脚本；用户不需要 Rust，也不会在安装过程中额外下载二进制。可选依赖被禁用、平台不支持或 binary 加载失败时，原有 JavaScript 回退仍由各消费者控制。`WEAPP_TW_NATIVE=required` 用于明确要求原生实现的验收。

## 版本与变更意图

八个平台包与 `weapp-tailwindcss`、CLI 属于同一 repoctl/pnpm 固定版本组。PostCSS 保留自己的版本序列，不加入该固定组。两个消费者均以 `workspace:*` 依赖平台包，打包后得到当前平台包的精确版本。

修改任意 Rust 内核，包括**仅修改 CSS 内核**，都必须为固定组内的主包或原生平台包添加中文 change intent，使下一次发布产生新的平台包版本。仅给 PostCSS 增加 intent 会使其继续依赖旧平台包，不能作为内核更新交付。当前源码与每个产物的版本、内容哈希和源摘要在发布前再次检查。

首次发布新平台包需由包所有者完成 npm trusted publisher 配置；后续由已有 `repoctl` 发布工作流使用 Node 24、OIDC 与 provenance 发布。不得为初始化平台包而向工作流添加 npm token。

## 构建与验证

开发者可运行 `pnpm --filter weapp-tailwindcss build:native` 构建当前主包内核。该显式命令需要已安装的 Rust 工具链和链接器。构建输出留在忽略目录中，并复制到对应平台包，不写入 bundler 构建产物。

完整平台任务使用 `node packages/weapp-tailwindcss/native/ci.mjs --target=<Rust target>`，在该目标平台依次执行：

1. 两个 crate 的 `cargo test --locked` 与 `cargo clippy --locked --all-targets -- -D warnings`。
2. 两个 release binding 构建、平台包暂存，以及 TypeScript 消费包构建。
3. JS/WXML 真实 ABI 差分、CSS 原生回归和公开 tokenizer/JS 条件语义回归。
4. 平台包 tarball 的隔离解析与离线安装，在安装后执行 JS/WXML/CSS Node-API。

CI 在 Node 24 和 core 最低受支持的 Node 22.18.0 上运行消费者验证，另外在独立 PostCSS 最低受支持的 Node 20.19.0 上验证 CSS 平台包离线安装与真实 ABI。共享平台包的 engines 覆盖两个消费者范围；core 自身要求不变。Linux GNU 使用 manylinux glibc 2.28 镜像构建；musl 使用 Alpine；CPU 由原生 arm64/x64 runner 提供，不将交叉编译成功当成目标平台运行通过。

本机只验证当前 OS/CPU/libc，不能替代其余七个平台的 CI。Linux 容器入口 `ci-linux.sh` 仅用于 Linux CI，不用于 Windows 或 macOS 开发者环境。

## 产物交付门禁

[Native Compiler Artifacts](../../../.github/workflows/native.yml) 由 Release 与 Release Gate 复用。八个任务全部通过后，上游同一 workflow run 下载产物，执行 `pnpm native:artifacts:stage`，最后通过既有 repoctl 发布流程。

`pnpm native:artifacts:verify` 要求两套内核、八个平台全部存在，并检查目标、源码摘要、二进制 SHA-256、消费者版本、平台包版本、os/cpu/libc、导出和无安装脚本。源码摘要统一 LF/CRLF，避免 Windows checkout 差异产生误判。缺失平台、混入旧产物或内容不匹配时立即失败，不使用本机 binding 填补其他目标。

`native/test/package.mjs` 只读取当前平台产物；`test/native-distribution.test.ts` 验证缺失、篡改、版本漂移、错误 libc 和跨内核错配的失败边界。未执行的远端矩阵不得记为已验证。
