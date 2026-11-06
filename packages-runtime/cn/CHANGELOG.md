# @weapp-tailwindcss/cn

## 0.2.0

### Minor Changes

- 升级依赖并完成配套迁移。

  - `@weapp-tailwindcss/cn` 升级至 `cn@0.5.2`，最低 Node.js 版本调整为 22.12.0。
  - `@weapp-tailwindcss/variants` 与 UI 消费链迁移至 `tailwind-variants@4.0.1`；空聚合统一返回空字符串，保留 `twMergeConfig` 并支持函数形式的 `twMerge`，同步公开类型和回归。
  - Tailwind CSS 4 生成链升级至 4.3.4，保留 v3 兼容样例和独立平台转换边界。
  - PostCSS 更新颜色解析和 preset-env；将 `autoprefixer: false` 的最小声明补丁迁移至 11.6.2。
  - CLI、init 和主包同步 semver、local-pkg、OXC parser/walker 配套类型；Lynx、React Native、reset、injector、theme-transition 和 wetw 更新对应依赖解析。
  - Vitest、coverage 与 UI 统一至 5.1.0；Taro 保留其配置要求的 ESLint 8.57.1。
  - weapp-vite 7.8.0 对齐 devframe/agentic 1.3.0，迁移发行包行为契约；Nuxt 的 Nitro 路径补丁迁移至 2.13.6。

## 0.1.5

### Patch Changes

- 将发布包的仓库与问题反馈地址更新为 weapp-tailwindcss 组织下的主仓库，使 npm 包元数据与迁移后的 OIDC 发布来源一致。保留现有包名、导出接口、npm 所有权和文档域名。

- Updated dependencies:
  - @weapp-tailwindcss/runtime@0.1.11

## 0.1.4

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/runtime@0.1.10

## 0.1.3

### Patch Changes

- 更新依赖。

  ### @weapp-tailwindcss/cn

  - 更新 dependencies 中的 `cn`：`^0.3.2`，`锁定 0.3.2` → `^0.4.0`，`锁定 0.4.0`。

## 0.1.2

### Patch Changes

- 修正 cn 与 merge 包主页链接，使其指向文档声明的实际路由。

## 0.1.1

### Patch Changes

- 新增基于 npm `cn` 引擎的面向小程序类名组合工具，兼容条件类名、Tailwind 冲突合并与 `rpx` 任意值，作为 `@weapp-tailwindcss/merge` 的后续替代入口。

- 导出 `wrapRuntimeAggregator`，让 `@weapp-tailwindcss/cn` 复用有界 LRU 与按需 unescape/escape，并接入与 merge 相同的 rpx 长度归一化，使 `text-red` 与 `text-[80rpx]` 等颜色 + 长度类可以共存。

- Updated dependencies:
  - @weapp-tailwindcss/runtime@0.1.9
