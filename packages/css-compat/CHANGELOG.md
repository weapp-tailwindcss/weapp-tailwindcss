# @weapp-tailwindcss/css-compat

## 0.1.3

### Patch Changes

- 更新公开包的直接依赖及配套开发工具链，保留 catalog 和 workspace 关系。React 18 UI 包的类型声明与现有运行时配对；React Native 包的开发构建使用 Babel 7 与 TypeScript 5.9.3，保持 Expo/Metro 既有配套。框架 peer 支持范围保持现有契约。

  ### @weapp-tailwindcss/css-compat

  - 更新 `dependencies` 的 `postcss-selector-parser`：`^7.1.6` → `^7.1.7`。

  ### @weapp-tailwindcss/debug-uni-app-x

  - 更新 `devDependencies` 的 `vite`：`7.2.7` → `7.3.7`。

  ### @weapp-tailwindcss/engine

  - 更新 `dependencies` 的 `postcss`：`^8.5.30` → `^8.5.32`。

  ### @weapp-tailwindcss/lynx

  - 更新 `devDependencies` 的 `@lynx-js/rspeedy`：`^0.18.1` → `^0.18.3`。

  ### @weapp-tailwindcss/postcss

  - 更新 `dependencies` 的 `autoprefixer`：`^10.6.1` → `^10.6.2`。
  - 更新 `dependencies` 的 `postcss`：`^8.5.30` → `^8.5.32`。
  - 更新 `dependencies` 的 `postcss-selector-parser`：`^7.1.6` → `^7.1.7`。

  ### @weapp-tailwindcss/postcss-calc

  - 更新 `dependencies` 的 `postcss-selector-parser`：`^7.1.6` → `^7.1.7`。
  - 更新 `devDependencies` 的 `eslint`：`^10.12.0` → `^10.13.0`。
  - 更新 `devDependencies` 的 `postcss`：`^8.5.30` → `^8.5.32`。

  ### @weapp-tailwindcss/react-native

  - 更新 `dependencies` 的 `@babel/types`：`^8.0.6` → `^8.0.8`。
  - 更新 `devDependencies` 的 `@babel/core`：`^8.0.7` → `^7.29.7`。
  - 更新 `devDependencies` 的 `@types/react`：`^19.2.18` → `^19.3.0`。
  - 更新 `devDependencies` 的 `react`：`^19.2.8` → `^19.3.1`。
  - 更新 `devDependencies` 的 `typescript`：未声明 → `^5.9.3`。

  ### @weapp-tailwindcss/typography

  - 更新 `dependencies` 的 `magic-string`：`^1.4.3` → `^1.4.5`。
  - 更新 `dependencies` 的 `postcss-selector-parser`：`^7.1.6` → `^7.1.7`。

  ### @weapp-tailwindcss/ui

  - 更新 `devDependencies` 的 `@storybook/addon-a11y`：`^10.6.2` → `^10.6.5`。
  - 更新 `devDependencies` 的 `@storybook/react`：`^10.6.2` → `^10.6.5`。
  - 更新 `devDependencies` 的 `@storybook/react-vite`：`^10.6.2` → `^10.6.5`。
  - 更新 `devDependencies` 的 `@types/react`：`^19.2.18` → `^18.3.31`。
  - 更新 `devDependencies` 的 `@types/react-dom`：`^19.2.5` → `^18.3.7`。
  - 更新 `devDependencies` 的 `storybook`：`^10.6.2` → `^10.6.5`。
  - 更新 `devDependencies` 的 `vite`：`^7.3.6` → `^7.3.7`。

  ### tailwindcss-config

  - 更新 `dependencies` 的 `lilconfig`：`^3.1.3` → `^3.1.4`。

  ### tailwindcss-injector

  - 更新 `dependencies` 的 `magic-string`：`^1.4.3` → `^1.4.5`。

  ### weapp-tailwindcss

  - 更新 `dependencies` 的 `@babel/parser`：`^8.0.7` → `^8.0.8`。
  - 更新 `dependencies` 的 `@babel/types`：`^8.0.6` → `^8.0.8`。
  - 更新 `dependencies` 的 `@vue/compiler-dom`：`^3.5.41` → `^3.5.44`。
  - 更新 `dependencies` 的 `magic-string`：`^1.4.3` → `^1.4.5`。
  - 更新 `dependencies` 的 `oxc-parser`：`^0.154.0` → `^0.156.0`。
  - 更新 `devDependencies` 的 `vite`：`^7.3.6` → `^7.3.7`。
  - 更新 `devDependencies` 的 `webpack`：`5.105.4` → `5.112.2`。

  ### wetw

  - 更新 `dependencies` 的 `@inquirer/prompts`：`^8.7.3` → `^8.7.5`。

- 按 CSS token 身份分析自定义属性和注册指令，保留转义覆盖、元素相关 attr()、空声明冲突及未证明稳定的完整依赖链，避免跨元素或过早删除定义改变主题语义。
  静态百分比颜色权重复用完整依赖分析并乘以原色透明度，仅在小程序生成链降低可完全证明的颜色能力分支；增量缓存记录静态兼容上下文，局部覆盖撤销资格后重新转换已有样式，不依赖是否启用 calc。
  样式结果缓存先按完整原始输入、配置及当前来源快照判断命中，避免命中后仍重复执行颜色资格分析；作者插件仍逐轮执行。新合成来源或携带消息的根节点结果不进入缓存，防止后续调用沿用旧输入或警告节点。来源追踪只缓存完整选择器的不可变类名解析结果，并同时限制条目数与字符总量，每轮继续查询当前来源映射，不保留旧资产的路径或可变语法树。
  主题资格分析先排除不含目标函数的普通值，直接颜色和数学函数不再逐项构造变量及关键字语法树；转义、注释、元素相关函数和完整变量依赖继续走原有 token 解析，保留动态覆盖及循环的安全边界。
  现代颜色兼容分析直接复用已有函数节点分类，普通非颜色声明不再创建颜色语法树；未修改的输入复用当前节点检验，转换器生成的新文本仍重新解析，避免动态透明度 fallback 中的现代子函数被不透明替换节点隐藏。
  全部注册、描述符和变量依赖保持原文，前缀不推断作者归属；默认值兼容仅匹配真实编译器合同中的完整签名，条件或冲突注册否决默认合成，保留层时使用最低优先级层且重复处理幂等。通用 calc 插件提供声明过滤回调，使调用方明确保护注册描述符，不将无效初值改成有效注册。
  legacy layer 内核保留注册子树的原子边界，禁止把其中无效嵌套描述符提升成有效注册；默认兼容块保留 import 的合法顺序，不压过作者已有的级联层。
  保留公开变量名上的显式 initial，避免破坏阻断继承和 use-site fallback；渐变位置仅在当前完整消费图能够证明用途时兼容，转义身份、别名、注册描述符、style 查询、循环及不完整 chunk 均参与判断。多类渐变共用空位置时保留原 token，不按局部规则推测最终级联，也不引入与 CSSOM 更新失联的镜像变量。
  Webpack/Rspack 在本轮 CSS 导入合并后、压缩和 Lynx 编码前重新核对完整渐变消费图，通过构建器资产 API 与精确编辑保留来源映射；兼容处理计入真实 HMR 耗时并在结束回调之前完成。
  对只包含变量声明的 `:root, :host` 根组，在完成依赖分析后保留 Lynx encoder 支持的根分支，避免动态主题的初始定义被整组丢弃。

  Lynx 诊断通过构建图的实际已发出模板和固定解码器核对声明，分别保留编码日志、静默删除与无法确证的结果；严格模式只拒绝确证被删除的业务样式。解码器资源与许可证随发布包交付，来源位置绑定本轮输入及 source map；同时对齐 Node 必装依赖链、构建插件要求和中英文支持边界。
  核心入口复用 PostCSS 的只读规则证据接口，保持原生适配包的依赖边界；诊断补充可审计的版本来源、拒绝原因和保守建议。

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
