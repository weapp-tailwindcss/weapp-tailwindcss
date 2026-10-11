# 原生平台发行包

## 适用范围

- 适用于 `packages-native/*`，补充仓库根规则。

## 核心职责

- 按操作系统、CPU 和 libc 分发 Rust Node-API binding，消费者只安装匹配的平台包。
- Rust 源码和构建逻辑位于 `packages/weapp-tailwindcss/native`，平台包不包含独立转换逻辑。

## 变更原则

- 与 `weapp-tailwindcss` 保持固定版本组和精确可选依赖；统一由 repoctl 编排版本与发布。
- 只修改 CSS 内核时同样需要为平台包固定组添加中文 change intent；只提高 PostCSS 版本会继续消费旧平台包。PostCSS 自身不加入该固定组。
- 不添加 install/postinstall 脚本，不在消费者环境下载或编译。
- 二进制及其源摘要由同一提交的 CI 构建生成，不能提交到 Git。
- 第三方许可证由 `packages/postcss/native/THIRD_PARTY_LICENSES.txt` 暂存到每个平台包并随 tarball 发布；不可省略或手改生成副本。

## 测试要求

- 所有目标必须在匹配平台运行真实 Node-API 差分验证与 tarball 解析验证。
- 发布前验证八个平台的 binding、源摘要、内容哈希、版本与第三方许可；不能用其他平台产物补缺。

## 推荐验证命令

- `pnpm --filter weapp-tailwindcss build:native`
- `pnpm --filter weapp-tailwindcss test:native:package`
- `pnpm native:artifacts:verify`

## 提交前检查

- 检查 os/cpu/libc 与 Rust target 一致，无安装脚本，无二进制提交。
- Node 24、OIDC 和 provenance 发布安全边界保持不变。
