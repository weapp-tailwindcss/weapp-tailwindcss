---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/actions/runs/36843628878
baseline: 0bfb23912f59cfaf0b58b00353d7f08122d1f8f1
regressions:
  - packages/weapp-tailwindcss/test/ci/verify-packed-packages.test.ts
---

# escape 迁移后的发布协议阻塞

## 症状

迁入 `@weapp-tailwindcss/escape` 后，Release 在准备版本 PR 之前失败。repoctl 报告五个公开消费者的 `workspace:^` / `workspace:~` 不符合 `workspace:*` 协议。npm 对账显示 escape 0.0.1 尚不存在，其余 29 个公开包的当前 manifest 版本均已发布。

## 根因与纠正

迁移保留了旧外部依赖的范围策略，同时在 manifest 测试和 tarball 验证中为 escape 增加例外。测试与实际 repoctl 发布契约因此相互矛盾。统一五个公开消费者为 `workspace:*`，同步锁文件，删除测试例外，真实打包后断言精确版本。私有工具包的范围不属于此发布契约，不扩大修改范围。

npm 的 [trust 命令前提](https://docs.npmjs.com/cli/v11/commands/npm-trust)要求包先存在、账号具有写权限并启用 2FA。不能把工作流具备 Node 24、`id-token: write` 和 provenance 等同于 npm 已完成包级信任配置。新包的初始化和信任绑定必须分别确认，不能通过向现有 Release 工作流注入 token 解决。

## 验证

- 删除测试例外后，`CI=1 pnpm exec vitest run --project=weapp-tailwindcss test/ci/verify-packed-packages.test.ts --update=none` 复现五处协议违规；修复后与 `test/ci/workflows.test.ts` 合并验证共 47 项通过。
- `CI=1 HUSKY=0 pnpm --filter weapp-tailwindcss... --filter @weapp-tailwindcss/cn... run build` 通过；另以 `CI=1 HUSKY=0 pnpm --filter @weapp-tailwindcss/merge... run build` 补齐 merge（cn 的构建闭包不包含它）。
- 首次 tarball 检查因 merge 未构建而失败；补齐上述构建后，`CI=1 pnpm --filter @weapp-tailwindcss/escape test:package` 通过，覆盖 workspace 外的 ESM/CJS、双端类型、五个消费者精确依赖和旧包引用。
- `pnpm install --frozen-lockfile --ignore-scripts --offline` 通过；锁文件仅五个 importer 的协议变化。
- `pnpm release status` 确认 escape 首次版本仍为 0.0.1，消费者版本沿用已有中文迁移 intent。

## 首次发布与信任配置结果

2026-10-02 在用户明确授权首次初始化例外后完成：

- npm 文档描述 `npm stage publish` 可为新包创建 `0.0.0-stage` 占位，但本轮实际请求返回 `404 Package not found`，registry 复查仍为 404；没有将文档能力当成初始化成功证据。
- 用户进一步授权 `@weapp-tailwindcss/escape@0.0.1` 的账号首次发布。pnpm 原生发布客户端在完成 2FA 后发生网络发送错误，复查精确版本仍为 404；随后 `pnpm exec npm publish --access=public --registry=https://registry.npmjs.org` 成功。没有向 Release 工作流写入 token。
- registry 精确版本接口返回 200，tarball SHA-1 为 `c0d226329d691279d35810c2791c1f56e8684404`，与本轮发布产物一致。包聚合元数据曾短暂返回缓存的 404，未因此重复发布。
- `pnpm exec npm trust github @weapp-tailwindcss/escape --repo sonofmagic/weapp-tailwindcss --file release.yml --allow-publish --yes` 成功。随后 `pnpm exec npm trust list @weapp-tailwindcss/escape --json` 读回 GitHub、`release.yml`、`sonofmagic/weapp-tailwindcss`，配置 ID 为 `5df04c63-50c8-4e38-8d1e-12d9dd64a6db`，权限包括 `createPackage` 与 npm 自动包含的 `createStagedPackage`。
- `CI=1 pnpm --filter @weapp-tailwindcss/escape test`：11 个文件、120 项通过；与前述发布契约共 167 项定向测试通过。
- 首次版本使用用户账号认证，没有 OIDC provenance。这里验证的是包已发布和后续 OIDC 信任已配置，不能宣称已经完成一次 OIDC 实际发布。

## 适用边界

本记录验证发布准备契约、首次账号发布与 npm 信任配置，未运行全仓、多端或设备测试，也未手工修改生成的 `release/pnpm-version` 分支。后续正常发布仍需在 main 修复后由 repoctl 重新生成版本 PR；本地定向验证和信任配置不能代替真实 OIDC 发布执行证据。

## 规则评估

不新增 AGENTS 规则。已有 repoctl 统一发布和禁止 token 注入的边界足够；应修正实际依赖与回归测试，避免新增例外掩盖工具链拒绝的配置。
