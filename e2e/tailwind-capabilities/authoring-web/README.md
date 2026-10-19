# Authoring 浏览器语义验收

`runAuthoringWeb(context, engine)` 为共享的 18 个 authoring 和 11 个真实扫描夹具逐一登记 `authoring/<id>`，产物位于当前 Web 目录下的 `authoring/`。调用方仍负责本轮预检与统一调度。此 runner 自己创建一个后台浏览器，并在 `finally` 关闭。

29 个夹具均已登记独立语义目标。其中 15 个 authoring 夹具使用具体 `expectedDeclarations` 值作为 inline 参考，其余扫描与指令用例使用独立官方编译器、预先声明的候选/指令输入及隔离 CSS 作为参考。产品 CSS 始终由 `weapp-tailwindcss` 在每例独立临时目录内生成，再载入产品 iframe；其它 iframe 分别载入独立参考和无工具类基线。只有参考确实产生不同于基线的可测效果、产品计算值一致、扫描/排除结果正确且浏览器无错误时，该例才能通过。浏览器不支持或参考效果不可测时，逐例记录 `not-run`。

自定义祖先变体与 dark 指令分别验证 before、after、restored。`important` 需要打败产品节点上的普通 inline 声明。主题具体值独立登记；`@theme` 夹具不向产品补入它应自行生成的主题变量。`@reference` 的宿主变量显式登记，只证明消费者的应用效果。截图用于审查，不贡献像素语义通过。

`source-inline` 实际触发 hover/focus 并验证 before、after、restored；读取每个文档后才操作下个文档，避免焦点和指针被参考抢走。`hover-class` 的伪元素读取 `::after` 内容。透明度探针使用独立 `0.37` 基线，避免 `opacity-100` 与默认值相同造成假通过。负向候选必须既不出现在生成结果中、也与基线效果一致；独立参考必须与基线不同。无效业务候选另外声明 `padding:17px` 观测对照并在 oracle 身份中记录，不把该对照注入产品。产品扫描仍只消费真实源码，候选不会从参考、共享目录或渲染探针补入。

扫描语法用例只执行真实文件扫描，再把登记候选用于独立 DOM 探针。TSX 条件、模板插值、数组、映射及 Vue 分支不会在这里经过 React/Vue 编译或执行；它证明扫描生成的 CSS 可被浏览器消费，框架分支切换、组件生命周期和真实页面消费由 `framework-regressions` 等对应框架 E2E 覆盖。`authoring-coverage.json` 的 `runtimeScope` 与 `sourceExecution` 明确记录此边界。

`authoring-coverage.json` 记录全部 29 例的 runtime 和单指令/扫描语法 HMR 范围。此范围仍为 `not-run`；通用候选增删替换、刷新与 WebSocket 证据由独立 Vite HMR runner 提供。本 runner 不通过二次 `generate()` 伪装浏览器热更新。

接入统一 CLI/CI 时，将 `authoringWebProfiles` 纳入 Web 分组选择，并把 `runAuthoringWeb` 的返回报告加入严格结果汇总；异常汇总还需读取 `authoring/report.json`。保存每例 product/reference CSS、oracle 输入摘要、逐态测量和截图。截图只用于审查，不贡献像素语义通过；最终通过数量以本轮真实浏览器报告为准。
