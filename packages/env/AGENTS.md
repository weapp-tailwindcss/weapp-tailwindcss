# Package Guidelines (`packages/env`)

## 适用范围

- 本文件适用于 `@weapp-tailwindcss/env`，补充上级规则。

## 核心职责

- 拥有构建期环境、框架、平台与 HBuilderX 的事实识别。
- 项目扫描只读取配置及现有 marker，不修改项目文件。

## 变更原则

- 生产源码只依赖 Node 内置模块，不引入主包、Tailwind、CSS 或构建器依赖，包括类型引用。
- 构建器 profile、生成器 target、样式策略与 Vite package boundary 留在主包。
- 显式环境快照只读取传入对象；默认环境按调用时读取，不建立全局环境缓存。
- 首期仅根入口，保持 ESM/CJS 及类型声明对应。

## 测试要求

- 识别规则变化补优先级、未知输入和环境隔离回归。
- 路径变化覆盖 POSIX、Windows、相对目录及根目录终止。
- 打包回归在 workspace 外验证真实裸包导入、require 与 NodeNext 类型。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/env test --update=none`
- `pnpm --filter @weapp-tailwindcss/env typecheck`
- `pnpm --filter @weapp-tailwindcss/env build`
- `pnpm --filter @weapp-tailwindcss/env test:package`

## 提交前检查

- 运行受影响的识别、主包兼容与架构回归。
- 同步公开用法、类型、中文 change intent 和规则索引。
