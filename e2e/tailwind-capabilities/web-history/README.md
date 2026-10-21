# 真实历史样式夹具

本模块登记 `variant/static/visited` 的正向运行时合同。`fixture-defined` 只代表夹具存在，实际成功取决于各轮、各引擎的真实原始证据；单测合成 PNG 只验证错误证据会被拒绝。

每个引擎使用两份全新、独占的临时 persistent profile，后台运行。第一份在本轮唯一的同源 HTTP 路径打开夹具，记录初始绘制，真实点击链接进入目标文档，再返回夹具记录 visited 绘制。关闭该 profile 并移除自有目录后，第二份全新 profile 打开相同 URL，验证无历史恢复。普通 Web 分组仍复用统一 Browser；历史隔离所需的额外资源单独记录，不借用或清除用户历史。

候选是 `visited:border-[#123456]`。未访问链接为独立对照；相同 href 的另一条链接使用手写 `#reference:visited` 作为独立参考。三条链接均为 opaque 边框，四边分别采样。只改顶部、无条件生效、对照污染、参考不变或恢复后残留都不能通过。computed style 和 matches 的隐私掩蔽原值仅归档，不参与激活判断。

点击监听器同步保存本轮 sessionStorage 事件回执，保留浏览器默认导航；到达同源目标后立即读取并移除这一独占键。不通过 pushState、history 数据库、forcePseudoState 或替代 class 制造访问状态。

报告绑定 run、engine、实际 BrowserType、浏览器版本、生成 CSS、两份不同 profile 身份、导航与 HTTP 请求次序和三张 PNG。PNG 可见标记还绑定阶段、引擎和 CSS hash。统一报告与 coverage 门禁从磁盘重新读取并重算像素，不接受仅更新 receipt 后保留的旧 passed。

关闭失败会记录原始异常并保留无法确认关闭的自有 profile 目录；不升级为全局浏览器关闭。HTTP 启动失败由服务自身负责取消监听和收尾。所有资源归属只限于本次创建的对象与目录。

2026-10-21 的实现回归包含五份历史夹具单测及六份接线/清单回归，`CI=1 pnpm exec vitest run --config e2e/vitest.e2e.config.ts <对应文件> --maxWorkers=1 --update=none` 为 11 文件、192 项通过。`pnpm e2e:tailwind:static:update` 只新增 `history.css` 和对应索引，原 47 份 CSS 不变；随后以真实 ESM 入口调用 `fixtureBaseline` 的只读校验通过，ESLint 通过。严格 TypeScript 独立检查仍被共享 E2E 与脚本的既有类型错误阻断，不能登记为完整类型检查成功。

这些结果验证合同及错误证据拒绝，不证明三引擎真实 visited 绘制通过。实际执行须在新的扩展预检、当前会话 computer use 和 verify 后，使用 `pnpm e2e:tailwind --target web-chromium,web-firefox,web-webkit --case history-visited-border --preflight-report <本轮报告>`；真实失败保留为失败，不自动改变支持预期。
