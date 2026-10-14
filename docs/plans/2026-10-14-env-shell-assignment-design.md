# #1296 的 shell 赋值前缀修复设计

目标是让 script 信号只来自实际命令位置。`"NODE_ENV=production" weapp-vite build` 的首词是命令，后续框架名是参数，不能覆盖 Taro 依赖；`NODE_ENV="production" weapp-vite build` 则保留合法赋值后的框架命令。

## 方案与边界

在现有 tokenizer 中记录 `shellAssignment`：仅未引用、未转义的变量名与等号构成 shell 赋值，等号之后的值引用不改变判定。续行不引入引用状态，token flush 时重置标记。每段命令和递归 shell payload 使用同一词法规则。

`env`、`cross-env` 和 `cross-env-shell` 接收 shell 去引用后的参数，继续按参数值匹配赋值；pnpm/npx 的命令参数不新增赋值跳过。保持现有框架优先级、普通检测与报告的共享规则、零生产依赖及 ESM/CJS 导出。

直接拒绝所有 quoted token 会破坏合法值引用与 wrapper 参数；引入完整 shell 解析依赖会扩大环境包职责。保留现有扫描器并增加词法标记，修复已确认的输入边界。

## 验证

先记录基线失败，再执行 tokenizer、package 谓词、报告候选与主包兼容回归。覆盖整词引用、变量名局部/空引用、等号引用与转义、值引用/转义、续行、命令链及嵌套包装。

构建后执行 env 的持久 tarball 回归，并在仓库外通过 env、主包根及 framework 的 ESM/CJS 六入口复验原反例与合法对照。继续验证 strict NodeNext .mts/.cts、受影响包类型和架构边界，并等待 PR 当前 head 的全部启用检查。
