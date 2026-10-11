---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1265
baseline: 0bfb23912f59cfaf0b58b00353d7f08122d1f8f1
regressions:
  - packages/init/test/version-selection.test.ts
  - packages/init/test/npm.test.ts
  - packages/init/test/init.test.ts
---

# 初始化依赖的稳定版本选择

## 症状

Refs #1265。registry 版本列表乱序时选择旧版，预发布版排在末尾时误选预发布版，没有目标主版本时回退到其他主版本的 latest。

## 根因与纠正

字符串 startsWith 不是 semver 范围判断，对象插入顺序也不是版本顺序。初始化器改用显式声明的 semver 依赖，排除无效版本和预发布版，再取范围内最高版本。无效范围或没有匹配稳定版时携带包名与范围报错。

保留现有先解析全部依赖再写入的边界。默认与 legacy 模式都验证失败时 package.json 字节不变，且不创建配置。修正历史 legacy mock 只有 alpha 版本的问题，加入稳定版候选。

## 验证

版本乱序、预发布、主版本前缀碰撞、无效版本、无匹配、无效范围及两种初始化模式写入保护的 10 项回归，在修复前均失败，修复后通过。测试使用固定 registry 数据，不依赖联网或当前 npm 返回顺序。

验证入口：

- `CI=1 pnpm exec vitest run --project=@weapp-tailwindcss/init --update=none --coverage.enabled=false`
- `pnpm --filter @weapp-tailwindcss/init build`
- `pnpm --filter @weapp-tailwindcss/init lint`
- `pnpm --filter @weapp-tailwindcss/init exec tsc -p tsconfig.json --pretty false`

## 适用边界

本次调整初始化依赖的稳定版策略，不改变 registry 默认值、fetchOptions 或函数签名。未宣称真实 npm registry 已触发每一种 mock 数据情况，也未执行真实用户项目写入或 npm 发布。

## 规则评估

不新增规则；用输入输出回归和中英文 README 明确版本选择契约。
