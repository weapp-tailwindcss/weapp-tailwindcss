---
name: weapp-tailwindcss-migrate
description: 将现有 weapp-tailwindcss 项目迁移到当前 v5/Tailwind CSS 4 生成链路，处理旧 `weapp-tw patch`、旧版 CLI init/Sass/Less/目录扫描、tailwindcss-patch、官方 PostCSS/Vite 插件、相对 cssEntries、H5 disabled、Webpack 4、Node/HBuilderX/ESM 要求。Use for upgrade, migration, legacy CLI cleanup, v4-to-v5, or deprecated setup removal；不用于全新接入或单点故障排查。
---

# weapp-tailwindcss migrate

从职责边界和构建图迁移旧项目，不在旧配置上叠加补丁。

## 工作流

1. 读取 manifest、锁文件、Tailwind 入口、bundler 配置、PostCSS 配置和运行脚本。
2. 识别当前 weapp-tailwindcss/Tailwind/Node/HBuilderX/bundler 版本及所有生成入口。
3. 读取 [references/v5-migration.md](references/v5-migration.md)，按依赖、入口、插件、目标端、验证顺序迁移。
4. 删除旧 patch 和同一次构建中的重复 Tailwind 生成器，再注册当前 `WeappTailwindcss`。
5. 旧 CLI 用户迁移到独立 `@weapp-tailwindcss/cli` 5.x，并将 `init`、预处理器和目录扫描职责移回项目构建链。
6. 将 Tailwind 入口迁移到纯 CSS，保证实际导入，并将全部真实入口写为绝对 `cssEntries`。
7. 移除“一律禁用 H5/Web”的旧逻辑；让 generator 自动识别 Web target。
8. 用一次干净构建、一次新增任意值 class 和一次 HMR 更新验证迁移；App 目标必须检查真实运行时。

## 迁移纪律

- 先记录旧配置和可回滚提交，不批量删除无法确认归属的 PostCSS 或框架插件。
- 只删除 Tailwind 生成职责的重复入口；独立 Web 应用的单独构建可继续使用官方 Tailwind 插件。
- 不用 `alwaysEscape` 或扩大字符串扫描来掩盖过期 `classNameSet`。
- 不把构建成功等同于迁移成功；至少检查目标端 CSS、模板/JS safe class 和新增候选。

## 输出要求

输出迁移前诊断、删除/保留清单、逐文件 diff、验证结果和回滚步骤，并标出仍需人工验证的设备或 IDE 环境。
