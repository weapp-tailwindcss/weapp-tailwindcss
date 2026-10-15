# @weapp-tailwindcss/css-compat

## 0.1.2

### Patch Changes

- 升级兼容范围内的编译、样式、测试和开发工具依赖，同步 catalog 与锁文件。

  - 对齐 Babel 8、Oxc parser/types 和 PostCSS 的兼容版本，更新单位转换依赖。
  - 将 Vitest、覆盖率与 UI 统一到 5.0.4，更新 Lynx、Storybook 及相关开发依赖。
  - 保留需要补丁迁移或完整框架、IDE 与设备验证的版本组。

  升级范围、模板兼容修正、审计结果和本地验证见 docs/engineering/lessons/dependency-upgrade-2026-10.md。

## 0.1.1

### Patch Changes

- 补齐独立 CSS layer 兼容内核的发布记录，包含 ordered 编译、源码诊断和显式 legacy 兼容入口，保持现有 PostCSS 默认行为。Refs #1280
