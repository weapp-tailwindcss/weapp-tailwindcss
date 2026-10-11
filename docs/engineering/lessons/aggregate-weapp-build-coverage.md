---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/951
baseline: d19ae91d571ebcfa6c059a7f6b78ef5e2543881b
regressions:
  - e2e/taro-ci-coverage-matrix.test.ts
  - e2e/multiplatform-build-output.test.ts
---

# 聚合跳过必须由同一平台的真实构建补齐

## 症状

根 `pnpm build` 为聚合构建显式跳过 Taro/uni guard，后续 E2E 再严格执行框架构建。审计发现 issue951 Taro Vite React 和 subpackage Taro Webpack React 虽有支付宝、头条与 H5 构建，却缺少原 `build` 对应的微信目标。`test:demo:matrix` 只检查矩阵契约，不执行 catalog 中登记的所有构建。

## 根因与纠正

覆盖统计使用了项目维度，掩盖平台维度的空缺。issue951 没有登记 weapp；subpackage 的 weapp 仅为 local 占位项，默认工作流固定执行 `status=ci`，因此二者都没有补齐被聚合阶段跳过的微信构建。

为 issue951 增加 weapp 产物 case，为 subpackage 增加 weapp isolated/single 两种入口模式，并将两个微信目标登记为 default-ci。复用现有严格构建 runner，不改根 skip 分工、门禁、平台过滤或失败停止规则。

Taro 小程序产物元数据集中维护 `.wxss/.wxml`、`.acss/.axml`、`.ttss/.ttml`。issue951 三个平台共用主入口、页面局部样式、普通分包和独立分包隔离断言，避免继续复制每个平台的整块配置。

同步 demo 覆盖目录中的微信静态覆盖状态。Taro/uni 的小程序与 H5 分包 case 都显式设置入口模式，避免 isolated 用例继承终端遗留的 `E2E_TW_CSS_ENTRY_MODE=single`。

新增完整性回归枚举所有经过 Taro guard 的 demo，要求存在同一微信目标的 static 构建入口或默认真实产物 case，拒绝其他平台与 local 占位项。另覆盖微信两种入口模式和三个小程序平台的模板、样式后缀及主包导入关系。

## 验证

`pnpm exec cross-env CI=1 E2E_TW_CSS_ENTRY_MODE=single pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/taro-ci-coverage-matrix.test.ts e2e/e2e-matrix.test.ts --update=none`：2 文件、47 项通过，0 失败、0 跳过。新增完整性、微信双模式、覆盖目录一致性与入口模式隔离回归均保留修复前失败证据。

独立工作树首次运行总矩阵时缺少 escape 包产物，加载阶段失败；执行 `pnpm --filter @weapp-tailwindcss/escape build` 后，同一命令通过。ESLint 检查本次 TypeScript 修改通过。

集成工作树在 `3cdccbfb7` 使用以下命令清理后重新生成两个项目的 weapp/alipay/tt 产物基线，共 9 个真实构建组合及 1 个矩阵完整性用例通过，0 失败、0 跳过，耗时 77.56 秒：

```sh
pnpm exec cross-env CI=1 E2E_MULTIPLATFORM_BUILD_STATUS=ci E2E_MULTIPLATFORM_BUILD_SKIP_BUILD=0 "E2E_MULTIPLATFORM_BUILD_CASE=^(issue-951-taro-vite-react-tailwindcss-v4 (weapp|alipay|tt)|subpackage-taro-webpack-react-tailwindcss-v4 (weapp|alipay|tt) (isolated|single))$" pnpm e2e:multiplatform-build
```

日志保存在 `.tmp/weapp-coverage-builds.log`。新增微信 WXSS/WXML、主包导入与两种分包模式通过，同步复核的支付宝/头条产物也通过。基线为严格重建后的产物断言；未修改 demo 源码、样式预期或 tracked 快照。

## 适用边界

只补齐现有全面流程缺失的两个微信目标，没有将所有 local 平台提升为默认 CI，也没有复用旧产物或跳过真实构建。未修改公开包行为与 demo 源码，不需要 change intent；新增产物回归仍必须完成上述真实基线验证。

## 规则评估

不新增 AGENTS 规则。以平台粒度的可执行完整性回归落实原有全面测试要求，避免把项目被构建过等同于所有目标均已验证。
