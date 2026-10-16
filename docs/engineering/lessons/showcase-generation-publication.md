---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/blob/5f642c56b6567ac468e5721dcd45c89af1970530/scripts/update-showcase.ts
baseline: 5f642c56b6567ac468e5721dcd45c89af1970530
regressions:
  - website/scripts/showcase-generation.test.ts
  - website/scripts/showcase-publication.test.ts
  - website/scripts/showcase-content.test.ts
---

# Showcase 生成器与本地资源契约

## 症状

网站构建要求共享目录里的图片全部来自本地 `static/img/showcase`，但生成器在 `SHOWCASE_SKIP_IMAGES=1` 或单张图片下载失败时仍输出远端 URL。正常生成还会先清空旧图片，因此一次下载失败既可能产生不可构建的目录，也可能丢失此前可用的图片。

## 根因与纠正

维护入口沿用旧的远端回退和先清图流程，没有与共享目录的严格本地资源契约统一。现在跳过下载按唯一评论 ID 读取已发布的图片选择，逐个验证 URL、真实路径、文件类型与非空内容。案例改名或排序变化不再推断图片归属；没有对应案例、文件缺失或仅有远端图片就明确失败。无法证明归属的远端手动选择需要完整下载，本地 URL 或文件名仍可选择。复用时保留已有排名，正常下载继续调用原有二维码与尺寸排名和手动选择逻辑。

正常生成先在同文件系统的独立目录完成下载和渲染，等待所有下载结束，再验证所有被引用图片。图片、共享目录和中文正文都准备成功后才替换正式产物；替换失败逆序恢复，恢复失败保留旧备份并聚合错误，清理也等待所有目录结束并报告全部失败。翻译预检仍在任何写入之前，隐藏案例在下载之前过滤。

生成器与构建检查共用本地图片边界，拒绝显式绝对 URL、协议相对 URL、穿越、越界符号链接和空文件；即使远端域名碰巧等于 URL 解析基准域也不能放行。测试导入真实入口后触发原脚本的 Undici 与 DOM 类型冲突，返回值和请求参数统一使用实际调用库的类型。

## 验证

本次基于上述完整 SHA 的未提交修复，在 macOS arm64、Node 24.18.0、pnpm 12.9.1 验证。依赖使用冻结锁文件安装；未请求 GitHub、图片服务或二维码模型，也未改写真实 catalog、中文 MDX 或图片。

- 红证据取自基线原生成器的临时副本，仅加入与修复版相同的 root、source、download、rank、skip 参数和 CLI 导入保护。原有先清图、远端回退和直接写出主体不变；同一组 12 个真实入口回归全部失败，其中包含跳过下载输出远端 URL、缺图未拒绝、下载失败未保全和下载未隔离。保存了原源码、接缝 diff、哈希及测试日志。
- 绿证据：`CI=1 pnpm --filter @weapp-tailwindcss/website exec vitest run scripts/showcase-generation.test.ts scripts/showcase-publication.test.ts scripts/showcase-content.test.ts --update=none`，3 个文件、35 个用例通过。覆盖真实解析、渲染、隐藏、图片选择、本地化，以及预写与失败回滚。首次夹具把目录符号链接当普通文件读取，导致 `EISDIR`；已改用 `readlink` 记录链接本体，再用同一测试取得无夹具错误的红绿结果。
- 定向 ESLint、网站类型检查、现有共享资源检查、`pnpm agents:check` 和 `git diff --check` 作为提交检查；新 worktree 先构建网站类型检查需要的 cva、merge、variants 及其依赖，不复制其他 checkout 产物。

原始日志位于本任务 `showcase-generation-evidence-*` 证据目录，交付时同时提供准确位置及内容哈希；持久回归以上述仓库路径为准，不依赖本机临时目录重现。完整扩展验收由主流程在整合后重新预检执行，本记录不把定向回归当作全面验收。

## 适用边界

这是可捕获错误下的预写与恢复，不承诺断电、进程强杀或多个生成器并发时三个正式路径同时原子切换。未执行真实远端下载，也未在 Windows/Linux 系统上运行；对应平台路径分支通过参数化用例覆盖。此次未改 demo、样式或复现页，无需更新 static 基线；不涉及公开包行为，因此不新增发布 intent。

## 规则评估

本目录新增了批量替换与恢复链路，按根规则的高风险代码生成触发条件新增局部 `AGENTS.md`，并同步规则索引。规则只约束该生成边界，以真实入口失败回归为复查入口，不放宽根规则或增加新的审批流程。
