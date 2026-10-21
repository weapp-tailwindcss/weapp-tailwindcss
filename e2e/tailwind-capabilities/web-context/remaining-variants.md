# 剩余 6 类变体的语义验收计划

本文件记录 gold 夹具与独立 browser context 夹具合并后，仍缺少运行时语义证据的 6 个 Tailwind CSS 4.3.3 variant roots。机器可读的逐项计划在 [`remaining-variants.ts`](./remaining-variants.ts)。这些条目在各自登记的引擎仍是 `not-run`，不是已验证能力，也不是 `unsupported` 声明。starting 与 details-content 已迁入独立 lifecycle runner；此处保留需要额外原生环境或隐私证据的缺口。

判断范围是特定变体在特定引擎的真实行为。生成出选择器或媒体条件只证明生成阶段；模拟接口返回成功只证明调用完成；功能探针返回 true 也不能代替像素和生命周期证据。新增夹具时仍须预先声明独立预期，实际失败不得自动改写支持等级。

| root | 当前缺口 | 真实夹具的最小边界 | 后续实施顺序 |
| --- | --- | --- | --- |
| `pointer-none` | `hasTouch` 不提供移除主指针的能力，per-page media API 无此选项 | 原生媒体状态或任务独占无主指针宿主；六项 pointer/any-pointer 查询与色块同步变化 | 先验证特定引擎的原生媒体协议，再决定是否需要宿主 |
| `any-pointer-none` | 主指针缺失不等于全部指针缺失 | 全部指针不可用，再恢复任一设备；分别断言主指针和所有设备 | 与上一项共享资源，保持独立结果 |
| `contrast-less` | 当前 Playwright 只提供 `more/no-preference` | 原生 `prefers-contrast:less`、默认与恢复状态、独立颜色 oracle | 可先探索单引擎原生媒体协议，其余引擎保持缺口 |
| `inverted-colors` | 无统一模拟入口，宿主反色和截图捕获位置还需校准 | 原生媒体状态、CSS 色值、截图 RGB 校准块 | 先确定捕获是在系统反色前还是反色后 |
| `autofill` | 普通填表不产生自动填充语义 | 独占临时 profile、虚构地址、浏览器原生填充服务、`:autofill` 和可见 outline | 先实现可控的单引擎原生服务，逐引擎补充 |
| `visited` | 隐私保护使 computed style 和选择器查询不能证明历史颜色 | 独立历史、同站点真实导航、唯一 URL、固定字形区域像素 | 先建立真实历史与独立像素 oracle |

## 已确认的 API 边界

仓库固定的 Playwright 1.64.1 类型中，`Page.emulateMedia` 与 context 的 `contrast` 只允许 `more`、`no-preference` 或 `null`；`hasTouch` 只描述触摸能力，没有 `pointer`、`any-pointer`、`invertedColors` 等声明式选项。这是当前跨引擎自动化入口的限制，不能推导浏览器或 Tailwind 不支持相应 CSS。

Chromium 的原生媒体或 Autofill 协议可以作为后续探索入口。协议接受特征名称、地址数据或返回成功，本身不证明媒体状态或 `:autofill` 已改变。必须检查浏览器原生状态，并与候选、无 class 对照、实际绘制同步验证。单引擎成功不能推广成三个引擎通过。

## 已接入的两项生命周期夹具

`starting` 使用 `starting:opacity-0`，最终 opacity 为 1。插入前安装原生 transition 事件和 rAF 记录；候选与无 class 对照同时进入文档。只有候选从透明起步，随后严格增加并到达 1，移除后重新插入还能重现，才满足语义。截图需使用真实产生的过渡；为了取证暂停已经存在的过渡时，仍须保存暂停前自然推进的时间线。不可手写等价 CSS 或创建替代动画。

`details-content` 把 `details-content:bg-[#123456]` 放在 `<details>`，内容子节点保持透明。真实点击 summary 打开、再次点击关闭，再用键盘打开，分别检查原生状态、可信输入、toggle 事件、UA 伪元素属性与内容区域像素。summary 与无 class 对照不得同步着色。功能探针失败应保留失败或未执行原因，不能自动声明不支持。

## 证据与资源

后续 runner 继续借用统一入口提供的后台 Browser，只创建并关闭自有 context/page；所有截图、事件、环境状态、URL 和恢复记录绑定同一个 run ID。媒体/设备切换需要任务独占且可恢复的资源。浏览历史和 autofill 数据限于临时测试上下文，不复用或清除用户历史，也不使用用户真实凭据。

这六项计划没有产生跨引擎验收结论。starting 与 details-content 的实现位于 [`web-lifecycle`](../web-lifecycle/run.ts)，已接入生成 CSS、fixture hash、static 基线、覆盖映射和严格报告合同；有夹具不代表三个引擎均已实际通过。

Chromium 另有 `native-media-contrast-less` 原生 CDP 夹具，检查 no-preference、less、more、custom 与恢复；使用独立 CSS 参考、未加 class 的对照和绑定 run/phase 的 PNG 像素。统一门禁复读 sidecar、CSS、PNG 后重算。Chromium 为 83/88 个 root 提供夹具，Firefox/WebKit 仍为 82/88；夹具存在不等于本轮运行通过。
