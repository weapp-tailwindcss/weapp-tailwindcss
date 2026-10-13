---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1284
baseline: a3f2d844844138648d72973906f09df75eb715b6
regressions:
  - packages/weapp-tailwindcss/test/ci/install-frozen-config.test.ts
  - packages/weapp-tailwindcss/test/ci/install-workspace.test.ts
---

# Windows 冻结安装夹具清理

## 症状

版本 PR 的完整验收在 Windows Server 2025、Node 24 下失败：真实 pnpm 冻结安装回归的 `finally` 删除临时根目录时出现 `EBUSY: resource busy or locked, rmdir`。对应 [run 38320948522 的兼容 job](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38320948522/job/115049428071) 测试提交为 `6689e8255fc842669ef515c0e013e4ad5d0ee6b5`，其余 385 项测试成功。

## 根因与纠正

夹具通过 `spawnSync` 调用 pnpm 和安装脚本；安装脚本没有强制退出，外层同步调用会等待进程自然结束。当前证据支持 Windows 临时目录句柄的暂态释放或扫描占用，不能证明安装进程泄漏，也不能由此推导生产安装器必须修改。

夹具原先以 `fs.rm` 默认的零次重试清理目录，退出后的短暂占用会直接使回归失败。清理改用 Node 自带的有界线性退避：最多 10 次、基础间隔 100 ms，累计等待上限约 5.5 秒。持续占用仍抛错，范围仅为此用例通过 `mkdtemp` 创建的目录；清理成功后明确断言目录不存在。

`finally` 的异常可能覆盖主体断言异常，因此首次日志只证明清理失败，不能据此声称这个用例的所有冻结安装断言已成功。修复后仍须完整执行真实安装、解析探针、产物物化、锁文件漂移拒绝和目录回收。

## 验证

macOS 本地包含未提交修复的工作树，pnpm 12.9.1：

- Node 24.18.0 与 Node 22.22.3 分别执行 `CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/install-frozen-config.test.ts test/ci/install-workspace.test.ts --update=none --coverage.enabled=false`，均为 2 个文件、10 项通过。
- Node 24 以 verbose reporter 再次确认真实入口为 pnpm-native 12.9.1，冻结安装用例及新增目录删除后置断言通过。
- 定向 ESLint（`--no-ignore`）与 `git diff --check` 通过。

Windows Node 24 的修复验收待新源码提交及自动重建的版本 PR 完整 CI 确认；macOS 结果不能代替 Windows 的目录锁行为验证。

## 适用边界

仅调整测试拥有的临时目录清理，不改变冻结安装参数、解析探针、业务断言、全局测试超时或生产安装器。没有重跑旧版本以碰运气，没有修改受管版本分支。源码修复先合 main，再由 Release 自动 prepare 生成新 head 并审批完整验收。

## 规则评估

不新增 AGENTS 规则。现有跨平台、进程归属和证据边界足以约束此问题，使用 Node 标准清理能力修复具体夹具。
