---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1330
baseline: 1d9d9f06a0590589ddf4540dae9461862313ca70
regressions:
  - packages/postcss/test/scoped-css-signature-storage.test.ts
  - packages/postcss/test/scoped-css-string-coverage.test.ts
  - packages/postcss/test/scoped-css-signature-lifecycle.test.ts
---

# PR #1330 的 CSS 覆盖签名分配

## 症状

提交 `1d9d9f06a0590589ddf4540dae9461862313ca70` 的 [Uni 正式性能检查](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41796391305/job/126462551974)中，三轮 HMR 的峰值 RSS 中位数为 1162.43→1269.45MB，稳态为 1056.91→1151.46MB。内置反向确认仍超出原有 5% 与 64MB 门槛：峰值 1088.30→1168.78MB，稳态 980.39→1056.80MB。`finalize.rootCss` 各轮也持续多耗时数毫秒，需要定位处理成本，不能反复重跑直到通过。

## 根因与纠正

本地对真实 Uni CSS 的 CPU、分配与保留对象采样发现两项可重现成本：值签名保留完整 token 元组及长类型名；根覆盖索引建成后丢弃解析上下文，各组件又重新 tokenize 根中已经出现的值。coverage 对象数量相同只能排除显式条目增长，不能排除这些临时分配。

修复将值签名改为流式读取 token，以类型码和 UTF-16 长度前缀保存身份。字符串仍使用 CSS 解码值，空白 token 仍归一为单空格，其它 token 保留原文；有效与无效输入单独标记。规则、声明、优先级、祖先与节点结构继续使用原比较语义。

根覆盖索引通过私有 WeakMap 保留根值上下文。每个目标取得独立子上下文，只读查根值；未知值只进入自己的 Map，不反写根缓存。因此调用方长期复用 `preparedCoverage` 时，目标新值不会持续累积。容器和祖先按当前 AST 实时计算，禁止缓存清理前的子树。

尝试过的多层声明缓存、规则 tuple 编码与完整递归字符串编码没有稳定降低保留内存，未采用。

## 验证

- macOS、Node 24.22.1，真实 8 份 Uni static CSS，总约 53KB。50 次相同流程的 heap sampling 中，原实现累计采样分配 670.9MB，紧凑值加只读根缓存为 435.9MB；中位耗时 6.40→3.79ms。另一个 29KB CSS 的 30 份覆盖索引保留对象测量为 18.01→13.61MB。两者是局部实验，不能直接换算进程 RSS。
- 1444 对值身份关系和真实 CSS 覆盖判断与旧实现一致。新增长 token 存储回归在旧实现得到 92180 字符，超出 32768 字符预算；修复后通过。新回归还验证根命中不重新 tokenize、目标独有值不回流、复制索引的兼容回退、祖先改名及节点重挂。
- 包级命令 `pnpm --filter @weapp-tailwindcss/postcss test --update=none --coverage.enabled=false` 在包含本次未提交修复的 worktree 通过 2190 项，3 项既有条件跳过；未执行本地全端设备验收。构建和当前新 head 的远端验收另外核对。
- [自然 GC 诊断](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41800195636)保持原预算。正向 RSS 上升，反向峰值差异变为 -0.38%，轮末 heap 大小也反转；两轮 current 均多约 34–36 次 minor GC。这说明相位会影响观察结果，也支持存在分配压力，但没有调用栈证据将全部 RSS 差异归因于覆盖签名。诊断通过不替代正式失败。
- 首次诊断 dispatch 错带仅供 weapp-vite input-only 使用的 `current_ref`，在 matrix 输入验证失败，未执行 Uni；修正后才得到上述诊断。配置失败记录保留于 [原 run](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41799786635)。

## 适用边界

本次改变覆盖证明的存储和复用成本，未修改 demo、样式输出预期或性能阈值。现有字符串、声明顺序、条件祖先及可变 AST 回归必须保持。是否消除真实 HMR RSS 回归，以修复提交的正式基准和完整 CI 为准。

## 规则评估

不新增 AGENTS 规则。现有“性能优化与语义边界”已要求保留失败、有限确认及真实框架验证；用可执行的缓存归属和存储边界回归约束实现。
