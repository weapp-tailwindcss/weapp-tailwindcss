---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1241
baseline: 87e1628127ab27eda402213768d70b1c2988166f
regressions:
  - e2e/issue-1241-dependencies.test.ts
  - e2e/watch-pnpm-identity.test.ts
---

# Issue 1241 安装准备的 pnpm 身份与失败证据

## 症状

全面回归 `521b648e-7f3d-4dd1-aa3a-d7ff5d0b46f9` 的 static 阶段，Issue 1241 watch 尚未创建项目就因 `pnpm install --ignore-scripts` 超过 120000 毫秒失败。原始异常同时包含 `Done in 3m 39.8s using pnpm v12.8.1`。仓库要求的是 `pnpm@12.6.0`。输出 `Done` 不能推翻 Execa 的超时结果，也不能证明后续 watch 已运行。

## 根因与纠正

临时 manifest 只固定框架依赖，遗漏仓库的 `packageManager`。离开仓库后直接执行 PATH 中的 pnpm 时，临时项目没有同一版本约束，因此实际使用了不同版本。另一个诊断缺口是 `support.ts` 只在依赖准备成功后保存身份和锁文件，准备失败不会生成本轮身份记录。

临时 manifest 现在继承根声明，版本探针与安装复用仓库的 pnpm 命令解析器；保留已选入口身份，并在临时项目目录核验实际版本。版本不符立即失败，安装不启动。显式借用已安装目录同样要求声明匹配，失败时不修改借用目录；报告记录是否复用，本次实测没有使用复用入口。

每轮安装准备使用临时目录名建立独立证据目录，在 manifest、版本核验、安装和依赖核验边界写入状态；保存要求版本、实际版本、Node、入口、命令、输出及原始错误。安装失败由 `cause` 保留，保存证据失败也与主失败聚合，不能静默吞掉。安装预算仍为 120000 毫秒，不修改系统 pnpm，不通过跳过安装或放宽门槛放行。

## 验证

最初四项回归在旧实现均失败，在修复后通过，分别覆盖工具链声明、版本漂移零安装、超时输出 `Done` 仍失败、版本探针启动失败的证据。补充依赖版本错误和借用目录声明错误，核对准备成功不代表依赖核验可省略，失败不修改借用项目。

定向命令设置 `CI=1`，禁止快照更新：

```sh
pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1241-dependencies.test.ts e2e/watch-pnpm-identity.test.ts --update=none
```

两文件共 15 项通过，0 失败、0 跳过。修改的 TypeScript 通过严格类型检查（含精确可选属性及索引访问检查）和 ESLint；`pnpm agents:check` 为 54 份规则、172 份文档、643 个命令、0 错误，`git diff --check` 通过。

一次新临时项目安装使用 Node v24.18.0、pnpm 12.6.0，通过全部七个固定依赖的版本核验；安装日志为 1.9 秒，准备总耗时 2065 毫秒。该项目初始没有依赖目录，使用现有全局 pnpm store，日志为 reused 495、downloaded 0；这不是清空缓存后的网络安装。证据位于 `e2e/.artifacts/issue-1241/preparation/issue1241-cold-install-4YF70y/`。运行前 16 个逻辑 CPU 的 load average 为 15.23 / 16.39 / 20.95。

原始全面失败保留在 `e2e/.artifacts/full-regression/521b648e-7f3d-4dd1-aa3a-d7ff5d0b46f9/workflow.log`。新旧运行条件不相同，因此本次成功只能证明版本身份固定和一次准备成功，不能把 pnpm 漂移认定为原先 219.8 秒耗时的原因。没有为得到成功反复安装。

## 适用边界

本次仅修复安装工具链身份和失败证据。没有修改 demo、CSS 生成或 static 语义，所以不更新样式基线，也不新增公开包 change intent。未执行完整 Issue 1241 watch、设备或全仓验收；原超时耗时原因仍需在相同条件下定位，不能声称所有安装超时已彻底解决。

## 规则评估

不新增 AGENTS 规则。已有 pnpm 版本身份、首次失败证据和不可放宽预算的约束已经足够，通过实际安装入口与持久回归落实。
