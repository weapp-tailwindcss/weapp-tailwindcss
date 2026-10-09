# CSS 兼容内核规则

## 适用范围

适用于 `packages/css-compat` 的源码、测试、打包与验证脚本。

## 核心职责

首期只拥有框架无关 layer 注册、ordered 编译、诊断与显式 legacy 算法；不拥有生成器、扫描、runtime 或 bundler 生命周期。

## 变更原则

- 核只接收一个已合并级联作用域的 PostCSS Root；不读取文件、环境或全局注册表。
- ordered 在全部检查通过后提交 AST；错误不得留下部分修改。
- legacy 保留已发布 anchor 行为；改变默认值需另行迁移。
- 来源不明时不猜测 polyfill；合法作者选择器不得被当作占位清理。
- CSS parser 依赖限于实际 AST 能力；MDN 数据仅开发期生成精简属性表。

## 测试要求

覆盖普通/important/未分层、条件、标识符、descriptor、source map、幂等及 strict 原子性；语义对照使用三浏览器，打包在 workspace 外检查。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/css-compat test`
- `pnpm --filter @weapp-tailwindcss/css-compat build`
- `pnpm --filter @weapp-tailwindcss/css-compat typecheck`
- `pnpm --filter @weapp-tailwindcss/css-compat test:package`
- `pnpm --filter @weapp-tailwindcss/css-compat test:consumers`
- `pnpm --filter @weapp-tailwindcss/css-compat test:browser`

## 提交前检查

检查 exports、双端声明、依赖树和中文 change intent；架构变动执行仓库根的 architecture:check 脚本。测试不得静默跳过缺失浏览器，也不得声称包级证据是微信验收。
