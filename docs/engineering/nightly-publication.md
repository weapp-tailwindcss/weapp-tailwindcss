---
status: partial
baseline: 60aca0b2377457a29ac7dc23309abb6690b25c6e
regressions:
  - packages/weapp-tailwindcss/test/ci/release-nightly/native-inputs.test.ts
  - packages/weapp-tailwindcss/test/ci/release-nightly/producer.test.ts
  - packages/weapp-tailwindcss/test/ci/release-nightly/consumer.test.ts
  - packages/weapp-tailwindcss/test/ci/release-nightly/route.test.ts
  - packages/weapp-tailwindcss/test/ci/release-nightly/workflow.test.ts
---

# Nightly 原生产物与发布身份

## 发布入口

Release 工作流每天北京时间 04:00（UTC `0 20 * * *`）检查 main，支持手动选择 `mode=nightly`。repoctl 只发布 `snapshot-nightly` 标签，包含全部公开包；同提交已经完整发布、各包具有相同有效构建身份时，计划任务跳过。手动执行会生成独立构建身份，不消费稳定 change intent，也不提升源码中的稳定版本。

包装入口显式加载根 release 配置，保留质量与 verify 检查。正式发布继续使用原有版本 PR 审批、准确源码 SHA、OIDC/provenance 和六阶段 receipt，不与 nightly 共用稳定发布阶段。

公开 API 来自正式 repoctl 6.3.0：[源码 PR #1121](https://github.com/icelib/repoctl/pull/1121)、[版本 PR #1122](https://github.com/icelib/repoctl/pull/1122)和[六阶段稳定发布](https://github.com/icelib/repoctl/actions/runs/40525064775/job/122262277058)均已完成，准确发布源码为 `7dc84a1a84b33026742db972e258577df0639607`。npm tarball、provenance、tag 和正式 GitHub Release 已逐项核对；本仓库消费 `^6.3.0`，已删除准确 tag 临时补丁。

## 原生产物的来源

nightly 先运行现有八平台原生矩阵，在真实 ABI 检查完成后记录准确 commit、Git tree、工作流 run/attempt、二进制 metadata、sourceDigest 和许可证哈希。只有 nightly 显式启用此清单；恢复旧稳定提交不要求旧源码具备新脚本。

Linux 在最后一次 PostCSS Node 20.19 ABI 校验成功的同一个容器内采集清单，避免 root 创建的 bindings 目录阻止宿主 runner 写入。Git 通过单次 `-c safe.directory` 仅信任当前 checkout，采集时再次核对原始工作流 SHA；不改全局 Git 配置或目录属主。macOS 和 Windows 在原宿主采集。

repoctl 隔离安装并改写 snapshot manifest 后，调用 `prepareSource`。仓库 helper 先验证全部八个平台和两个内核的输入，再复制二进制。metadata 仅更新版本；二进制、源码摘要和许可证保持与生产矩阵一致。返回的新增文件清单包含 SHA-256 receipt，repoctl 校验原文件、路径、符号链接和新增产物完整性后才构建、打包。

两个 Tailwind 子模块仅作参考源码，由 `referenceGitlinks` 明确省略。准确 gitlink OID 和原始 tree 进入回执；默认拒绝子模块的上游行为保持，不能将依赖指向省略目录。

## 发布后消费

发布 job 使用原 `release.yml@main` OIDC 身份，不注入 npm token。上游先核对每个准确版本的 registry 状态和 integrity，再决定是否上传；未知响应阻断。完整上传、标签确认和宿主消费完成后，独立矩阵在八个真实平台安装准确版本，检查包身份、依赖版本、二进制 receipt、许可证和原生 ABI，并执行 Node 22.18.0 与独立 PostCSS Node 20.19.0 验证。

消费者核对实际宿主与矩阵平台一致。异平台包仍接受静态和完整性检查，只在对应真实宿主加载；必需依赖不兼容时失败，可选的异平台依赖不参与安装和执行。

## 失败与恢复

计划、发布回执、tarball 和各平台消费报告作为同轮 artifact 保存。先查看失败 run 中的 nightly-report、snapshot-report、发布进度和消费报告，区分未上传、已接受但未确认、标签冲突与消费者失败。不得将失败 job 误报为完整发布，也不得为恢复覆盖稳定 `latest`。

若上传已确认而消费者失败，必须记录为“已发布、验收失败”；后续定时任务可能因同提交完整发布而跳过，不能用跳过代替消费者验收。

平台安装仅对已确认批次内的准确版本尚未在 npm 可见的结构化 pnpm 错误有限重试，最多 6 次、总计 300 秒，使用消费者专属缓存并保留安装 JSON。认证、完整性、未知错误和批次外缺失不重试；详情见[安装可见性记录](lessons/nightly-installation-visibility.md)。

原生产物和消费者严格绑定 run ID 与 attempt。GitHub 的“仅重新运行失败作业”会复用旧 attempt 的成功产物，因此会被拒绝；恢复时重新运行**全部作业**，或从 main 手动触发新的 Release → nightly。新 attempt 会获得新的 snapshot 身份，旧批次证据保留。上传入口仍先对账当前准确版本，已存在且身份和 integrity 相同的版本不重复上传，冲突或未知状态阻断；不得手工放宽 receipt 接受任意旧 artifact。

## 本地验证

2026-10-27 在 macOS / Node 24.22.1 / pnpm 12.14.0 / 正式 repoctl 6.3.0 下执行发布、版本 PR、metadata、workspace、工作流和真实 Git hook 定向回归：34 个文件、618 项通过；包含 nightly 路由、输入完整性、安装恢复与消费回执。22 项目依赖闭包构建、冻结安装、CI 跳过 hooks、定向 ESLint、`pnpm agents:check` 和 `git diff --check` 全部通过。官网部署回归另为 8 文件、62 项通过。

额外使用上游构建后的公开 API 与仓库 `prepareNativeSource` 做外部 Git fixture 集成：真实归档、冻结安装、10 个公开包、2 个参考 gitlink，验证 install → prepareSource → build 顺序，生成 72 条唯一文件回执及 10 个 tarball，全部包检查通过。原 checkout 的文件 SHA-256、权限、HEAD、tree 与状态均未改变。宿主使用第三方真实 N-API 模块验证加载；其他平台为 fixture 字节，只证明 API、身份和打包管线，不证明本项目原生 ABI。

后续补充的安装恢复、producer SHA 与 Linux 容器边界回归共 7 个文件、102 项通过。真实 Docker 先复现宿主 UID 1001 写入 root bindings 的 `EACCES`，以及 root 读取其他属主 checkout 的 `dubious ownership`；修复后准确的 Node 20.19.0 Alpine 容器成功采集。此实验使用合成二进制，仅证明权限、采集与 Node 兼容，不能替代八平台真实 ABI 验收。

[main 原发布工作流的 OIDC 审计](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40510156079)在准确源码 `60aca0b2377457a29ac7dc23309abb6690b25c6e` 上成功，40 个公开包的凭据交换均返回 201。此结果只证明当前交换权限；真实 nightly 上传、provenance 和发布后消费仍需首次完整运行确认。

当前记录处于实施阶段，尚未将本地 fixture 或构建测试作为真实 npm 发布、八平台消费和线上部署的证据。最终版本、PR、源码 SHA 与首次真实运行结果在交付时补充。
