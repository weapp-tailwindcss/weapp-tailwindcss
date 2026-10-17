---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss
baseline: ae906eba230c8bc139973b76d247e43cdf0c22bc
regressions:
  - packages/weapp-tailwindcss/test/js.test.ts
  - packages/weapp-tailwindcss/test/wxml/index.test.ts
  - packages/weapp-tailwindcss/test/context/index.test.ts
  - packages/weapp-tailwindcss/test/compiler/core-compiler.test.ts
  - packages/weapp-tailwindcss/test/native-distribution.test.ts
  - e2e/public-package-types.test.ts
  - e2e/template-contract.test.ts
---

# 本轮验收收敛到 weapp-tailwindcss 包

## 症状

本轮任务最初按扩展全端入口编排，入口同时包含包构建、包消费、原生宿主、模板、React Native/Lynx、性能以及 website 构建和三浏览器截图。用户确认实际交付目标是 `weapp-tailwindcss` 包本身；继续执行 website 静态基线和浏览器阶段会增加耗时，却不能为这次包行为验收提供额外证据。

## 根因与纠正

扩展入口把仓库级验收面和包级回归面放在同一条调度链中，缺少由用户明确声明的产品范围边界。后续本轮将验收对象固定为 `packages/weapp-tailwindcss` 及其直接公开消费契约：包内单测、构建与声明、原生分发校验、公开包类型和模板契约；需要包才能运行的对应 E2E 仍按原有断言执行。

website 构建、website 三浏览器运行、website 截图审查和 website static 基线更新均标记为“用户范围外，未执行”。不安装或接受网站截图产物，不把网站阶段的跳过换算为包阶段通过。若后续任务修改 website 内容、文档发布链路或网站专用脚本，再单独按 website 规则建立验收范围和基线。

## 验证

包级验证使用当前候选提交和冻结依赖，命令应记录实际解析到的 Node、pnpm 以及本地构建产物：

```sh
pnpm --filter weapp-tailwindcss test
pnpm --filter weapp-tailwindcss build
pnpm --filter weapp-tailwindcss test:native
pnpm --filter weapp-tailwindcss test:native:package
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/public-package-types.test.ts e2e/template-contract.test.ts --update=none
```

定向验证需要保持公开接口、跨平台路径和原生分发断言；修复缺陷时先补包内回归，再运行受影响的直接消费契约。若把这些命令编排成包级全面验收，仍须先完成本轮 `prepare`、当前会话 computer use 证据和 `verify`；只有定向单测或预检自身回归可以不要求全端环境。不能用历史 website 报告代替当前包验证。

## 适用边界

本记录只描述当前用户授权的包级验收范围，不表示仓库的默认扩展入口已删除 website 阶段，也不表示其他平台或远端 CI 已通过。website 相关未执行项应在交付中单独列出；其他操作系统、原生架构和默认范围外的人工验收继续按未执行处理。

## 规则评估

不修改根规则或扩展入口的默认覆盖。范围变化只作为本任务的中文 change intent 和验收记录沉淀，避免把一次用户范围收敛误写成全仓永久跳过规则；若未来反复需要包级入口，再补充带明确命令、门禁和复查条件的独立编排入口。
