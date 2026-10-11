---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1244
baseline: 88e349a22ef365cbd20ed3716b12688ce418b4ef
regressions:
  - packages/weapp-tailwindcss/test/bundlers/vite-asset-source-ownership.unit.test.ts
  - e2e/watch/hot-update/demo/taro-vite-react-tailwindcss-v4.test.ts
  - e2e/watch/hot-update/demo/taro-vite-vue3-tailwindcss-v4.test.ts
---

# Vite 临时 CSS 资产的归属

## 症状

全面 watch 验收中，Taro Vite React 普通分包新增 class 后，JS 已正确转译，最终 WXSS 却没有对应选择器。仅跑分包也能稳定复现，排除了主包长链路状态累积。

## 根因与纠正

调试日志证明引擎生成了分包样式：临时 `index3.css` 的生成结果约 7 KB。插件随后根据源码推导最终输出路径，提前搬运结果并清空临时资产。Taro 后续使用该临时资产创建最终 WXSS，因此最终得到空内容。

此前 transform 留下的本轮延迟生成标记证明当前资产仍待下游映射，此时保持当前资产身份，由 bundler 完成后续命名和平台后缀映射。不通过目录名、固定后缀或后置读源码推断归属。

标记还需结合既有临时 CSS 资产阶段判断：uni-app 的最终平台资产也可能携带标记，不能阻止其 import shell 与生成目标解析。新增 `.wxss/.acss/.ttss` 最终资产回归，复用既有 `isTemporaryCssAssetFile` 边界。

初版也将 `originalFileNames` 单独视为待映射证明，全面单测发现这会改变多入口候选隔离和根 import shell 契约。来源元数据只说明来自哪个文件，不说明当前处于哪个产物阶段；已收窄为只有本轮延迟标记保护临时资产，普通来源元数据继续走最终资产归属解析。

没有明确归属的资产继续使用既有来源解析；根样式 import shell 的独立目标映射保持原契约。变更使用同一 bundle 的资产 API，没有直接写输出目录。

## 验证

- 新回归在修复前收到空字符串，修复后保留完整 CSS。延迟标记分别带/不带 `originalFileNames`，覆盖 POSIX、Windows 反斜杠、盘符根目录及相对路径；另补普通来源元数据不得阻止最终资产归属解析。
- CSS 延迟生成、组合、import、最终资产与缓存贡献的 7 个测试文件、90 项回归通过。
- `pnpm --filter @weapp-tailwindcss/scripts test:watch-hmr --case taro-vite-react-tailwindcss-v4 --mini-program-scope subpackages --skip-build --timeout 30000`：普通和独立分包全部通过。
- 同样的定向命令分别使用 `--case taro-vite-react-tailwindcss-v4:alipay` 和 `--case taro-vite-vue3-tailwindcss-v4`：支付宝 React 与微信 Vue3 的两种分包全部通过，覆盖真实 `.acss` 与 `.wxss`。
- `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/taro-vite-react-tailwindcss-v4.test.ts e2e/taro-vite-vue3-tailwindcss-v4.test.ts --update=none`：8 项静态验收通过，产物基线无变化。
- 收窄保护条件后，完整 `vite-plugin.bundle.unit.test.ts`、资产归属与 helpers 共 238 项通过；支付宝 React 与微信 Vue3 的普通/独立分包 watch 再次通过。纠正记录及日志位于 `e2e/.artifacts/preflight/1f40394e-d9aa-49a9-b0e7-257926d715af/`，保留最初全量单测的两项失败。
- 最终平台资产边界回归修复前失败、修复后通过，相关测试增加到 241 项。`E2E_PROJECT_FILTER='^uni-app-vite-tailwindcss-v4$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/apps-generator-mode-compare.test.ts --update=none`：11 项通过，含小程序、Web、App 样式；原 import shell 基线恢复，无快照更新。证据位于 `e2e/.artifacts/preflight/4a5340c0-116a-43fe-abae-440aa1e0f052/`。
- 证据保存在 `e2e/.artifacts/preflight/b2597d4d-c7ca-4078-8424-620deac4f67b/`，包含原始超时日志、暂停时源码与产物、调试日志及三个通过报告。完整验收需在本次生产源码修改后的新预检下执行。

## 适用边界

只在来源元数据明确证明当前资产归属时保留 bundler 命名。不依赖临时资产是否恰好叫 `index3.css`，也不能把旧输出路径当作当前构建图的所有权证明。

## 规则评估

不新增 AGENTS 条目。现有 bundler 生命周期、模块图和资产图约束已覆盖该问题，新增回归负责防止提前搬运资产的行为再次出现。
