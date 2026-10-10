# CI 范围判定依赖

## 适用范围

本规则适用于 `tools/ci-scope`。

## 核心职责

仅为共享 CI 内容分类器提供锁定的 YAML 与 semver 依赖，不发布 npm、不承载产品代码。

## 变更原则

保持 private；依赖安装使用 frozen lockfile 与 ignore-scripts。分类实现在 `scripts/ci`，禁止在此复制实现。

## 测试要求

依赖变更需验证隔离安装与真实 Git 差异分类。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/ci-scope install --prod --frozen-lockfile --ignore-scripts`
- `pnpm --filter weapp-tailwindcss exec vitest run test/ci/release-metadata.test.ts --update=none --coverage.enabled=false`

## 提交前检查

锁文件仅更新此工具的 importer；不改变既有解析结果。
