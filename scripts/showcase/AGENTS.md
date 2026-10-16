# Showcase 生成边界

## 适用范围

- 适用于本目录及 `scripts/update-showcase.ts` 对本目录的调用。

## 核心职责

- 解析后的案例渲染、本地图片归属校验，以及图片、共享目录和中文正文的预写与失败回滚。

## 变更原则

- 翻译预检在任何输出改写之前完成；隐藏案例不触发下载。
- 跳过下载只能按稳定评论 ID 复用已发布的本地图片选择，不能从名称、排序或远端 URL 猜测归属。
- 正常下载使用隔离目录；任一图片失败不得发布远端 URL 或清理旧资源。发布失败恢复旧产物，回滚失败保留恢复材料并报错。
- 本地 URL 和文件系统路径分别处理；验证真实文件归属和非空文件，不以存在符号链接代表资源合法。

## 测试要求

- 在临时目录调用真实生成入口，以注入来源和下载器避免网络与正式产物写入。
- 覆盖图片选择、隐藏项、翻译预检、缺图、下载失败、写入失败、替换和回滚失败；路径覆盖 POSIX 与 Windows。

## 推荐验证命令

- `pnpm --filter @weapp-tailwindcss/website exec vitest run scripts/showcase-generation.test.ts scripts/showcase-publication.test.ts scripts/showcase-content.test.ts --update=none`
- `pnpm --filter @weapp-tailwindcss/website typecheck`
- `pnpm agents:check`

## 提交前检查

- 确认回归只改临时夹具，正式 catalog、MDX 和图片未随测试改写。
- 调整生成契约或发布流程时重新验证上述失败边界；不要把可恢复异常下的回滚描述为断电或强杀时的跨文件原子切换。
