---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/pull/1244
baseline: 8ecb7f6a14c56453834188c87bd9c69183ac84dc
regressions:
  - e2e/template-contract.test.ts
---

# 模板契约检查的发现边界

## 症状

完整 static 验收在读取已删除模板的 package.json 时出现 ENOENT。本机该目录只剩被忽略的 dist 和 node_modules，但测试遍历 templates 下所有目录，将缓存误认为正式模板。

## 根因与纠正

模板契约属于仓库源码约定，应以受跟踪的顶层模板 manifest 为边界。改用 Git 的 glob pathspec 发现 templates 下一级 package.json，排除嵌套依赖和已删除模板的残留目录。受跟踪文件即使在工作树缺失，仍进入检查并报错，不通过 exists 判断掩盖缺失。

## 验证

`pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/template-contract.test.ts --update=none`：11 项通过。新增临时仓库回归包含带空格目录、受跟踪的嵌套依赖、遗留 dist、以及受跟踪 manifest 被删除后的失败语义。

## 适用边界

该发现函数用于 Git checkout 内的仓库契约检查，不是已发布脚手架的模板发现 API；Git 调用失败会直接失败。未更改模板源码或本机残留文件。

## 规则评估

不新增规则。已有扫描边界及不清理非本任务文件的要求足够；此修改不触发公开包发布。
