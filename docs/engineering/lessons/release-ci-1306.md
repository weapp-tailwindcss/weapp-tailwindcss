---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1306
baseline: 5ead35348ecc31825bd444311767d1abb9da54c5
regressions:
  - packages/postcss/test/tailwindcss-v4-modern-guard.test.ts
  - packages/weapp-tailwindcss/test/bundlers/generator-css-deferred-selectors.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-universal.integration.test.ts
  - packages/weapp-tailwindcss/test/v5/web-target-official-parity.test.ts
  - e2e/react-native-declaration-evidence.test.ts
  - e2e/react-native-android-environment-entry.test.ts
---

# 依赖迁移后的版本 PR 验收恢复

## 症状

[Release 41980519245](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41980519245)
的八个平台原生产物全部成功，`Verify release` 在全仓单测阶段失败：26 个文件、64 项测试和 52 个快照。
同提交的 [CI 41980519171](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41980519171)
还报告 RN 静态证据、Android 生命周期 mock、Lynx、Taro 和 weapp-vite 输出基线失败。
自动 prepare 尚未执行，#1306 的旧 head 未包含本次依赖迁移。

## 根因与纠正

Tailwind CSS 4.3.4 将默认变量的能力探针从 `margin-trim: inline` 改成 `block`。
PostCSS 兼容层只识别前者，导致新版默认变量留在浏览器能力条件中。修复在原有共享兼容边界完整匹配这两种属性值，
仍要求四个探针同时存在；其他值、自定义属性和无关条件继续保留。新增实际引擎生成到完整样式处理的回归，
确认变量可以无条件到达小程序元素。修复后渐变默认值恢复原语义，不能把修复前的结果作为新基线。

RN 证据原先用正则提取 class，新版顶层 `:is(...)` 的右括号被误收进类名，导致 group/peer 被误报未生成。
改为复用 selector AST 读取器，继续通过 `generatedClassSet` 精确确认候选身份；祖先 marker 和属性字符串不能冒充候选。
Android 生命周期单测只隔离 static 生成边界，避免恒定返回文本的文件 mock 被误用于解析真实 JSON，生产执行顺序不变。

官方 Vite 对照插件仍锁在 4.3.3，与 4.3.4 的 PostCSS 对照不一致。将对照插件同步到 4.3.4 并由 pnpm 生成锁文件，
保留精确 parity。正式生成新的 inventory，实际 127 个 `@property` 注册与生产默认变量签名完全一致，无需改写映射。

其余预期迁移包括 banner、空 fallback 空格和 group/peer 的等价选择器改写。
原选择器已不再含冗余 `*`，因此保留新版形状回归，同时用显式包含 `*` 的候选继续覆盖 universal 替换。
快照按失败文件和项目定向生成，再禁止更新复验。前置快照失败使后续断言未执行而报告的 obsolete 键不能直接删除。
性能 watcher 仅更新静态 CSS 输出，不修改性能预算。

Lynx 示例的原生矩阵原先精确固定 Tailwind CSS 4.3.3，但缺少配套 `@tailwindcss/node`，
引擎实际回退到自身的 4.3.4，造成产物与证据身份不符。先验证补齐编译器可以恢复旧矩阵，
随后按用户明确要求，将示例、宣传页、独立模板和 fixture 中的 Tailwind CSS 4.3.3 依赖全部统一到 4.3.4。
示例显式声明同版本编译器，真实重建静态证据；原生矩阵需要从准确新 head 的 hosted 双端采集更新。
历史原生报告不直接改写版本号，仍由正式更新入口严格重读完整 bundle、候选、几何和像素证据后生成新基线。
第一次补入 4.3.3 编译器后，干净 CI 安装的共享解析使其他未声明编译器的项目也消费了旧版，
导致单测、RN static 与 Taro generator 回退到旧输出。这轮统一版本同时消除该解析歧义，不能用增量安装的本地成功代替干净 CI。
新增构建前置的产物 banner 核对及错版、缺失身份回归，阻止未来把回退编译器标记成示例版本。
独立诊断夹具仍消费当前 4.3.4，其两处选择器形状快照单独更新，编码拒绝状态不变。

完整版本验收还会比较 Web 能力夹具的全部静态产物，不能只更新普通 main CI 命中的基线。
共享纯数据清单的版本身份也同步到 4.3.4，消费方回归同时核对实际安装版本和固定 inventory，
避免清单仍标记旧版本。正式入口重建 49 项能力产物，其中 48 份 CSS 变化、`weapp.wxss` 不变；
主要差异为版本 banner 和 guard，registry 另有空 fallback 空白，Web 另有三处等价 group/peer 选择器改写。
fixture hash 变化来自 inventory 中 58 个 registry profile 的声明元数据；主题、preflight 和参考输入本身不变。
RN 与 Lynx 随之重新生成静态证据，118 项结果均未变化；新 catalog hash 分别为
`4bfbb441503810f249987d6fda12580e3169a3050069470c5e959aa1fc5cc330` 和
`9126d53d68318cbd319f642be14d43402fd1029de649a9915c8c554e2c54e8e4`。
旧 hash 下的真实原生报告不能修改标记后复用，新身份必须重新采集完整双端证据。

依赖声明之外，#1241 与 #1166 的测试也会动态创建临时工程并真实安装 Tailwind。
这两处同步到 4.3.4；#1241 继续保留原框架依赖作为复现边界，#1166 显式沿用根项目的
`packageManager`，避免离开仓库目录后由 Corepack 选择其他 pnpm 版本。
引擎缺少 oxide 时的安装提示同步到当前 `^4.3.4` 门槛。协议合成输入和历史报告保留其原始身份。

独立模板继续消费已发布稳定包。其旧 PostCSS guard 通过精确版本的双入口补丁适配 4.3.4，
不把模板依赖改成 workspace 或候选 tarball；固定缺陷复现包版本的 fixture 单独登记补丁及退出条件。
四阶段消费验证先复制不含 `node_modules`、`dist` 的源码，再冻结安装并核对实际依赖链与 CLI 的 realpath。
发布版切换为候选包后，Node 会缓存此前的 `require.resolve` 结果；验证器必须先读取当前直接依赖槽的
realpath，再沿实际包解析间接依赖，不能把旧缓存当成新安装的身份。

本地安装曾被其他任务执行 pnpm 的 store prune 操作所持有的全局锁阻塞。保留该任务和锁，依据 pnpm 12.15.0 的
`store_lock.rs`、`secure_temp_lock.rs` 为本轮验证建立完全独立的 store、缓存、状态、配置及运行目录。
该环境只用于本轮有归属的验证，不改变通用 CI 的锁行为。超时还暴露 pnpm 包装进程退出后原生后代
继续持有管道的问题：POSIX 按本轮进程组有界回收，Windows 通过原子 Job 纳管和原生句柄回收，
不依赖已退出包装进程的 PID，也不按进程名称批量终止。正常构建和安装共用同一生命周期边界。

## 验证

各修复在独立 worktree 安装依赖，使用仓库声明支持的 Node 24.22.1 与 pnpm 12.15.0。
定向测试均显式禁止更新快照；更新命令只用于已审查的指定基线。
本地验证记录如下，完整远端验收绑定后续修复提交和版本 PR 的准确 head：

- `pnpm install --frozen-lockfile`：通过；依赖目录与各子任务 worktree 独立。
- `pnpm --filter weapp-tailwindcss... --filter @weapp-tailwindcss/lynx build`：通过，包含 PostCSS 声明生成。
- PostCSS 定向回归与包内相关回归共 2222 项通过，3 项既有 NutUI 跳过；127 项变量签名的 2 项回归单独通过。
- 原失败的主包、typography、watcher 与官方输出 parity 共 23 个文件、220 项回归通过；watcher 连续保存并恢复后哈希一致。
- RN 示例、声明证据、Android 生命周期与静态入口等共 200 项定向回归通过；RN static 的 118 项状态计数不变，无新增失败。
- Taro static 6 项与 generator 11 项禁止更新复验通过；weapp-vite static 5 项通过，无需更新原基线。
- apps-generator 的全部 20 个构建目标、11 项测试禁止更新复验通过；49 份 Web/App 基线的选择器、报告条目和顺序完整保留。
- Web 能力基线经正式入口重建后，`fixtureBaseline` 只读核对全部 49 项产物通过；相关 8 个文件、65 项回归通过，独立审查确认差异范围。
- 新清单身份下的 inventory、Lynx 静态报告及 RN runtime-static 共 4 个文件、114 项回归以 `CI=1 --update=none` 通过。
- 动态 #1241 依赖契约 6 项、engine 提取辅助回归 7 项，以及 #1166 的 weapp/Web 两个真实安装构建目标通过；未延长原有 120 秒限制。
- 独立 Windows utilities 消费链在本机私有 pnpm 环境完成发布版、候选包各 dev/prod 四阶段，全部原输出断言通过；真实 Windows API 回归由 Node 22/24 必需矩阵单独执行。
- `pnpm e2e:lynx:static:update`：曾确认 4.3.3 编译器下 118 项结果及 catalog hash 与原基线一致；统一升级后的新证据单独生成与审查。
- 4.3.4 static 重建：118 项生成及编码状态均不变，60 项成功编码、58 项保持既有 encoder 拒绝；差异为版本身份、空 fallback 格式和 group/peer 选择器文本。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-rspeedy.test.ts e2e/lynx-versions.test.ts e2e/lynx-reports.test.ts e2e/lynx-static-evidence.test.ts --update=none --coverage.enabled=false`：统一升级前 4 个文件、123 项通过；升级后以新证据复验。
- 统一 4.3.4 后同命令 121 项通过，text-flow 与 dark 两项浏览器用例触及既有 30 秒超时；仅重试这两项后 dark 通过、text-flow 仍超时。未延长超时或修改断言，保留为本地耗时阻塞，后续准确 SHA 的 hosted 验收仍需完整执行。
- 独立 Lynx 诊断夹具的真实双入口与 strict 模式 3 项通过，已审查两处 group 选择器快照差异。
- `pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false` 与 `pnpm --filter @weapp-tailwindcss/react-native typecheck`：通过。
- 修改的 TypeScript 文件显式 `eslint --no-ignore`、`pnpm agents:check`、`git diff --check` 与 `pnpm release status`：通过。

远端结果另以最终交付记录为准，本节不将排队、等待审批或条件跳过计为完整验收成功。

本轮新清单的原生基线来自源码 `d057d4b4f2798af2d56ee36414e05736915c8c00` 的
[Lynx 42003249002](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/42003249002) attempt 1。
两个任务均完成真实采集，仅最后与旧 4.3.3 历史记录的严格比较失败；该 run 本身仍保留失败状态。
下载前核对 API 的源码与 run 身份，下载后核对完整 ZIP 摘要，再严格读取原始目录：

| 平台 | Artifact ID | ZIP SHA-256 |
| --- | --- | --- |
| Android | `13404550411` | `b2fb284e21bf4e019d5417c63c3d8268e1864b8a73fbefa79aefb4b57bc9a0fc` |
| iOS | `13405255109` | `353309da645949c27df0231121a08faad8937182e3f1df19060aa9fcc6ea3233` |

Android runId 为 `07139edc-0502-4799-b537-d35fdd0d0d3a`，iOS 为 `a4d7d083-11ea-461a-96f2-5f210a1c96a5`。
双端各 118 项状态、failure stage 和 checkpoint 结论均未变化，只有 group/peer 拒绝原因中的选择器文本更新。
Android 为 54 项支持、64 项既定不支持，iOS 为 53 项支持、65 项既定不支持；两端均无待测候选。
已检查代表性暗色、透明度、圆角和动画 PNG，并重读全部帧、bundle、几何、候选与 SDK 证据。
正式 `pnpm e2e:lynx:update` 先完整归档并严格重放，再写入两份报告与示例基线。
本机受控归档为 `e2e/.artifacts/lynx-baselines/baseline-MChQjb/archive-index.json`，未把原始工件加入 Git；
其重放入口为 `pnpm exec tsx e2e/lynx/verify-baseline-archive.ts e2e/.artifacts/lynx-baselines/baseline-MChQjb`。
最终准确 main 和版本 PR head 的完整 CI 仍须重新采集并严格比较新基线，归档不能代替该验收。

## 适用边界

修复先进入 main，由 Release 自动 prepare 重建受管版本分支，再批准当前 head 的 `version-pr-ci` 环境。
旧 run 的成功、等待登记和自动范围跳过均不能代替最新版完整验收。此任务不合并版本 PR，不发布 npm。
本地只运行有界回归，原 Harmony 原生停止状态未确认的现场继续保留；hosted CI 不能证明该本地原生验收已恢复。

另外，[Next 文档部署 41980519011](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41980519011)
失败于线上 `/robots.txt`：Cloudflare Managed robots 将预期 302 覆盖成 200 并返回通用 `Allow: /`，并非单纯状态码差异。
官方 Bot Management 接口是 zone 级，调整可能影响生产域名的 AI 爬虫策略。用户确认本轮验收限 Release 与 #1306，
因此保留该外部配置问题，不修改 Cloudflare 策略或放宽禁爬校验。

## 规则评估

沿用现有根因回归、基线审查、worktree 隔离和版本 PR 审批规则，不新增或放宽 AGENTS 规则。
