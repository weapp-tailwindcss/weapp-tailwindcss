---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 6f3df0d8e52b9de1b1a2d5e0aa0c2dc8e4984f35
regressions:
  - e2e/hbuilderx-mini-compile.test.ts
  - e2e/tailwind-build-providers.test.ts
  - e2e/tailwind-build-matrix.test.ts
  - e2e/hbuilderx-alias-consumers.test.ts
  - e2e/tailwind-taro-mini-artifacts.test.ts
---

# Tailwind 矩阵消费 HBuilderX 实际构建结果

## 症状

统一小程序矩阵的 uni-app x 微信条目只有登记信息，执行空命令不能产生构建证据。已有 HBuilderX runner 实际选择并验证 dev 输出目录，却丢弃该目录；矩阵按 production 目录重新推测，可能归档旧样式。两个真实红回归分别观察到旧 `.stale` CSS 被归档，以及经过收尾的环境异常被降为普通失败。

另一个红回归证明：调用方超时停止等待后，原宿主还没关闭，下一个 provider 就能开始。不能靠提高 Vitest 超时掩盖项目生命周期重叠。

## 根因与纠正

- provider 使用纯数据区分 command、hbuilderx-mini、documented。保留原 59 个 CLI 场景；将唯一 uni-app x 微信占位项接到真实 IDE 夹具，并新增普通 uni-app 的四个独立 IDE 场景。合计 64 项，其中 5 项 IDE、59 项 CLI。uni-app x 其它三平台仍属于既有明确限制，没有扩写支持范围。
- 完整展开 provider 后再执行过滤，定向 Taro 或单个 IDE 平台不能额外启动其它项目。重复夹具、同项目平台歧义立即失败。
- 小程序输出断言迁入独立模块，保留唯一根 JS/style、导入可达、全部 CSS、组件、分包及正负断言。第一个满足必需文件的候选选中后，样式失败不改试其它候选。所有文件检查共享一个截止时间，不逐文件重新领取预算。
- 编译返回同一已验证输出根、实际 host/版本及三次原始命令结果。open、launch、close 均核对退出状态及结构化 issue；退出零不能覆盖已知故障。确认关闭和别名清理后才交付成功；关闭未知时保留别名并阻断后续 provider。
- 删除前检查全部候选的项目内归属及链接，拒绝项目根、逃逸路径和符号链接。Windows 大小写不同的项目根使用路径相对关系终止祖先检查，避免走到盘符根自循环。
- 矩阵只归档 provider 交付的实际目录，立即保存原始 bundle。旧 CLI marker、模板和文件合同重定位到该目录后继续检查，不因更换 provider 丢弃断言。全部 IDE 条目补齐完整 Tailwind 指令残留检查。
- 合同和报告共用包含正则 source/flags、provider 与完整 IDE 夹具的定义；运行时绝对目录、host、命令和实际 HBuilderX 版本属于本轮证据，版本同时进入报告 identity。
- 当前环境故障案例保留 blocked 及日志回执，原异常继续穿透；后续案例才是未启动。mini-builds 使用逐调用绑定的生产终态回执，父调度器不解析聚合 Vitest 日志。
- scheduler 跟踪存活调用；调用方即使放弃等待，后续 provider 和最终回执仍等待实际流程及收尾结束。缺少终态时父入口继续 fail closed。

## 验证

辅助工作树基线为上述完整 SHA，包含本轮未提交改动；macOS、Node 24.18.0、pnpm 12.14.0。先记录失败，修复后使用 `CI=1`、`--update=none`：

```sh
pnpm exec vitest run -c e2e/vitest.e2e.config.ts \
  e2e/hbuilderx-mini-compile.test.ts e2e/tailwind-build-providers.test.ts \
  e2e/tailwind-build-matrix.test.ts e2e/tailwind-stage-receipt.test.ts \
  e2e/tailwind-runner.test.ts e2e/tailwind-scheduler.test.ts \
  e2e/hbuilderx-local-helpers.test.ts e2e/hbuilderx-local-styles.test.ts \
  e2e/hbuilderx-alias-consumers.test.ts e2e/project-build-hbuilderx-cleanup.test.ts \
  e2e/hbuilderx-project-alias.test.ts e2e/workflow-cleanup.test.ts \
  e2e/tailwind-taro-mini-registration.test.ts e2e/tailwind-taro-mini-artifacts.test.ts \
  --update=none
```

14 文件、159 项通过。日志保留 `.tmp/hx-matrix-red.log`、`.tmp/hx-active-red.log` 和 `.tmp/hx-final-validation.log`。定向 ESLint 通过。全仓 e2e 类型检查仍失败；使用 ES2022/DOM 的对照也有既有诊断，未扩大配置或添加白名单，本轮新增模块诊断已修正。

本次只改变执行、判定及证据归档，没有修改 demo 或生成样式；static 基线保持此前已审查的 Taro 更新，未自动更新任何快照。

## 适用边界

单测使用临时项目、受控 runner 和真实文件断言，不是 IDE 编译或设备运行证据。实际 64 项矩阵须重新完成 extended prepare、当前会话原生 Chrome computer use 和 verify 后执行，不能使用已经消费的旧预检。构建成功仅贡献 encoding 层级，RN served bundle、原生注册夹具、独立转换 oracle 等缺口仍保留。原十五目标历史报告及性能失败不改写。

## 规则评估

不新增 AGENTS 规则；现有项目归属、先红后绿、结构化环境错误、逐层证据及全面预检约束足够。本次将约束固化为可执行回归，并加入 `e2e:tailwind:contract`。
