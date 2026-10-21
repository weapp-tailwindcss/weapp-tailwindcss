# 原生 Autofill 验收

Chromium 专属 `runtime/autofill-native-outline` 使用产品生成器与标准 `:autofill`。默认 headless-shell 不含原生 Autofill 域，统一 suite 选中本组时复用 extended 预检已检查的完整 `chromium.executablePath()`，仍为 `headless:true`。本组只创建一个临时隔离 context/page，finally 关闭；不读取用户 profile、凭据或地址。`Autofill.trigger(address)` 使用虚构地址且不保存地址，不需要 persistent profile。

原始证据包含 enable/trigger/disable 回执、frame/backend node 身份、`addressFormFilled`、renderer 字段值、标准伪类、可信事件、两帧绘制及三阶段 PNG。trigger成功和事件value都不能单独证明renderer应用；先等待原生事件及全部预声明字段的实际值/标准伪类，再采集。协议事件与状态共享顺序日志，拒绝迟到事件补证。

候选 given-name 与独立 CSS family-name 参考均检查 `3px solid #123456`；同表单email是已填充无 class 对照，另一表单的off字段是带候选但未填充的对照。四边各三条outline与外侧白底分别采样，不依赖浏览器内置背景。七个已填充字段均通过真实键盘编辑恢复，要求有序可信keydown、beforeinput和input，禁止fill/value赋值/reset替代。PNG还检查本轮run、phase、CSS hash色条。

生产replay复读CSS、JSON与PNG后重算；统一报告与coverage门禁调用同一重放。协议失败、事件/RAF超时和关闭失败均保留，不能靠可见节点或cached passed通过。Firefox/WebKit继续not-run；fixture-defined不能解释成实际运行成功。

定向合同：`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-web-autofill.test.ts e2e/tailwind-web-autofill-protocol.test.ts e2e/tailwind-web-autofill-replay.test.ts e2e/tailwind-web-autofill-runner.test.ts --update=none`。

实际入口需fresh extended预检、当前会话computer use与verify：`pnpm e2e:tailwind --preflight-report <本轮报告> --target web-chromium --case '^runtime/autofill-native-outline$'`。
