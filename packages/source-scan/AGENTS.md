# Source Scan 规则

## 适用范围
适用于本包源码、测试与构建配置。

## 核心职责
维护来源描述、路径身份、glob、匹配、排除与分组；通过调用方提供的枚举函数展开文件。

## 变更原则
不依赖 engine、PostCSS、主包或构建器。不解析 CSS，不提取类名。文件系统路径使用 node:path；glob 边界才转换分隔符。

## 测试要求
覆盖 Windows/POSIX、绝对与相对 glob、排除规则、显式空来源和删除后的符号链接路径，并消费共享扫描契约。

## 推荐验证命令
- `pnpm --filter @weapp-tailwindcss/source-scan test`
- `pnpm --filter @weapp-tailwindcss/source-scan build`
- `pnpm --filter @weapp-tailwindcss/source-scan typecheck`

## 提交前检查
保持扫描策略显式，不将不同入口的历史默认值隐藏到路径工具中。
