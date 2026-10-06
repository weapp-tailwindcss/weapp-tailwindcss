# @weapp-tailwindcss/cli

## 5.5.12

### Patch Changes

- 将发布包的仓库与问题反馈地址更新为 weapp-tailwindcss 组织下的主仓库，使 npm 包元数据与迁移后的 OIDC 发布来源一致。保留现有包名、导出接口、npm 所有权和文档域名。

- 修复原生 watch 连续更新与停止清理，排除外置 source map 的重建反馈，并在写入前阻止输入、CSS 与 map 路径冲突。Refs #1262、#1263、#1264。

- Updated dependencies:
  - @weapp-tailwindcss/engine@0.1.4
  - @weapp-tailwindcss/logger@2.0.4
  - weapp-tailwindcss@5.5.12

## 5.5.11

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/engine@0.1.3
  - weapp-tailwindcss@5.5.11

## 5.5.10

### Patch Changes

- Updated dependencies:
  - @weapp-tailwindcss/engine@0.1.2
  - weapp-tailwindcss@5.5.10

## 5.5.9

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.9

## 5.5.8

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.8

## 5.5.7

### Patch Changes

- 迁入仅支持 Tailwind CSS 4 的 @weapp-tailwindcss/engine，保留候选提取、扫描和生成会话能力，替换主包、PostCSS 与 CLI 的旧 engine 依赖，并明确生成与平台兼容转换的边界。

- 统一来源扫描基础设施与共享语义契约，修复 Windows glob、qxml、绝对来源排除及配置更新缓存；拆分 PostCSS 子路径和核心扫描职责，解除值依赖循环与核心对构建器的反向引用，CLI 与 PostCSS 复用生成会话扫描并释放资源。

  进一步将通用生成编排与候选状态迁入核心，兼容扫描入口统一使用 AST 来源描述与显式扫描策略。Webpack、Rspack、Gulp 共用真实生成与增量扫描契约，修复 Gulp 禁用自动扫描后的候选泄漏、watch 候选失效，以及 Webpack/Rspack 新增来源文件未触发 CSS 重建的问题。

  生成引擎按内容指纹复用本地配置及插件模块，避免重复遍历和执行未变更依赖；配置或间接依赖更新及显式会话失效仍触发刷新。配置加载器保留 Jiti 转换缓存，每次读取前清理配置的本地模块依赖图，兼顾间接依赖更新正确性与 CommonJS 原生加载性能。

  生成模块缓存的异步上下文在最后一个并发调用结束后停用，避免后续构建继续承担异步跟踪开销；成功与异常路径均释放，并保留并发生成之间的上下文隔离。

  Webpack/Rspack 的来源监听根据 glob 静态前缀注册目录，避免配置基准目录导致整棵项目树进入递归快照；尚未创建的目录登记为缺失依赖，保留新增来源触发生成的行为。

  候选报告采用有限并发读取，避免串行文件等待与构建任务相互阻塞；结果顺序、候选位置及单文件失败报告保持稳定。CSS 来源缓存的配置元数据检查与同步 CSS 读取在同一轮完成，配置修改、删除及重建仍会刷新来源。

  候选删除时仅重建累积输出的编译器，复用同一生成会话的 design system，减少 HMR 重复解析主题和插件的内存分配；源码、配置或依赖失效仍同时刷新编译器与 design system。

- Updated dependencies:
  - @weapp-tailwindcss/engine@0.1.1
  - weapp-tailwindcss@5.5.7

## 5.5.6

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.6

## 5.5.5

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.5

## 5.5.4

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.4

## 5.5.3

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.3

## 5.5.2

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.2

## 5.5.1

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.1

## 5.5.0

### Minor Changes

- 改善开发体验：新增固定 Generic Web target 的 `weapp-tailwindcss/vite/web` 入口，修正 `doctor` 对官方 Tailwind 生成器和 CSS 入口的诊断，并将初始化器默认切换为 Tailwind CSS 4 CSS-first 流程；旧版初始化配置改为通过 `mode: 'legacy'` 显式启用。

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.5.0

## 5.4.2

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.4.2

## 5.4.1

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.4.1

## 5.4.0

### Patch Changes

- 将公开 npm 包的主页和相关文档入口迁移到新的 `https://tw.weapp.dev` 域名，并补齐缺失的包主页元数据。

- Updated dependencies:
  - @weapp-tailwindcss/logger@2.0.3
  - weapp-tailwindcss@5.4.0

## 5.3.6

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.3.6

## 5.3.5

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.3.5

## 5.3.4

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.3.4

## 5.3.3

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.3.3

## 5.3.2

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.3.2

## 5.3.1

### Patch Changes

- Updated dependencies:
  - weapp-tailwindcss@5.3.1

## 5.3.0

### Minor Changes

- ✨ **新增独立的 `@weapp-tailwindcss/cli` 包：默认提供与 Tailwind CSS CLI 对齐的 Web 构建、监听、优化、source map 与 `canonicalize` 能力，并支持通过 `--target weapp` 显式生成小程序兼容 CSS。CLI 命令不再由 `weapp-tailwindcss` 核心包发布。** [#1076](https://github.com/sonofmagic/weapp-tailwindcss/pull/1076) by @sonofmagic
  - 该包此前已经存在 `3.x` 和 `4.0.0-alpha.x` 的旧版原生小程序 Gulp CLI。本次使用 `5.x` 版本线发布新的 Tailwind CSS CLI 兼容实现，避免覆盖旧版本语义或让 npm `latest` 回退到 `0.x`。

### Patch Changes

- 🐛 **统一更新各发布包的 npm 描述与中英文 README，明确 `weapp-tailwindcss` 面向 Web、小程序、React Native、Lynx 与跨端框架的全端 Tailwind CSS 定位。公开包现在默认展示英文 README，并提供统一命名的简体中文入口，同时保留各子包的具体职责边界。** [#1079](https://github.com/sonofmagic/weapp-tailwindcss/pull/1079) by @sonofmagic
- 📦 **Dependencies** [`c2ba271`](https://github.com/sonofmagic/weapp-tailwindcss/commit/c2ba271ac62ba851c23549a8de1038a71bb868d6)
  → `@weapp-tailwindcss/logger@2.0.2`, `weapp-tailwindcss@5.3.0`
