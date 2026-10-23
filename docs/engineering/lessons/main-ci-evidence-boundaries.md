---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39799325536
baseline: 49b61ded489ea0656e7112670ede55259ee01382
regressions:
  - e2e/react-native-android-environment-entry.test.ts
  - e2e/uni-app-vite-tailwindcss-v4.test.ts
  - e2e/mpx-tailwindcss-v4.test.ts
  - e2e/gulp-tailwindcss-v4.test.ts
  - e2e/pnpm-environment.test.ts
  - packages/weapp-tailwindcss/test/ci/pnpm-exec-windows.test.ts
  - e2e/lynx-decoder-rebuild.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-subpackage-style.unit.test.ts
  - e2e/demo-workflow-short-process.test.ts
  - e2e/tailwind-report-clock.test.ts
  - packages/weapp-tailwindcss/test/ci/repoctl-previous-release.test.ts
  - e2e/tailwind-web-frame-progress.test.ts
  - e2e/tailwind-web-autofill-protocol.test.ts
  - e2e/tailwind-web-native-media-protocol.test.ts
  - e2e/tailwind-web-history-observe.test.ts
  - e2e/playwright-image-ci.test.ts
  - e2e/playwright-image.test.ts
verification:
  - claim: 预装浏览器作业保留原预算与验收，版本漂移或浏览器启动失败直接阻断
    kind: unit
    status: passed
    sha: 5af81c17630d66c3bfc39c2328ce28a17f78787c
    environment: macOS、Node 24.18.0、pnpm 12.14.0，包含本轮未提交的 CI 容器修复
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/playwright-image-ci.test.ts e2e/playwright-image.test.ts e2e/react-native-ci.test.ts e2e/hosted-workflow-contract.test.ts --update=none
  - claim: 网站三浏览器真实夹具完成采集、严格比较及错误样式拒绝
    kind: integration
    status: passed
    sha: 5af81c17630d66c3bfc39c2328ce28a17f78787c
    environment: macOS、Node 24.18.0、Playwright 1.64.1，包含本轮未提交改动；并非 Linux 容器实测
    command: CI=1 pnpm --filter @weapp-tailwindcss/website e2e:visual:test
  - claim: 新预装容器中的网站视觉和 Expo Web 三引擎实际验收
    kind: ci
    status: pending
    sha: 5af81c17630d66c3bfc39c2328ce28a17f78787c
    environment: 待提交修复的 GitHub Ubuntu x64、Node 24、Playwright 1.64.1 Noble 容器
    reason: 此 SHA 是修复前基线；新提交后需核对准确 head 和全部检查，旧 head 的成功不能替代
  - claim: 容器实际账户 HOME 与目录 UID 同时匹配，拒绝 GitHub 异主挂载
    kind: unit
    status: passed
    sha: 8911ce1d0f2696f96f648d8ab58d2411d90eed6c
    environment: macOS、Node 24.18.0、pnpm 12.14.0，包含 HOME 适配的未提交改动
    command: CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/playwright-image-ci.test.ts e2e/playwright-image.test.ts e2e/react-native-ci.test.ts e2e/hosted-workflow-contract.test.ts --update=none
---

# 合并后 CI 的执行入口与证据边界

## 症状

main 的 Static Gate 在 RN Android 环境入口测试和 uni-app、Mpx、Gulp v4 静态快照失败。旧 main 的夜间运行还暴露了 Windows 活动 pnpm 被 PATH 版本替换、tar 链接边界误判、短进程测试没有命中真实采集边界，以及 Mpx 分包把 webpack JS 交给 CSS 解析器的问题。

Ubuntu 夜间日志另有刚写入的 `generated.css` 被报告门禁判为旧产物；原日志没有时间数值，不能量化该次偏差。

main 的 Release prepare（run `39799325563`）在消费新 intent 前把 40 个已发布版本判为未完成，报 `Prepared releases must finish before consuming new intents`。

修复 PR 首轮 head `07d650e02fcb59e77c97f3a8a408d23be2d5183a` 的 Chromium Web semantics（run `39806726712`、job `119922413916`）另在 `runtime/autofill-native-outline` 的初始帧递增断言失败。

head `5af81c17630d66c3bfc39c2328ce28a17f78787c` 的网站视觉与 Expo WebKit 在首轮及一次授权复测中均未进入浏览器验收：`azure.archive.ubuntu.com` 持续慢传依赖，分别耗尽原 10 分钟和 25 分钟预算。复测日志 SHA256 分别为 `eff2765210d6bacef20154efca7b296fe362c669498a80150d6c539c4e80d50a`、`3214f43e16aba24689bfc1ae41b0b00c2747efdf2371cf0ebbd405563ddabd9d`。这是环境准备取消，不能计为测试通过；原作业复测额度已用尽，不再 dispatch。

## 根因与纠正

- RN 入口新增身份和收尾协议，旧测试整体 mock 遗漏导出、named 文件写入和连接清理。部分 mock 保留真实身份逻辑，并断言原始异常、环境恢复及收尾回执。
- 来源追踪改为压缩后保留的重要注释，普通 uni-app static 基线遗漏同步。限定重建主包与两个分包，137 处差异逐项归一化后与旧快照完全相同，均只有 `/* tokens:` 到 `/*! tokens:` 的变化。
- Mpx 与 Gulp 也遗漏了来源追踪基线。Mpx 的 146 条注释升级为重要注释；Gulp 转义任意类补齐来源，主包追踪注释 32→61，两个分包各 1→4。只移除来源协议注释后，四份产物的 AST 逐节点一致，包括选择器、声明、条件、层级与顺序。
- Windows 环境键不区分大小写，展开成普通对象后失去该语义。环境合并、入口选择和实际子进程统一使用同一份规范化环境；显式删除和禁止继承继续生效。显式入口不存在时保留 `ENOENT`，禁止换版本继续。
- tar 的 Windows 读取器先归一化路径，校验普通原始头与 PAX/GNU 原始元数据后才消费有效路径。固定源码归档只接受 POSIX 元数据。保留原压缩格式识别、分块读取和相对链接物化，不修改 decoder 产物。
- Mpx 的 JS 样式载体和 CSS 入口承担不同证据角色。CSS 签名只读取已配置的 `globalStyleCandidates` 及其导入闭包；JS 仍参与 marker、热更新和回滚验证。错误或丢失声明仍必须失败。
- 短进程生命周期测试改为跨平台注入同一 observer，实际触发 2200ms 身份查询，保留 5000ms 采集预算和关闭断言。
- 产物 `mtime` 与 `Date` 不能混合作执行先后判据。启动前从产物所在文件系统的独占临时标记采样时间，单独保存内部 `artifactStartedAt`；原生报告的 wall clock 身份检查保持原义。原报告版本、摘要、归属、旧文件拒绝规则和误差均不变；采样或清理失败直接阻断，禁止退回 `Date`。
- repoctl 的历史发布完整性检查使用全仓 Release 分页列表判断已知 tag 是否存在。只读对账确认 40 个 npm 版本、tag、正式 Release 及完整 checkpoint 均已存在。使用原 guard 重现时，CLI transport 通过，而公共 HTTP 轮的 Release 列表为空，唯一失败谓词为 `release:false`。随后记录的真实响应显示 page 8 返回 100 项且 Link 指向 next=9/last=12，page 9 却返回 HTTP 200 和 `[]`，客户端因此提前终止。分页集合不能可靠证明某个准确 tag 不存在，改为 `GET /releases/tags/<tag>`；仅明确 404 表示缺失，空体、数组、错 tag、权限和网络异常保持未知并阻断。npm、checkpoint、draft、prerelease、tag 与 gitHead 门禁不变。
- Chromium 工件的初始 rAF 样本为 `[46.832, 46.832]`，两次回调不足以证明绘制时间严格前进。原生填充、字段、标准伪类、outline/identity PNG、可信编辑恢复均符合原合同。将相同逻辑的 Autofill、原生媒体与历史采集统一为可独立序列化的浏览器屏障，只接受两次严格递增的真实 rAF 时间，超时取消挂起回调并禁止迟到回调重新调度。写入 identity、等待帧、读取样式三个阶段校验 `performance.timeOrigin`，拒绝同 URL reload 拼接；Autofill/媒体同一会话还锁定文档，history 不跨导航比较帧时间。外层 5000ms 及 visited 2000ms 总预算不变，传给屏障的是剩余预算；合同的严格 `>`、像素与全部独立预期不变。
- 两项浏览器作业每轮执行 `install --with-deps`，将稳定的浏览器运行环境依赖交给宿主 APT 网络；持续慢传不会触发无进展超时，外层重试也无法在已耗尽预算后恢复。改用[官方 Noble 容器](https://github.com/microsoft/playwright/blob/v1.64.1/utils/docker/Dockerfile.noble)，固定版本 `1.64.1` 与 OCI 摘要 `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`，三引擎、headless-shell、系统库和字体在镜像构建时准备。作业内不再安装浏览器或其依赖，也不下载兜底；探针严格比较镜像 marker、根 Playwright、网站 test wrapper 及其实际 driver 的精确版本，再真实启动所选引擎、检查 DOM/CSS 并截取 PNG。保留原 10/25 分钟、原三浏览器及全部视觉/语义/工件门禁，不改黄金截图。版本升级必须同步固定镜像，否则直接失败。
- 网站命令生命周期依赖真实 `ps` 身份表，官方镜像构建文件未显式声明 `procps`。初版为未确认的镜像准备了按需安装分支；实际 x64 容器在 81ms 内已完成完整进程查询，没有访问 APT。据此删除安装分支，仅保留限定两分钟的真实身份探针：工具缺失或查询失败直接阻断，不安装、不跳过、不降级。该步骤仍在原作业总预算内。
- 首次容器 head `8911ce1d0f2696f96f648d8ab58d2411d90eed6c` 的网站作业 `120227284104` 在约 95 秒完成镜像/工作区/进程工具准备，Chromium 真实渲染通过；Firefox 严格探针拒绝 `HOME=/github/home`，因为挂载目录归属 `pwuser`，实际进程为 root。原始日志 SHA256 为 `c67bd75cd2b37d8df76603c25a2b3fefc99a6e8794431d5ec8d21a1759cbe2ca`。这是新增容器适配遗漏，不能登记容器通过。两个浏览器作业明确使用容器 root 的真实 HOME `/root`，探针另以系统用户记录和目录 UID 校验归属；不更改宿主用户会话，不关闭 Firefox 保护，也不跳过 Firefox。新增 HOME 合同在旧配置先失败，本地修复后 4 文件 29 项通过。

Release 临时修复固定在 `@icebreakers/monorepo@5.10.3`，由 `repoctl@5.10.3` 消费，补丁为 [`patches/@icebreakers__monorepo@5.10.3.patch`](../../../patches/@icebreakers__monorepo@5.10.3.patch)。[上游源码](https://github.com/icelib/repoctl/blob/main/packages/monorepo/src/commands/release/preparation/guard.ts)尚未提交本轮修复；待上游发布包含准确 tag 查询和等价负向门禁的版本后，先以本仓库回归确认，再升级并删除 patch、workspace 和 lock 登记。锁文件仅保留补丁 hash、对应 snapshot 和 repoctl 引用变化，剔除安装附带的无关依赖图重算。

## 验证

以下验证针对基线加本轮未提交改动，macOS、Node 24.18.0、pnpm 12.14.0；不代表原始基线已经包含修复。

- RN 四个入口回归先失败后通过；覆盖 setup/listen 原始异常、连接清理与设置/端口恢复。
- pnpm 环境反例和 tar Windows 反例先失败后通过。tar 另覆盖大于 64KiB 的 gzip/Brotli、合法 PAX/GNU 链接与完整正文。
- Mpx 混合 JS/CSS 调用回归先报 `Unknown word self`；修复后有效声明通过，错误/丢失声明拒绝。`CI=1 E2E_WATCH_MINI_PROGRAM_ONLY=1 pnpm --filter @weapp-tailwindcss/scripts test:watch-hmr -- --case mpx-tailwindcss-v4 --mini-program-scope subpackages --skip-build` 的普通与独立分包 template、style、main-style 及回滚均通过，源文件由原 runner 恢复。
- `CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-vite-tailwindcss-v4.test.ts -u` 限定生成 static；审查后以相同命令的 `--update=none` 替换 `-u` 重跑通过。微信 IDE 未执行。
- `CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/mpx-tailwindcss-v4.test.ts e2e/gulp-tailwindcss-v4.test.ts --update=none` 复现两份失配；仅同两项目以 `-u` 重建，经有序 CSS AST 独立审查后再以 `--update=none` 验证。
- `CI=1 E2E_PROJECT_FILTER='^taro-webpack-react-tailwindcss-v4$' E2E_GENERATOR_PLATFORM_FILTER='^web-compact$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/apps-generator-mode-compare.test.ts --update=none` 通过当前基线；旧运行没有原始 CSS，不能据此声称已解释旧 +532 字节的根因。
- 时钟回归模拟 `Date` 超前一分钟，直接报告和提前启动路径均先失败后通过；提前启动在报告创建前生成产物并复用启动下界，旧一分钟产物仍被拒绝，采样与清理错误同时保留。已复现同类跨时钟误判，原 Ubuntu 失败的具体时钟偏差仍未确认。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-native-adapter.test.ts --update=none` 的 31 项原生报告适配回归通过；只验证报告与证据门禁，不代表设备验收。
- `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/repoctl-previous-release.test.ts test/ci/repoctl-release.test.ts test/ci/repoctl-stages.test.ts --update=none`：新增真实公共 `releaseCi` plan→verify 与 `GitHubClient` 回归最初修复前 5 失败、5 通过；安装补丁并补齐 HTTP registry 与旧客户端兼容回归后，3 文件共 46 项通过。registry 同时覆盖 CLI 和真实 `RegistryClient` HTTP 分支，HTTP 轮断言精确版本与 dist-tags URL、禁止退回 npm；registry 明确缺失仍拒绝。GitHub 和 registry 使用离线响应，不执行 npm publish 或远端写入。
- page 9 原始响应记录时间为 `2026-10-22 15:45:39 GMT`，request ID 为 `F772:2C3D93:241AD43:358DCA9:6ADA2FA2`，正文 2 bytes，SHA256 为 `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`。原 CI 未记录逐项谓词，先前空首页轮也没有原始响应，因此不能断言它们具有完全相同的远端原因；本修复消除的是对分页列表的错误依赖。
- Chromium 原始工件 `12437079965` 完整下载后 SHA256 为 `f6aba0beea1181298ce900824e5a2d87ad1040b328dccb752a7b668021e767cb`，run ID `b633b8c8-96e8-44a6-8d95-331b276c5a5c`、浏览器 `156.0.8078.4`；从 measurements/report 复读确认唯一失败为 `initial/frames`。提取原两次 rAF 算法后，重复时间、上一状态下界及两类停摆共 4 项先失败，修复后通过。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-web-frame-progress.test.ts e2e/tailwind-web-autofill-protocol.test.ts e2e/tailwind-web-native-media-protocol.test.ts e2e/tailwind-web-history-observe.test.ts e2e/tailwind-browser-serialization.test.ts e2e/tailwind-web-autofill.test.ts e2e/tailwind-web-autofill-replay.test.ts e2e/tailwind-web-autofill-runner.test.ts e2e/tailwind-web-native-media.test.ts e2e/tailwind-web-native-media-replay.test.ts e2e/tailwind-web-native-media-runner.test.ts e2e/tailwind-web-history.test.ts e2e/tailwind-web-history-replay.test.ts --update=none`：13 文件 176 项通过，包含跨文档、同值帧、停摆、迟到回调、清理、独立 realm 序列化及证据篡改反例。共享屏障加入 `e2e:tailwind:contract`；未修改 CSS/HTML 夹具或 static 基线。本地没有绕过预检启动实际浏览器验收，真实修复结果等待新 head hosted CI。
- 预装环境回归先在旧工作流失败：两项缺少固定容器及启动探针；修复后 4 文件 27 项通过，覆盖版本漂移、marker 缺项、缺浏览器、渲染初始化异常、资源清理、触发路径、原验收完整性，以及已安装工具/按需补齐/安装失败/真实查询失败四条分支。网站合同 3 文件 28 项通过，真实三引擎夹具 1 项通过；合成夹具不登记为网站黄金图。本地 macOS 三引擎直接渲染探针也通过。

## 适用边界

旧夜间的 Windows 冷准备仍存在 15 秒预算耗尽：原始请求读入到 JSON 事件耗时 11402ms，再查询身份 3519ms。现有证据无法区分模块加载与宿主调度，不能宣称根因消除，也不增加预算。macOS Web 内存探针的 `ps` 被终止后未在原预算确认关闭，宿主根因同样未明。两者没有通过反复重跑抹去。

本地全面预检仍被既有微信保护租约及 Android 空 UI 阻塞；本轮只有定向回归和普通 hosted CI。原生完整 served bundle/HMR 等全面验收缺口仍保持 partial，CI 成功不能代替设备验收。

没有重跑历史 Release、发布 npm、改写 checkpoint/tag/Release 或绕过发布完整性检查。Release 修复的 hosted CI 与合并后 prepare 尚待实际执行，本地通过不能代替发布工作流成功。

官方容器仍需下载镜像层，不能承诺宿主网络故障从此消失，也不声称字体环境与旧 hosted 主机完全相同。Linux x64 容器的实际三引擎网站管线与 Expo Web 语义验收以新 head CI 为准；本地 macOS 结果只证明对应层级。

本地单次 Docker pull 约 15 分钟仍未完成，已精确终止本任务的客户端并确认退出，未创建容器或卷；因此没有登记本地 Linux 容器通过。资源记录在 `.tmp/ci-main-recovery/playwright-image-apt-recovery/local-resources.json`，不再重复拉取碰运气。

## 规则评估

不新增 AGENTS 规则。已有根因回归、跨平台路径、static 同步、预算与证据门禁约束足够；本次补齐执行边界和持久测试。
