# @weapp-tailwindcss/engine

## 0.1.5

### Patch Changes

- 限制源码候选扫描与 Engine 原始候选补扫、无方括号任意值补扫、位置报告的并发文件读取，避免多个构建入口同时扫描时耗尽文件描述符；保留全部候选、来源隔离和报告顺序。

  Webpack watch 扫描失败时等待在途操作结束，保留原始错误，并在整轮成功后一起发布候选快照和文件元数据，避免失败后的重试漏掉变更。

## 0.1.4

### Patch Changes

- 更新依赖。

  ### @weapp-tailwindcss/engine

  - 更新 dependencies 中的 `postcss`：`catalog:postcss85tilde`，`范围 ^8.5.28`，`锁定 8.5.28` → `catalog:postcss85tilde`，`范围 ^8.5.29`，`锁定 8.5.29`。

  ### @weapp-tailwindcss/postcss

  - 更新 dependencies 中的 `@csstools/css-color-parser`：`catalog:csstools`，`范围 ^4.2.5`，`锁定 4.2.5(@csstools/css-parser-algorithms@4.0.2(@csstools/css-tokenizer@4.0.2))(@csstools/css-tokenizer@4.0.2)` → `catalog:csstools`，`范围 ^4.2.6`，`锁定 4.2.6(@csstools/css-parser-algorithms@4.0.2(@csstools/css-tokenizer@4.0.2))(@csstools/css-tokenizer@4.0.2)`。
  - 更新 dependencies 中的 `autoprefixer`：`catalog:autoprefixer10`，`范围 ^10.6.1`，`锁定 10.6.1(postcss@8.5.28)` → `catalog:autoprefixer10`，`范围 ^10.6.1`，`锁定 10.6.1(postcss@8.5.29)`。
  - 更新 dependencies 中的 `postcss`：`catalog:postcss85tilde`，`范围 ^8.5.28`，`锁定 8.5.28` → `catalog:postcss85tilde`，`范围 ^8.5.29`，`锁定 8.5.29`。
  - 更新 dependencies 中的 `postcss-load-config`：`catalog:buildUtilities`，`范围 ^6.0.1`，`锁定 6.0.1(jiti@2.7.0)(postcss@8.5.28)(tsx@4.23.15)(yaml@2.9.1)` → `catalog:buildUtilities`，`范围 ^6.0.1`，`锁定 6.0.1(jiti@2.7.0)(postcss@8.5.29)(tsx@4.23.15)(yaml@2.9.1)`。
  - 更新 dependencies 中的 `postcss-preset-env`：`catalog:postcssUtilities`，`范围 ^11.5.5`，`锁定 11.5.5(postcss@8.5.28)` → `catalog:postcssUtilities`，`范围 ^11.6.1`，`锁定 11.6.1(postcss@8.5.29)`。
  - 更新 dependencies 中的 `postcss-pxtrans`：`catalog:postcssCompat`，`范围 ^1.0.6`，`锁定 1.0.6(postcss@8.5.28)` → `catalog:postcssCompat`，`范围 ^1.0.6`，`锁定 1.0.6(postcss@8.5.29)`。
  - 更新 dependencies 中的 `postcss-rem-to-responsive-pixel`：`catalog:postcssRem`，`范围 ^7.0.7`，`锁定 7.0.7(postcss@8.5.28)` → `catalog:postcssRem`，`范围 ^7.0.7`，`锁定 7.0.7(postcss@8.5.29)`。
  - 更新 dependencies 中的 `postcss-rule-unit-converter`：`catalog:postcssCompat`，`范围 ^0.2.5`，`锁定 0.2.5(postcss@8.5.28)` → `catalog:postcssCompat`，`范围 ^0.2.5`，`锁定 0.2.5(postcss@8.5.29)`。
  - 更新 dependencies 中的 `postcss-scss`：`catalog:postcssCompat`，`范围 ^4.0.9`，`锁定 4.0.9(postcss@8.5.28)` → `catalog:postcssCompat`，`范围 ^4.0.9`，`锁定 4.0.9(postcss@8.5.29)`。
  - 更新 devDependencies 中的 `@csstools/postcss-is-pseudo-class`：`^6.0.1`，`锁定 6.0.1(postcss@8.5.28)` → `^6.0.3`，`锁定 6.0.3(postcss@8.5.29)`。
  - 更新 devDependencies 中的 `postcss-custom-properties`：`^15.0.3`，`锁定 15.0.3(postcss@8.5.28)` → `^15.0.4`，`锁定 15.0.4(postcss@8.5.29)`。

  ### @weapp-tailwindcss/postcss-calc

  - 更新 devDependencies 中的 `@eslint/js`：`^10.0.1`，`锁定 10.0.1(eslint@10.11.0(jiti@2.7.0)(supports-color@10.2.2))` → `^10.0.1`，`锁定 10.0.1(eslint@10.12.0(jiti@2.7.0)(supports-color@10.2.2))`。
  - 更新 devDependencies 中的 `eslint`：`catalog:eslint10`，`范围 ^10.11.0`，`锁定 10.11.0(jiti@2.7.0)(supports-color@10.2.2)` → `catalog:eslint10`，`范围 ^10.12.0`，`锁定 10.12.0(jiti@2.7.0)(supports-color@10.2.2)`。
  - 更新 devDependencies 中的 `eslint-config-prettier`：`^10.1.8`，`锁定 10.1.8(eslint@10.11.0(jiti@2.7.0)(supports-color@10.2.2))` → `^10.1.8`，`锁定 10.1.8(eslint@10.12.0(jiti@2.7.0)(supports-color@10.2.2))`。
  - 更新 devDependencies 中的 `postcss`：`^8.5.28`，`锁定 8.5.28` → `^8.5.29`，`锁定 8.5.29`。
  - 更新 peerDependencies 中的 `postcss`：`^8.4.38`，`锁定 8.5.28` → `^8.4.38`，`锁定 8.5.29`。

  ### @weapp-tailwindcss/typography

  - 更新 dependencies 中的 `magic-string`：`catalog:buildUtilities`，`范围 ^1.4.2`，`锁定 1.4.2` → `catalog:buildUtilities`，`范围 ^1.4.3`，`锁定 1.4.3`。

  ### tailwindcss-injector

  - 更新 dependencies 中的 `magic-string`：`catalog:buildUtilities`，`范围 ^1.4.2`，`锁定 1.4.2` → `catalog:buildUtilities`，`范围 ^1.4.3`，`锁定 1.4.3`。

  ### weapp-tailwindcss

  - 更新 dependencies 中的 `magic-string`：`catalog:buildUtilities`，`范围 ^1.4.2`，`锁定 1.4.2` → `catalog:buildUtilities`，`范围 ^1.4.3`，`锁定 1.4.3`。

  ### wetw

  - 更新 dependencies 中的 `@inquirer/prompts`：`catalog:inquirerPrompts`，`范围 ^8.7.2`，`锁定 8.7.2(@types/node@26.6.4)` → `catalog:inquirerPrompts`，`范围 ^8.7.3`，`锁定 8.7.3(@types/node@26.6.4)`。

- 将发布包的仓库与问题反馈地址更新为 weapp-tailwindcss 组织下的主仓库，使 npm 包元数据与迁移后的 OIDC 发布来源一致。保留现有包名、导出接口、npm 所有权和文档域名。

- 按实际生成依赖局部失效会话，保留无关入口的编译状态；依赖归属未知、生成失败、仍在执行和仅做过候选校验时继续保守失效。修复共享 `.cjs` 配置在刷新或删除后的旧模块读取，并避免生成失败的清理链产生未处理的 Promise 拒绝。

- 修复 uni-app x 自动局部 utility 别名按模板出现顺序生成，导致同优先级样式覆盖顺序与 Tailwind 不一致的问题。根据当前实际生成来源、主题和目标兼容候选的 Tailwind 排名，稳定排序同一父级内连续的自动局部规则，保留作者规则、未知排名和层叠边界；作者样式重放同时清理内部排序标记，避免标记进入最终产物。

- 将 uni-app x 局部 utility 排序接入生成会话，复用该扫描模式实际 CSS 的 design system，避免排序与候选校验重复加载。新增可选的非语义来源准备回调，保留完整来源身份、平台候选规范化、依赖失效与失败重试；候选删除时仅重建编译器，复用已准备的 CSS。会话在平台或规范化配置变化后重建，失效或释放后的异步结果不再进入当前缓存。

- Updated dependencies:
  - @weapp-tailwindcss/source-scan@0.1.2

## 0.1.3

### Patch Changes

- 为跨会话 design system、模块解析、CSS 入口以及 PostCSS 配置和管线复用增加容量上限与最近使用淘汰，避免长期 watch 持续保留旧配置和旧入口；失败任务仅清除自身缓存，不影响更新后的请求。

  同次创建 PostCSS 处理器和管线时复用已计算的配置签名，减少重复遍历嵌套配置。

## 0.1.2

### Patch Changes

- 修复 uni-app x 每个 SFC 转换都强制重建运行时、反复扫描项目的问题：同一失效版本共享类名集合和刷新任务，watch 与 HMR 在生命周期入口登记失效，模块转换继续补充生成器确认的当前候选。加入过期任务隔离、失败重试和会话释放，保留局部样式、自定义属性和动态类名更新。Refs #1245

  修复 Tailwind CSS 4 的 design system 未随配置间接依赖变化而失效的问题，并让候选有效性缓存绑定实际 design system，避免缓存复用后旧类残留或新类缺失。

## 0.1.1

### Patch Changes

- 迁入仅支持 Tailwind CSS 4 的 @weapp-tailwindcss/engine，保留候选提取、扫描和生成会话能力，替换主包、PostCSS 与 CLI 的旧 engine 依赖，并明确生成与平台兼容转换的边界。

- 统一来源扫描基础设施与共享语义契约，修复 Windows glob、qxml、绝对来源排除及配置更新缓存；拆分 PostCSS 子路径和核心扫描职责，解除值依赖循环与核心对构建器的反向引用，CLI 与 PostCSS 复用生成会话扫描并释放资源。

  进一步将通用生成编排与候选状态迁入核心，兼容扫描入口统一使用 AST 来源描述与显式扫描策略。Webpack、Rspack、Gulp 共用真实生成与增量扫描契约，修复 Gulp 禁用自动扫描后的候选泄漏、watch 候选失效，以及 Webpack/Rspack 新增来源文件未触发 CSS 重建的问题。

  生成引擎按内容指纹复用本地配置及插件模块，避免重复遍历和执行未变更依赖；配置或间接依赖更新及显式会话失效仍触发刷新。配置加载器保留 Jiti 转换缓存，每次读取前清理配置的本地模块依赖图，兼顾间接依赖更新正确性与 CommonJS 原生加载性能。

  生成模块缓存的异步上下文在最后一个并发调用结束后停用，避免后续构建继续承担异步跟踪开销；成功与异常路径均释放，并保留并发生成之间的上下文隔离。

  Webpack/Rspack 的来源监听根据 glob 静态前缀注册目录，避免配置基准目录导致整棵项目树进入递归快照；尚未创建的目录登记为缺失依赖，保留新增来源触发生成的行为。

  候选报告采用有限并发读取，避免串行文件等待与构建任务相互阻塞；结果顺序、候选位置及单文件失败报告保持稳定。CSS 来源缓存的配置元数据检查与同步 CSS 读取在同一轮完成，配置修改、删除及重建仍会刷新来源。

  候选删除时仅重建累积输出的编译器，复用同一生成会话的 design system，减少 HMR 重复解析主题和插件的内存分配；源码、配置或依赖失效仍同时刷新编译器与 design system。

- 修复生成扫描在枚举后遇到文件或父目录删除时抛出 ENOENT、ENOTDIR 的竞态。忽略本轮已消失的候选来源，保留依赖身份供文件重建使用；权限和 I/O 错误仍正常抛出。

- Updated dependencies:
  - @weapp-tailwindcss/source-scan@0.1.1
