---
title: 使用 doctor 命令诊断项目配置
description: 使用 weapp-tailwindcss doctor 快速检查 Node.js、Tailwind CSS、框架依赖和构建器配置。
keywords:
  - 常见问题
  - 故障排查
  - doctor
  - 诊断命令
  - weapp-tailwindcss
  - tailwindcss
  - postcss
  - 小程序
  - 微信小程序
  - uni-app
  - taro
  - mpx
---

# 使用 doctor 命令诊断项目配置

当项目出现样式未生成、JS 中的 class 未转义、CSS 入口没有被扫描、插件没有在目标端生效等问题时，可以先运行 `doctor` 命令收集项目配置状态。

```bash npm2yarn
npx weapp-tailwindcss doctor
```

如果你不在项目根目录，可以通过 `--cwd` 指定业务项目目录：

```bash npm2yarn
npx weapp-tailwindcss doctor --cwd ./packages/miniprogram
```

## 检查内容

`doctor` 命令只读取本地项目文件，不会修改项目配置。当前会检查以下内容：

| 检查项 | 说明 |
| --- | --- |
| `package.json` | 确认命令是否运行在项目根目录 |
| Node.js | 检查当前 Node.js 是否满足最低版本要求 |
| 包管理器 | 识别 `packageManager`、`pnpm-lock.yaml`、`package-lock.json` 或 `yarn.lock` |
| `weapp-tailwindcss` | 检查当前项目是否安装本插件 |
| `tailwindcss` | 检查 Tailwind CSS 是否可解析，并尽量读取实际安装版本 |
| Tailwind 配置 | 检查 `tailwind.config.*` 是否存在 |
| PostCSS 配置 | 检查 `postcss.config.*` 是否存在 |
| 生成模式配置 | 检查 v5 项目是否应移除 Tailwind 官方 PostCSS / Vite 生成插件 |
| 框架依赖 | 识别 Taro、uni-app、MPX、Remax |
| 构建器配置 | 识别 `vite.config.*` 或 `webpack.config.*` |

## 输出说明

普通输出适合人工排查：

```bash npm2yarn
npx weapp-tailwindcss doctor
```

JSON 输出适合在 issue、CI 或自动化脚本中使用：

```bash npm2yarn
npx weapp-tailwindcss doctor --json
```

严格模式会在存在 `warn` 或 `error` 时返回非零退出码，适合放在项目检查脚本中：

```bash npm2yarn
npx weapp-tailwindcss doctor --strict
```

## 常见诊断结果

### 未检测到 package.json

说明命令大概率没有运行在项目根目录。请切换到业务项目根目录后重试，或者使用 `--cwd` 指定目录。

```bash npm2yarn
npx weapp-tailwindcss doctor --cwd ./demo/uni-app-vue3-vite
```

### 未检测到 tailwindcss

说明当前项目没有安装 `tailwindcss`，或者依赖无法从当前目录解析。请先确认依赖安装完成，再重新运行诊断命令。

### 生成模式项目仍注册 Tailwind 官方生成插件

`weapp-tailwindcss@5` 默认由 `WeappTailwindcss` 构建器插件接管 Tailwind CSS 生成。小程序构建里不要再同时注册 `@tailwindcss/postcss` 或 `@tailwindcss/vite`。

如果项目已有 `postcss.config.*`，只保留业务自己的非 Tailwind 插件。Tailwind CSS 4.x 的入口 CSS 使用 `@import "tailwindcss"` 与 `@source`；应通过 `cssEntries` 显式传给 `WeappTailwindcss`，并使用项目根目录解析出的绝对路径。`cssEntries` 不是替代 import 的开关，入口 CSS 仍然要被框架纳入构建图。

仅存在 `postcss.config.*` 不会触发这项警告。`doctor` 只有在配置文件实际引用 `@tailwindcss/postcss` 或 `@tailwindcss/vite` 时，才会报告重复生成器，并在 JSON 输出中提供 `code: "duplicate-tailwind-generator"` 与配置文件证据。

### 未检测到 tailwind.config.*

Tailwind CSS 4 支持 CSS-first 配置，未检测到 `tailwind.config.*` 不一定是问题。如果 JS 字符串中的 class 没有被识别，需要检查 CSS 入口中的 `@source`。

当前文档仅维护 Tailwind CSS 4 接入说明。

## issue 反馈建议

提交 issue 时，建议附上以下信息：

```bash npm2yarn
npx weapp-tailwindcss doctor --json
```

同时补充：

| 信息 | 示例 |
| --- | --- |
| 框架 | Taro / uni-app / MPX / 原生小程序 |
| 构建器 | Vite / Webpack / Gulp |
| Tailwind CSS 版本 | v4 |
| 目标端 | 微信小程序 / H5 / App / 鸿蒙 |
| 复现命令 | `pnpm dev:mp-weixin` |

这样可以更快判断问题属于依赖安装、Tailwind 扫描范围、PostCSS 注册、插件禁用条件还是小程序端限制。

不同框架、构建器和目标端的已验证范围见[支持矩阵](/docs/reference/support-matrix)。矩阵中的“未覆盖”表示当前没有可复现的自动化或本地证据，不代表理论上一定不支持。
