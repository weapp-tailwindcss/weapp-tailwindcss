---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1320
baseline: 0637f78ed5c23a216be01a835f101074a373490f
regressions:
  - website/tests/full-page-image-decoding.spec.ts
  - website/tests/full-page-images.spec.ts
  - website/tests/full-page-capture.spec.ts
  - website/tests/full-page-snapshot.spec.ts
verification:
  - claim: 解码屏障与失败传播修复候选的本地三浏览器定向回归、类型和 lint
    kind: integration
    status: passed
    sha: 0637f78ed5c23a216be01a835f101074a373490f
    environment: macOS arm64，Node 24.22.1、Playwright 1.64.1；准确 0637 加正文所列 tracked changes，按文件哈希绑定待提交候选，不代表最终整仓提交验收
    command: |
      pnpm --filter @weapp-tailwindcss/website exec playwright test --config scripts/local-worker/playwright.config.mts tests/full-page-image-decoding.spec.ts tests/full-page-images.spec.ts tests/full-page-capture.spec.ts tests/full-page-snapshot.spec.ts --project=chromium --project=firefox --project=webkit --update-snapshots=none --reporter=line
      pnpm exec eslint website/tests/helpers/full-page/images.ts website/tests/full-page-images.spec.ts website/tests/full-page-image-decoding.spec.ts
      pnpm --filter @weapp-tailwindcss/website typecheck
  - claim: 最终黄金图来源、捕获合同及整站禁止更新验收
    kind: integration
    status: pending
    sha: 0637f78ed5c23a216be01a835f101074a373490f
    environment: 上述基线与待提交候选；旧黄金校验不替代新捕获合同验收
    reason: 旧黄金官方 verify 已通过；新合同基线生成、差异审查与整站复验尚待完成
  - claim: 最终提交的本轮全端预检与完整 57 阶段
    kind: integration
    status: pending
    sha: 0637f78ed5c23a216be01a835f101074a373490f
    environment: 最终候选尚未完成同提交全端验收
    reason: 定向回归、历史子集与干预实验均不能替代完整验收
  - claim: 最终提交的适用 CI/CD 与 PR 合并
    kind: integration
    status: pending
    sha: 0637f78ed5c23a216be01a835f101074a373490f
    environment: PR 1320，最终源码与基线提交待后续准确绑定
    reason: 本地源码提交前尚未完成最终 CI/CD，PR 未据此合并
---

# 网站图片加载与解码屏障

## 症状

准确 `0637f78ed5c23a216be01a835f101074a373490f` 的 `full57-0637f78-run1` 在第 24 阶段网站运行首败：WebKit 桌面 `/zh-cn/docs/showcase` 与注册黄金图相差 72 个官方计数像素，超过原上限 5。原比较器为 Playwright 1.64.1 捆绑 pixelmatch，threshold 为 0.2；RGBA 原始差异为 15,902 像素，尺寸均为 1280×5866。

本轮前 23 阶段通过。网站已有 1,976 项通过、335 项原有跳过，448 项因首败未运行；第 25–57 阶段均未启动。所有已启动 attempt 的 retry 为 0，没有更新黄金图，也没有放宽时间、像素、稳定帧或失败即停门槛。原始失败保留在 `e2e/.artifacts/dependency-upgrade-20261028/full57-0637f78-run1/`。

原 72 点位于安心校友圈的首页、成绩、私信截图，分别为 32、11、29 点。原始 15,902 个 RGBA 差异还包含一键呼援截图的 3,014 点，该区域的官方计数为 0。空间映射采用后续精确匹配黄金图的 IMG 几何；原失败 trace 没有记录自身每张 IMG 的 rect，不能据此补造原始 DOM 状态。

## 历史子集与证据边界

前置历史包括 analytics、english-content、framework-sidebar、full-page-capture、full-page-images、full-page-snapshot 和 index 七个文件。两轮均使用 WebKit、原五像素门槛、单 worker、重试 0、禁止更新，声明 802 项，结果均为 498 通过、304 个既有跳过；实际原失败前 472 条的文件、分组与标题顺序一致。

第一轮在临时副本中观测原截图返回值和 IMG 状态。英文、中文两次稳定采样分别与各自黄金图 RGBA 完全相同；两页安心七图都有完成的 JS decode 记录，没有观察到该轮中文七图被跳过。额外布局读取、Promise reaction 和采样文件写入会改变时序，该轮不能冒充原始运行。

第二轮直接使用原七文件与原配置，没有新增诊断观测代码。59 个相关源文件与准确 0637 逐字节一致，全部声明身份及 304 个跳过身份与冻结清单一致。通过只证明原比较器计数不超过 5；没有保存通过 PNG，不能宣称 RGBA 零差异，也不能由一次未复现否定原失败。

源码存在独立准备缺口：`prepareFullPageImages` 仅选择未 complete 或 naturalWidth 为 0 的图片。加载完成且尺寸有效的图片会跳过显式 `decode()` 屏障；加载状态与 decode Promise 履约是不同合同。历史子集本身没有证明这条路径造成原 72 点，随后才进行有界干预实验。

## 真实页面干预

实验保留原 visualTest/frozen-GIF fixture、真实本地 Worker、导航、TOC 和 `captureStableNativeFullPage`。固定中文 showcase、1280×720、Safari DPR 2；先安装 load/error 监听，再临时将未加载 lazy IMG 的 loading 改为 eager，完成后精确恢复原属性。该控制改变了原场景的加载方式。

同一 DOM 预定执行 A1、A2（无显式 decode 的重复捕获）、全部实际 IMG 显式 await decode、B1、B2；第二个新 context 在首次捕获前 decode，保存 D1、D2。每条测试共享一份 60 秒预算，包含导航、加载、事实观测和所有捕获；外层五分钟覆盖 Worker 就绪与 CLI，并等待原生命周期清理。没有包裹截图或 decode API，没有快照 matcher 或按黄金图选择样本。

两条实际测试通过、重试 0；最后一轮捕获分别在回调起点后约 10.824 秒和 6.698 秒结束，不含后续事实读取、清理、落盘和 fixture 收尾。每条含 50 个真实 IMG，其中 37 个未加载 lazy 节点临时改为 eager，全部 50 个 loading 属性最终恢复，节点序列、资源、完整 IMG 计算样式、stylesheet、几何、视口和滚动在加载后的全部观测中严格一致，清理无错误。每组内部两图 RGBA 完全相同，全部返回 Buffer 在采样结束后原样落盘。

| 样本 | 对黄金图官方差异 | RGBA 原始差异 | 原 72 个坐标的颜色 |
| --- | ---: | ---: | --- |
| A1 / A2 | 168 | 36,162 | 72/72 精确匹配原失败 actual |
| B1 / B2 | 3 | 52,672 | 72/72 精确恢复黄金图 |
| D1 / D2 | 3 | 59,118 | 72/72 精确恢复黄金图 |

A 与 B 相差 88,834 个 RGBA 像素，官方计数为 171；差别涉及真实像素。A 另外多出 96 个官方差异，未完整复现原 actual。B/D 剩余三点为 `(219,1092)`、`(263,1092)`、`(264,1092)`，与原 72 点没有交集；B 与 D 仍有 6,446 个 RGBA 差异，官方计数为 0，不能称两组图完全相同。

离线两套独立比较器均以原 expected/actual 自验官方 72、RGBA 15,902，并生成与原 diff 完全相同的 RGBA。六份输入 SHA、全部 15 组两两比较及原 72 点坐标和颜色均核对，原注册黄金图与原 expected 的字节及 RGBA 相同。

这些结果支持显式解码屏障与原 72 点恢复的关联。A 仅表示实验调用路径没有显式 JS decode；应用自身 API 调用及浏览器内部解码状态未观测。原稳定管线每次至少截取两张完整图，可能触发内部解码、绘制或热身；A2 不是 decode 的精确时间安慰对照，新 context 也仍共享 browser 进程。加载属性和布局事实读取均改变时序，不能宣称已排除所有时间、缓存与截图热身混杂。

## 根因与纠正

已在图片准备层补全合同，保持原捕获、PNG 稳定配对与五像素门槛。每次 prepare 用局部 WeakMap 按节点和当前资源身份记录成功 decode；currentSrc、src、srcset、sizes 及本轮 load/error 代次变化时，旧成功不能替代新资源。状态不跨 prepare、Page 或 worker 复用。

未加载图片仍先监听并等待真实 load/error，再 decode；已经 complete 的图片直接等待 decode，不额外 scrollIntoView。资源切换、节点移除和新增兄弟需要重新核对真实身份。普通 load 改变资源代次后须重扫并 decode 当前资源，节点或资源变化时以 inner break 终止旧 pending 批次并立即重扫；稳定 broken 图片须在访问后续 lazy 图之前明确拒绝，避免已知加载错误被后续挂起掩盖。

原共享截止时间保留。超时后的取消先阻止下一轮动作；迟到 decode 完成后首先检查 cancelled，不再滚动、标记成功或请求下一张图。监听器在正常结束与取消清理中解除。发生本轮滚动才恢复位置并沿用原双帧核对；没有本轮滚动时只核对原位置，外部移动应报错而不擅自滚回。

新增回归使用真实已加载图片与可释放/拒绝的 decode Promise 屏障。正向观察首次准备 evaluate 的原 Promise，跨过一次 MessageChannel 浏览器任务边界后仍须挂起，再释放屏障走真实原生截图；拒绝必须在截图前传播。取消回归释放迟到屏障后显式等待原准备 evaluate 完成，再断言没有新滚动、解码或 lazy 请求。另覆盖资源切换、节点移除、同 URL 多节点和跨扫描去重，保留原 broken/stalled/动态兄弟回归。

## 验证

原 helper 的新增 spec 负对照为预期 1 失败、6 未运行，首错为 `capture-ended` 而非 `decode`。首版代次候选另由“坏图在挂起图之前”复现预算错误掩盖加载首错；inner break 修复后三浏览器专项 3 项通过。只将当前 helper 的 `await image.decode()` 改为 `void image.decode()` 的隔离 WebKit 变异也按预期 1 项失败：任务边界后原准备 Promise 已结束，在 `PREPARATION_MUST_REMAIN_PENDING_BEFORE_DECODE_RELEASE` 断言失败，证明用例检查了等待合同。

最终候选四文件三浏览器 66/66 通过（各 22 项，约 1.2 分钟），类型与 lint 均退出 0。原配置固定 headless、单 worker、重试 0、禁止更新；公共命令见 frontmatter，实际由机器环境 wrapper 提供 Node、代理和设备环境，并将输出定向任务临时目录。最终浏览器证据为 `final-positive.log` 的完整 1–66 序列与通过汇总（SHA `c7b3c660a20fed72ed75d7cadee38a373c58badd73405c68f86b874669129563`），使用 line reporter，没有补造最终原生 HTML/JSON。

待提交候选按准确 0637 加以下 tracked changes 绑定；不在本次源码提交内写入其自身未来 SHA：

| 相对路径 | SHA-256 |
| --- | --- |
| `website/tests/helpers/full-page/images.ts` | `8ec89c999cb797eb57897d58cbb9fd0f8f9ff4679bb547b4c1edbc79e11a4937` |
| `website/tests/full-page-image-decoding.spec.ts` | `0fabf1fc88115fe1bbc52daff1029517f1252e1ab1b6dee2cf2c160c738fbd58` |
| `website/tests/full-page-images.spec.ts` | `951fab21cbc87a7f815a64bddfd58914ca429176241f1a1708c4469620c3977a` |

旧黄金官方 verify 已退出 0，并保留原 1,238 文件的完整副本和字节校验；它不能替代修复后合同的基线。最终黄金来源与差异审查、整站禁止更新验收、同提交全端预检、完整 57 阶段、适用 CI/CD、`pnpm agents:check` 与 `git diff --check` 仍为 **pending**。诊断 PNG 不能直接成为黄金图，以上通过不代表全面升级完成，不据此合并 PR。

主证据身份：原失败分析回执 `c12e4c101878b07e06e15a8b0fedb3367cba7782a93d2d4a318fd64d3e404da1`；原始历史子集回执 `55f7ed6b1c3f6260e95927f780106d091a0d5e501c3b3def193da3059a87eed6`；干预全像素比较回执 `496924a6f06d2ef2990e6d90ee812bba3f57003c1f285540a1d512855ee2852c`；严格事实回执 `5bc9ecf9ed2a77fdc459987cdf753b9f24c9e3f08eb35ba6a4fa76bf6e78c9ed`。大体积临时 PNG、facts、原生报告和清理证据仍须随本轮恢复 artifacts 保留。

## 适用边界

原运行与两轮历史子集及干预实验的 runner 自然退出，独特路径进程和对应监听端口均已消失，使用原 Worker/CLI 的 join 清理；没有完整 browser 子 PID 初始清单，不补造逐 PID 退出证明。本次修复私有网站测试准备层，保持公开 API；最终代码范围与发布说明随实际改动复核。

## 规则评估

不新增 AGENTS。沿用原始首败保留、资源归属、禁止放宽截图门槛及最终同提交全面验收规则，以图片准备回归表达新的边界。
