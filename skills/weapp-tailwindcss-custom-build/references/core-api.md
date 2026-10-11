# Core API 与构建生命周期

## 适用边界

普通 uni-app、Taro、Mpx、weapp-vite 或原生 Gulp 项目优先用对应插件。Core API 适合自研 bundler、批处理平台或需要掌管内存产物的适配器。

## 框架 compiler

```ts
import path from 'node:path'
import { createCompiler } from 'weapp-tailwindcss/core'

const root = process.cwd()
const compiler = createCompiler()

const generated = await compiler.generate({
  id: 'virtual:styles/main',
  sourceOptions: {
    projectRoot: root,
    cssEntries: [path.resolve(root, 'src/tailwind.css')],
  },
  candidates: ['p-4', 'w-[10px]'],
  scanSources: false,
  target: 'web',
})
```

一个构建周期复用一个 compiler；文件系统路径用 `node:path` 构造，示例中的 root ID 则是无需规范化的逻辑 module ID。

官方 Vite、Webpack、Rspack 和 Gulp 适配器在默认 graph 模式下也复用这一 compiler session。它们只把构建图确认的 source、依赖和 candidates 交给 core，并由各自的 bundler API 写回 CSS/模板/JavaScript；第三方适配器可以采用相同模型，但不应把模块图或产物所有权转移给 core。

## 调用时序

1. 框架从模块图确定一个逻辑样式 root 及其实际 candidates。
2. `generate()` 生成 `web`、`weapp` 或 `tailwind` CSS，并提交递增 revision。
3. 框架运行自己的 PostCSS 后，把同一个 `snapshot` 交给 `transformCss()` 或 `transformCssRoot()`；小程序目标默认执行 CSS 最终化，也可传入 `finalize: false` 保留构建期 at-rule。
4. 从模块图投影实际可达的样式 root，用 `mergeSnapshots()` 合并普通分包；独立分包保持独立 snapshot。
5. `transformTemplate()` 与 `transformJavaScript()` 消费投影后的同一 snapshot。
6. 检查 JS `error`、`map`、`linked`，再通过 bundler API 写回。

## Watch 与释放

```ts
const affectedRoots = compiler.invalidate(changedModuleIds)

for (const rootId of affectedRoots) {
  // 使用框架掌握的新 source/candidates 重新 generate(rootId)
}

await compiler.remove(removedRootId)
await compiler.dispose()
```

`invalidate()` 同时精确匹配 root/dependency ID，并按 snapshot 中的 `sources` glob 匹配文件变化；root/dependency ID 仍不规范化。`remove()` 和 `dispose()` 幂等，等待进行中的工作结束；开始释放后拒绝新任务。

`sourceOptions.cssSources` 可传入内存 CSS source 及其 `base`、`file`、`dependencies`，适合 virtual module 和尚未写回磁盘的 HMR 内容。

## 返回值与错误

- `generate()`：CSS、raw CSS、incremental CSS、revision、依赖、source patterns、缓存复用状态和 snapshot。
- `transformCss()` / `transformCssRoot()`：PostCSS Result；Root 输入和输出 AST 不共享可变节点。
- `transformTemplate()`：字符串。
- `transformJavaScript()`：现有 `JsHandlerResult`；解析失败时 `code` 保持原文，调用方必须检查 `error`。
- `linked`：跨模块分析结果，由调用方交回模块图，不能在后置阶段临时读取源码重建。

## class set 安全边界

- snapshot 集合来自 Tailwind 生成或验证结果，公开视图不可变且与内部 Set 隔离。
- API、路由、资源路径、MIME、日志文本不得进入集合。
- `alwaysEscape` 只适合输入确定全部是 class 的专用步骤，不用于普通业务 JS。
- 精确冲突字符串使用 `weappTwIgnore` 或 `jsPreserveClass`，不要扩大扫描。

## 兼容 `createContext()`

`createContext()` 保留原有自动 runtime 收集模式，适合已有脚本。新框架适配优先使用 compiler，避免 CSS 转换后再次收集 classSet。不要在一个生成事务中混用 context 的自动集合与 compiler snapshot。

## Bundler 数据所有权

| 数据 | 获取阶段 |
| --- | --- |
| 源码内容 | `load`、`transform`、loader、明确扫描层 |
| 模块关系 | ModuleInfo/ModuleGraph、chunk metadata、loader dependency API |
| CSS asset | transform result、compilation asset、bundle asset、Vinyl file |
| HMR | `watchChange`、`handleHotUpdate`、watch graph |
| 写回 | loader result、`emitFile`、asset update、stream file |

不要硬编码 `src/pages` 推导关系，不要直接用 `fs` 修改输出目录。

## 增量依赖索引

watch 适配器需要维护“候选来源 -> runtime set -> 模板/JavaScript 消费者”的依赖索引。候选新增、删除或 Tailwind 配置变化时，先刷新 runtime set，再让所有依赖该集合的模板和 JavaScript 重新转换；不能只处理触发 watch 事件的那个文件。

## Scanner 与 source candidates

- 从 Tailwind Scanner 或 generator source metadata 获取实际扫描文件，不为 transform/HMR 重新发明 glob。
- 初始扫描、transform filter、watchChange 与 handleHotUpdate 共用同一规范化模块身份。
- 尊重 `.gitignore` 和 Scanner 排除结果；只有显式 `source()` / `@source` 才允许把 monorepo 外部依赖纳入。
- 文件系统路径用 `node:path` 处理；module id、asset name 与 URL 只在明确逻辑边界规范化为 `/`。

Rspack adapter 处理 rule 时必须支持字符串、正则、函数、数组与组合 condition，并保证重复应用 loader/plugin patch 后结果不变。
