# Tailwind CSS 4.3.4 初始化兼容补丁

当前模板冻结使用 npm 稳定版 `weapp-tailwindcss@5.6.3`，其间接依赖 `@weapp-tailwindcss/postcss@3.4.3` 尚未包含 Tailwind CSS 4.3.4 的初始化探针修复。

`@weapp-tailwindcss__postcss@3.4.3.patch` 仅修改该精确版本发布包的 ESM/CJS 两处 `margin-trim` 正则，完整匹配 `inline` 或 `block`，与仓库兼容层修复一致。四个探针仍须同时存在；不修改变量映射、默认值、生成入口或直接稳定包身份。pnpm 在独立锁文件中记录补丁哈希，安装后验收通过公开 ESM/CJS 样式处理入口检查新旧探针、默认值和无关条件。

删除条件：模板独立锁实际升级到已包含此修复的正式 PostCSS 版本，移除对应 `patchedDependencies`、补丁文件与旧锁记录后，冻结安装、双入口回归和模板产物基线均通过。不得仅因主仓库源码已修复就提前移除。
