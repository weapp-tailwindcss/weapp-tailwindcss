# Authoring 浏览器语义验收

`runAuthoringWeb(context, engine)` 为共享的 18 个 authoring 和 11 个真实扫描夹具逐一登记 `authoring/<id>`，产物位于当前 Web 目录下的 `authoring/`。调用方仍负责本轮预检与统一调度。此 runner 自己创建一个后台浏览器，并在 `finally` 关闭。

已有 15 个 authoring 夹具具备具体 `expectedDeclarations` 值。产品 CSS 由 `weapp-tailwindcss` 在每例独立临时目录内生成，再载入产品 iframe；其它 iframe 分别使用预先声明的 inline 参考和无工具类基线。参考不载入产品 CSS，产品也不接受参考的声明。只有参考确实产生不同于基线的可测效果、产品计算值一致、扫描/排除结果正确且浏览器无错误时，该例才能通过。

自定义祖先变体与 dark 指令分别验证 before、after、restored。`important` 需要打败产品节点上的普通 inline 声明。主题具体值独立登记；`@theme` 夹具不向产品补入它应自行生成的主题变量。`@reference` 的宿主变量显式登记，只证明消费者的应用效果。截图用于审查，不贡献像素语义通过。

`source-inline`、`source-not-inline`、`theme-function` 尚缺完整具体值，11 个扫描语法也尚缺独立运行时值，因此保留 `not-run`。扫描生成已由独立官方参考检查完整声明、条件和依赖；产品扫描仍只消费真实源码，候选不会从参考、共享目录或渲染探针补入。

`authoring-coverage.json` 记录全部 29 例，并把 HMR 标为 `not-run`。本 runner 不启动开发服务器，也不通过二次 `generate()` 伪装增删替换、浏览器热更新或刷新。该部分必须继续接入仓库现有 Vite/watch 真链路。

接入统一 CLI/CI 时，将 `authoringWebProfiles` 纳入 Web 分组选择，并把 `runAuthoringWeb` 的返回报告加入严格结果汇总；异常汇总还需读取 `authoring/report.json`。默认 29 例报告中的未执行项应保留，不能把已实现的 15 例等同于全部 authoring/scanning 的浏览器验收。
