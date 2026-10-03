---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: cc42fe878544770586c00e1aa22a6ed1d78d3800
regressions:
  - e2e/project-build-hbuilderx-cleanup.test.ts
  - e2e/hbuilderx-project-alias.test.ts
  - e2e/project-build-module.test.ts
  - e2e/workflow-cleanup.test.ts
---

# HBuilderX 项目关闭失败后的恢复入口

## 症状

完整扩展测试 `35635ddb` 的 static 阶段中，HBuilderX Alpha 5.31.2026093020 的 uni-app x 微信编译静默超时 120 秒，随后关闭本轮 alias 的命令再次超时 120 秒。入口吞掉关闭错误并删除 alias；测试只留下编译异常，IDE 项目是否关闭没有确认。首轮日志保存在 `.tmp/full-regression-35635ddb.log`。

## 根因与纠正

项目注册与文件别名是两个资源：只有严格关闭项目成功后，才能删除别名。原有 `finally` 把关闭失败转为成功，并无条件删除别名；删除本身抛错时还会覆盖编译错误。新增共享生命周期边界，将关闭失败及可恢复的 alias 路径一起抛出，保留底层 cause；编译和清理同时失败时聚合两者，首个异常仍为 cause。打开失败也进入关闭处理，不能假定 IDE 没有部分注册。

将 static 的 HBuilderX 实现提取到独立模块。新的 alias 每次领取使用独立 UUID，不再删除同名旧链接；同一进程重新构建不能覆盖上一轮关闭失败留下的入口。移除新 alias 的冗余预先关闭步骤，资源从本次打开开始管理。

## 验证

- 新增构建入口回归使用真实临时目录和符号链接、模拟命令边界：修复前 4 项失败、2 项通过，修复后 6 项通过。覆盖构建成功但关闭失败、打开/编译与关闭同时失败、编译失败但关闭成功、alias 删除失败保留主因以及正常释放。
- 同进程同项目重复领取回归：修复前 1 项失败、4 项通过；修复后 5 项全部通过，确认释放旧 alias 不影响新 alias 的源码访问。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/project-build-hbuilderx-cleanup.test.ts e2e/project-build-module.test.ts e2e/hbuilderx-project-alias.test.ts e2e/workflow-cleanup.test.ts --update=none`：4 文件 / 20 项通过，包含 standalone tsx 导入和假值异常聚合边界。
- 首次失败与修复后日志保留在 `.tmp/hbuilderx-alias-before.log`、`.tmp/hbuilderx-alias-reacquire-before.log` 和 `.tmp/hbuilderx-alias-after.log`。

## 适用边界

这次证明并修复清理及诊断缺陷，不能证明真实 HBuilderX 编译静默挂起已解决。官方日志没有对应请求的足够信息，computer use 又报告 Mac 锁定，尚需解锁后继续界面诊断及新一轮真实验收；不能据此把锁屏、定时器 warning 或环境继承直接认定为编译挂起根因。

不改变样式、编译产物、公开包 API 或超时预算，无需 public change intent 和 static 输出基线更新。其它 HBuilderX alias 调用者同步迁移共享边界后，还需各自的回归与最终完整流程验收。

## 规则评估

不新增 AGENTS。现有规则已要求确认资源归属并报告清理失败，本次用可执行回归落实边界。
