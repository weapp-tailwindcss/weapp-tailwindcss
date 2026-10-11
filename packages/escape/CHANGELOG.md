# @weapp-tailwindcss/escape

## 0.0.2

### Patch Changes

- 将包主页统一到项目文档站，并补齐公开包主页校验登记，避免迁入后仍指向带片段的 GitHub README 链接。

- 将类名转义基础包源码纳入本仓库，以 @weapp-tailwindcss/escape 从新版本序列独立发布，并统一替换编译端、PostCSS 和运行时的依赖及类型引用。保留原转义 API、ESM/CJS 入口和映射行为，增加旧发布版对照与新包名打包验证。

  公开 workspace 消费方统一使用 repoctl 要求的 `workspace:*`，发布 tarball 固定到同批 escape 版本，避免保留旧依赖范围策略导致 Release 协议校验失败。

- 将发布包的仓库与问题反馈地址更新为 weapp-tailwindcss 组织下的主仓库，使 npm 包元数据与迁移后的 OIDC 发布来源一致。保留现有包名、导出接口、npm 所有权和文档域名。

新包从 0.0.1 开始，由 repoctl 的中文 change intent 记录首次发布。迁移前历史见 [UPSTREAM_CHANGELOG.md](./UPSTREAM_CHANGELOG.md)。
