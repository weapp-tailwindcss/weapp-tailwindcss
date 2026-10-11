---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: b5b52baff54ec28c0b2dfd67ba8b24a1fad9c8df
regressions:
  - packages/weapp-tailwindcss/test/watch-hmr-iconify-evidence.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-class-evidence.unit.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-regression.unit.test.ts
---

# Iconify HMR 必须证明本轮 class 载体已更新

## 症状

HBuilderX uni-app x VDOM 的 watch 报告将 Iconify 文案更新记录为 4 ms，诊断却是 `trigger: semantic`、`updatedFiles: []`。首次构建的 CSS 已通过 safelist 包含图标和更新前后的 content 选择器，因此原检查无需消费源码变化便能通过。

在基线实现上加入“产物完全不变”的文件级回归后，测试得到 1 ms 的成功结果，证明这是验收假阳性，不能作为 Iconify 热更新通过的依据。

## 根因与纠正

原实现仅在全局 CSS 中查找固定字符串。默认探针对部分框架只写注释或未使用变量，没有证明本轮模板 class 已进入编译产物；等待编译稳定之后也没有重新验证状态。

纠正发生在私有 watch 工具的源输入和产物证据边界：

- 每次运行生成唯一 marker，报告保留 case 身份，class 载体通过转义消除 case 名的平台分隔符；inject 与 content 各使用自己的阶段 marker，阶段身份与图标、content 写入同一个 class 载体。
- 两个阶段分别从原始源码通过已有框架 template mutator 生成，保留 custom mutate 接口；独立源文件必须显式提供自己的 mutator。
- WXML 使用已有模板消费解析器。JS 只接受明确的 `class` / `className` 对象属性字符串，拒绝未使用的裸字符串、间接绑定、重复属性、spread 及计算属性覆盖。已核对本地 Taro React 与 Vue 编译产物中的直接 props 形态。
- 每个阶段要求同一 class 组同时证明当前身份与全部图标、content；safe class 继续复用完整 CSS 签名证明，不能跨节点拼接。
- content 阶段拒绝上一个 inject 载体残留。注入、内容更新和回滚在编译稳定后重新检查，effective 耗时包含稳定后的验证。

真实源码矩阵同时暴露两个 Taro React template mutator 用单引号插入含单引号的 content 类，导致六个平台配置产生非法 JSX。修复位于这两个 JSX 生成点：通过字符串序列化输出属性表达式，不在 Iconify 末端猜测引用上下文或回填占位符。

## 验证

- 基线新增失败用例明确复现“产物未更新仍成功”；修复后同一用例正确拒绝。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-iconify-evidence.unit.test.ts test/watch-hmr-class-evidence.unit.test.ts test/watch-hmr-regression.unit.test.ts --update=none`：191 项通过。
- 补充 computed 属性覆盖反例后单独重跑 Iconify 文件，34 项通过，检查明确 class 载体、阶段残留、稳定后产物丢失与回滚再出现；包含 22 个真实 case 配置的 Vue / UVUE、React TSX、原生 WXML 探针生成，TSX 使用 TypeScript 解析与转译验证引用语义。
- 定向 ESLint 显式禁用 Prettier；执行 `git diff --check` 与 `pnpm agents:check`。
- 严格 TypeScript 源码图检查中，新证据模块、探针模块及测试没有诊断。`extended.ts` 的两条 `exactOptionalPropertyTypes` 错误位于原有配置复制函数，使用基线文件内容对照仍存在；依赖源码图另有既存诊断，不能宣称全图类型检查通过。

### 整合后的真实编译器复验

代码 `886a43d98`、轮次 `5e2a3e08-c1ad-44f6-8e28-30720ba00b85` 在新预检、当前会话真实输入/点击/截图、verify、领取与逐阶段复查后，执行现有 HBuilderX Alpha VDOM 微信 watch 用例。主树整合后 191 项定向回归全部通过；实际运行不跳过构建、仅一次尝试、不加载 profiler，保留原阈值。

本轮 inject、content 和 rollback 均完成稳定后验证。content 的 `updatedFiles` 包含页面 WXML、JS、页面 WXSS 与根 app WXSS；本轮阶段标识与图标、内容在同一 WXML class 载体内成立。产物命中耗时 1897ms，包含稳定后复验的有效耗时 4913ms；回滚为 8074ms / 11210ms，WXML 和 JS 已更新，两个阶段标识均移除。此前固定 CSS 即可通过的 4ms 记录仍保留为无效旧证据。

完整 watch 在 206.53 秒后退出 1，原性能门禁报 `case-template-preferred:hot-update 685ms > 500ms`，因此只有上述产物功能证据通过，整体性能未通过。该流程没有打开实际业务 IDE 页面，不能据此宣称小程序可视 HMR 通过。

原始报告、日志及清理证据保存在 `e2e/.artifacts/uni-app-x-alpha/5e2a3e08-c1ad-44f6-8e28-30720ba00b85/iconify-verified-fixes/`。关联源码恢复为 HEAD 原始字节、工作区干净，采样中的 53 个所属 PID 均退出，临时标签为 0，微信现有服务只读登录检查仍为 true。

## 适用边界

这是编译产物的 class 载体验收，不等价于设备或浏览器已呈现该节点。JS 不解释任意函数、复杂间接绑定或运行可达性；未识别的载体应缺证失败。Web 的 DOM 与计算样式验收由独立链路负责。

本次只修改私有测试工具、测试及复盘，没有修改 demo 或公开包样式输出，不生成 static 基线和公开 change intent。真实编译器复验仅覆盖上述 VDOM 微信产物；其他框架的实际运行与设备可见性不由单测或本轮产物验收替代。

## 规则评估

不新增 AGENTS 规则。现有工程流程已经要求等待本轮 DOM / CSS 或产物一致并保留持久回归；本次将该要求落实为可执行证据检查，避免继续增加只有文本约束、没有失败反例的规则。
