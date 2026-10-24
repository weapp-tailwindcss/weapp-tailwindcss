---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1316
baseline: ce91720685bf369b6dabe308923cc2a5cbe8898d
regressions:
  - packages/weapp-tailwindcss/test/bundlers/webpack-web-gradient.integration.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webpack/source-build-receipt.test.ts
---

# Webpack watch 回执绑定本轮来源与编译

## 症状

Linux / Node 22.23.3 的 [PR Gate run 40083217069 / job 120843135400](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/40083217069/job/120843135400) 在 Webpack 渐变消费图集成测试的第二轮失败。加入未知消费后，期望保留 `to right in oklab`，收到的 CSS 仍只有原来的 `.author-reset`，连新增的 `.author` 都没有。

这份首败不能单独证明渐变降级错误：测试仅凭可变 `compiler.modifiedFiles` 含有同一路径完成当前请求，没有证明该次 compilation 已消费本轮文件内容，编码前输入也存于一个跨轮可写变量。本机 macOS arm64 / 同版本 Node 的一次原测试加被动模块观察通过，未复现原 CI 失败；原失败的具体回调与文件写入先后仍未知。

## 根因与纠正

已确认的缺口属于验收协议：相同路径可以有多个在途变更，路径不能表示一次来源版本，跨轮全局编码输入也不能表示某个 compilation。不能只等待目标渐变值出现，那会让本轮错误结果被后续正确结果掩盖。

每次保存加入独立的来源 revision，恢复原样式也使用新 revision。在该 compilation 的 `processAssets` 中同时截取 palette 的已加载 NormalModule 源与编码前 CSS，存为只含字符串的快照，并用 `WeakMap<Compilation, receipt>` 关联。watch callback 只消费 `stats.compilation` 对应的快照；旧来源回执不能完成新请求。一旦来源标识匹配，立即交付该轮 CSS 并执行原渐变、未知消费及磁盘产物一致性断言，即使它们错误也不能跳过本轮等待下一轮。

此处 NormalModule 源是 loader 执行后的模块内容，用于确认唯一 fixture 标识已经被本轮消费；没有在产物后置阶段读取源码，也没有修改产品转换逻辑。20 秒预算和既有行为断言保留。

## 验证

把旧的无来源过滤回执语义提取到独立 helper 后，确定性的迟到回执与恢复轮次用例得到 2 项失败、1 项通过；这证明回执协议缺口，不等同于重现 Linux 的原始文件系统时序。修订后补充数字前缀不能冒充 revision 的负例，以及来源正确但 CSS 错误仍立即交付的用例。

在 `42806f0ac` 基础、含本次测试改动的 macOS arm64 下，通过 Node 22.23.3 直接调用本地 Vitest，设置 `CI=1`、`--update=none` 验证。等价仓库入口为：

```sh
pnpm exec vitest run --project=weapp-tailwindcss packages/weapp-tailwindcss/test/bundlers/webpack/source-build-receipt.test.ts packages/weapp-tailwindcss/test/bundlers/webpack-web-gradient.integration.test.ts packages/weapp-tailwindcss/test/bundlers/webpack-web-cascade.integration.test.ts --maxWorkers=1 --no-file-parallelism --update=none
```

3 文件、10 项通过、零跳过；修改源码及测试的 ESLint 显式使用 `--no-ignore` 并关闭 Prettier 规则，通过。准确整合 head 的 Linux CI 仍待执行。

## 适用边界

这次修订保证测试不会把旧来源编译冒充当前请求，不能据此声称已发现或修复 Webpack 产品缓存缺陷。如果准确 head 仍交付错误来源或错误渐变，继续从真实 compilation、loader 与产物图定位。

临时 Webpack 项目没有对应的 demo/static 快照；本轮仅改变该测试的来源标识和回执，没有修改 demo 或持久样式基线。生成的临时 CSS 继续由原集成断言核对并按测试生命周期清理。

## 规则评估

不新增 AGENTS。既有来源版本、真实构建回执和不使用目标产物过滤错误轮次的要求足够，通过持久回归约束此次缺口。
