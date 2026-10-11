# HBuilderX 运行 uni-app x 小程序使用指南

## 1. 概述

本文记录在本仓库中，使用 `HBuilderX` 将 `uni-app x` 示例运行到微信小程序端的最小可行流程，以及排障时需要优先检查的条件。

当前已验证可用的目标工程为：

- `demo/uni-app-x-hbuilderx-tailwindcss3`
- `demo/uni-app-x-vdom-tailwindcss-v4`

本文适合以下场景：

- 需要快速拉起 `uni-app x` 示例到微信开发者工具
- 需要排查 `HBuilderX` 下 `uni-app x` 工程无法编译的问题
- 需要继续维护仓库内 `uni-app-x-hbuilderx-*` 示例

## 2. 启动方式

### 2.1 前置条件

需要满足以下条件：

| 条目 | 要求 |
| --- | --- |
| Node.js | `>=22.12.0`（`weapp-tailwindcss@5.2.0` 起） |
| 包管理器 | `pnpm` |
| HBuilderX | `>=5.11`，本机已安装并可访问 CLI |
| 目标目录 | 进入具体 `uni-app x` 工程目录再执行命令 |

Node.js `22.12.0` 是 Node.js 22 默认支持从 CommonJS 加载 ESM 的最低版本。HBuilderX 低于 `5.11` 时，其内置 Node 可能无法加载 `weapp-tailwindcss@5.2.0` 使用的 ESM 依赖。

### 2.2 推荐命令

在目标工程目录中执行：

```bash
env HBUILDERX_CLI_PATH="/Applications/HBuilderX.app/Contents/MacOS/cli" \
pnpm exec uni-launch mp-weixin
```

例如：

```bash
cd demo/uni-app-x-hbuilderx-tailwindcss3
env HBUILDERX_CLI_PATH="/Applications/HBuilderX.app/Contents/MacOS/cli" \
pnpm exec uni-launch mp-weixin
```

> **注意**：优先使用 `uni-launch mp-weixin`，不要直接依赖 HBuilderX 内部 CLI 命令拼接完整启动流程。

### 2.3 成功标志

日志中出现以下关键信息，说明工程已经成功运行到微信小程序端：

- `UTS编译完毕`
- `正在启动微信开发者工具...`
- `微信开发者工具已启动`
- `ready in ...ms`

## 3. 工程要求

### 3.1 Vite 插件要求

`uni-app x` 的 `HBuilderX` 工程必须在 `vite.config.ts` 中接入 `@dcloudio/vite-plugin-uni`。

最小示例：

```ts
import { defineConfig } from 'vite'
import uniPlugin from '@dcloudio/vite-plugin-uni'

const uni = typeof uniPlugin === 'function' ? uniPlugin : uniPlugin.default

export default defineConfig({
  plugins: [
    uni(),
  ],
})
```

> **注意**：当前环境下，`@dcloudio/vite-plugin-uni` 可能存在默认导出互操作差异，直接写 `import uni from '@dcloudio/vite-plugin-uni'` 不一定稳定。

### 3.2 依赖要求

如果工程要在 `HBuilderX` 下正常解析 `uni-app x` 入口与 `.uvue` 文件，至少应保证以下依赖可解析：

| 依赖 | 作用 |
| --- | --- |
| `@dcloudio/vite-plugin-uni` | 接管 `uni-app x` 的 Vite 编译流程 |
| `vue` | 提供 `createSSRApp` 等运行时依赖 |
| `weapp-tailwindcss` | 当前仓库示例所依赖的样式转译能力 |

### 3.3 Tailwind CSS 4 入口要求

Tailwind CSS 4 示例必须在 `vite.config.ts` 中显式配置 `cssEntries`，并使用项目根目录解析出的绝对路径。HBuilderX 会改变运行时的 `process.cwd()`，不要依赖当前工作目录推导入口 CSS。

```ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import { uniAppX } from 'weapp-tailwindcss/presets'

const projectRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    uni(),
    WeappTailwindcss(
      uniAppX({
        base: projectRoot,
        cssEntries: [
          resolve(projectRoot, 'main.css'),
        ],
        cssOptions: {
          rem2rpx: true,
        },
      }),
    ),
  ],
})
```

## 4. 常见问题

### 4.1 报错 `Rollup failed to resolve import "/main"`

通常说明 `uni-app x` 工程没有正确接入 `uni()` 插件，导致入口 `/main` 没有被 `uni-app x` 编译链识别。

优先检查：

1. `vite.config.ts` 是否引入了 `@dcloudio/vite-plugin-uni`
2. `plugins` 中是否实际执行了 `uni()`

### 4.2 报错 `.uvue` 无法解析

典型报错特征：

```text
Failed to parse source for import analysis
```

这通常也不是 `.uvue` 文件本身的问题，而是 `uni-app x` 的 Vite 插件没有接管该工程。

优先检查：

1. `vite.config.ts` 是否接入 `uni()`
2. `@dcloudio/vite-plugin-uni` 是否已安装并可解析

### 4.3 报错 `uni is not a function`

说明 `@dcloudio/vite-plugin-uni` 的导出形式与当前写法不匹配。

建议使用兼容写法：

```ts
import uniPlugin from '@dcloudio/vite-plugin-uni'

const uni = typeof uniPlugin === 'function' ? uniPlugin : uniPlugin.default
```

### 4.4 `pnpm exec hbuilderx --help` 提示未找到 HBuilderX

这通常说明：

- `HBuilderX` 进程尚未运行，且
- `HBUILDERX_CLI_PATH` 没有设置，或路径无效

优先做法：

```bash
env HBUILDERX_CLI_PATH="/Applications/HBuilderX.app/Contents/MacOS/cli" \
pnpm exec uni-launch mp-weixin
```

### 4.5 仍有样式转译告警，但工程可以启动

当前已观察到一类不会阻塞启动的警告：

| 告警 | 影响 |
| --- | --- |
| 某些动态类未完成转译 | 会影响局部类名输出，但不一定阻塞微信端启动 |

`未检测到 cssEntries` 不应再被当作可接受告警。Tailwind CSS 4 项目应先补齐 `cssEntries` 的绝对路径配置，再继续验证样式链路。

## 5. 维护建议

### 5.1 新增或维护同类示例时

优先对照模板：

- `templates/uni-app-x-hbuilderx`

重点检查以下文件是否齐全且一致：

- `package.json`
- `vite.config.ts`
- `index.html`
- `main.uts`
- `pages.json`
- `manifest.json`

### 5.2 排障顺序

建议按以下顺序排查：

1. 先确认启动命令与工作目录是否正确
2. 再确认 `HBUILDERX_CLI_PATH` 是否有效
3. 再检查 `vite.config.ts` 是否接入 `uni()`
4. 再检查 `@dcloudio/vite-plugin-uni` 与 `vue` 是否存在
5. 最后再处理 Tailwind 转译与动态类名问题

## 6. 总结

本仓库中，`uni-app x` 示例要成功运行到微信小程序端，核心不是单独修改入口文件，而是保证工程被完整识别为 `uni-app x + HBuilderX + Vite` 组合：

| 关键项 | 结论 |
| --- | --- |
| 启动方式 | 使用 `pnpm exec uni-launch mp-weixin` |
| CLI 路径 | 显式设置 `HBUILDERX_CLI_PATH` 更稳定 |
| 核心插件 | 必须接入 `@dcloudio/vite-plugin-uni` 的 `uni()` |
| 基础依赖 | 至少保证 `@dcloudio/vite-plugin-uni` 与 `vue` 可解析 |
| 调试优先级 | 先打通启动链路，再处理样式与动态类告警 |
