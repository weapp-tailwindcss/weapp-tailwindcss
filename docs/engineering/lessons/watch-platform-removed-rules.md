---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: c6cdfff0c2fbd3e23c26c0b95f026429450ff9bc
regressions:
  - packages/weapp-tailwindcss/test/watch-hmr-removed-rules.unit.test.ts
---

# Watch 的平台负向规则契约

## 症状

Alpha 微信定向轮次 `1d1886be-d916-415a-9ea6-568cccb041ff` 的 IDE 三项通过，watch 基础任意值新增、删除通过，复杂集合在 `!mt-2` 证据比较处停止。保存的 `watch-complex-first-add` 产物另有四个条件 utility 的模板 token 存在、参考 CSS 缺失。`mini-program-css/finalize.ts` 按既有契约移除 `@supports`；默认 `cssRemoveHoverPseudoClass` 移除 hover 规则。这四项并非可以要求正向 CSS 命中的小程序能力，不能将其与变量签名及局部层叠顺序问题混为一个根因。

## 根因与纠正

uni-app x 的模板和脚本 watch 显式声明这四项负向预期及对应条件，仍保留全部复杂集合输入。断言要求原始或转义后的完整 token 确实传播，且其参考 CSS 必须为空；没有显式声明的缺失仍失败。PostCSS AST 同时检查全部输出，拒绝存活的 `@supports` 或 `:hover`，包括没有原类参考的 safe alias。字符串、属性文本和注释中的相同文本不能触发条件检查。不能依据实际未生成自动豁免，也不能用任意 safe alias 推测无 CSS 时的候选身份；支持的 utility 继续要求完整类和规则证据。

负向声明沿新增、替换、同字面量保存及扩展新增类检查传递。负向证据另记录同一消费位置的实际别名集合，用于最终回滚时相对基线检查新增 token 是否残留；替换阶段不猜测某个别名归属于哪条仍保留的 utility。这里验证明确的平台规则裁剪和 token 传播，不宣称证明任意无条件 safe alias 与被删除候选的映射。平台是否正确转换条件 AST 仍由 PostCSS 兼容层持久回归负责。

## 验证

`CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/watch-hmr-removed-rules.unit.test.ts test/watch-hmr-class-evidence.unit.test.ts test/watch-hmr-class-baseline.unit.test.ts test/watch-hmr-regression.unit.test.ts --update=none`：4 文件、170 项通过。新增回归覆盖正负预期混合、意外缺失、条件及别名规则存活、无来源 token 的别名误判、原类与别名回滚残留、基线保留，以及两个实际 mutation 配置保留全部条件 utility。

## 适用边界

本次只改变内部测试断言，不改变 demo 源码、生产 CSS 或公开导出，不提升公开包版本，也不需要重新生成 static 基线。实际完整 watch 尚需相关变量及生产层叠修复整合后重新预检验证，不能将这组单测计为设备或完整流程通过。

## 规则评估

不新增 AGENTS。使用显式正负契约落实既有“预期来自平台行为、不削弱门禁”的要求。
