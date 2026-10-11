---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: ca7ea050536c60f35f2be27593052c6f8b021931
regressions:
  - e2e/e2e-matrix.test.ts
---

# 多平台矩阵变化需要同步中英文生成文档

## 症状

Canonical template smoke 在执行 `pnpm support-matrix:check` 时失败，提示中文支持矩阵过期。同一提交在本地复现同样错误，尚未进入模板编译。

## 根因与纠正

此前补齐 issue-951 和 subpackage Taro 的微信构建覆盖后，矩阵源数据已变化，中英文生成文档仍保留旧覆盖信息。限定运行 `pnpm support-matrix:generate`，未修改生成器或手工调整支持声明。

按单元格去除表格对齐空格审查后，实质差异仅为：subpackage 的微信构建由本地候选改为已验证；issue-951 新增微信构建行，中文原因从“非微信小程序”改为“小程序”。中文表格其余大量行差异来自最大列宽变短后的自动对齐。App 平台仍标记本地测试，不因这次文档同步改变设备验收结论。

## 验证

先在本地执行 `pnpm support-matrix:check` 复现失败。重新生成后，同一检查、`pnpm agents:check` 与 `git diff --check` 通过；中英文页面另外通过文档站本地构建验证。没有运行快照更新或修改 demo 输出。

## 适用边界

该检查只证明文档与矩阵源一致，不证明所有登记的平台在当前设备或当前提交完成实测。远端失败记录为 GitHub Actions run `37125065073`，未通过等待或重跑掩盖失败。

## 规则评估

不新增 AGENTS。已有源码与文档同步要求足够，使用现有生成器和检查入口补齐漏项。
