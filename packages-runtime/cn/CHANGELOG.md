# @weapp-tailwindcss/cn

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
