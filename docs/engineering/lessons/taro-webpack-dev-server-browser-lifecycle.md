---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1282
baseline: afd51b8e4872e9fbe1c8acc3146ccda0a17efb99
regressions:
  - e2e/taro-dev-server-open.test.ts
  - e2e/taro-webpack-react-tailwindcss-v4.test.ts
  - e2e/taro-webpack-vue3-tailwindcss-v4.test.ts
---

# Taro webpack Web 开发服务的浏览器边界

## 症状

[Watch nightly 38137425883](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/38137425883) 的 macOS Node 22 Taro React job 使用提交 `afd51b8e`，在 Web watch 阶段启动 Taro webpack 开发服务。测试通过后，runner 的最终清理日志记录 `Terminate orphan process: pid (91685) (Safari)`。

该日志只证明 runner 清理了一个 Safari 进程。已有进程采样未记录这个 PID 的父子关系，不能断言它由本轮 Taro 服务创建，也不能通过批量关闭 Safari 补齐证据。

## 根因与纠正

Web watch harness 已设置 `BROWSER=none`，但实际安装的 `@tarojs/webpack5-runner@4.2.1` 的 H5 runner 没有消费该环境变量。`dist/index.h5.js` 在 `devServer.open` 未设置或为 `true` 时将其改成开发服务 URL，再传给 webpack-dev-server；Taro CLI 的 build 参数没有 `--no-open`。

浏览器控制意图因此没有到达实际打开浏览器的消费方。两个被 Watch registry 消费的 Taro webpack Web demo，在 `BROWSER=none` 时显式配置 `h5.devServer.open=false`。其它值和未设置环境变量时仍由 Taro 使用原开发默认配置。

回归读取真实项目配置，用真实 Taro `Config`、`defineConfig`、项目依赖及 webpack-dev-server 归一化选项验证：禁止打开时 `open` 列表为空，原开发默认情况下保留一个服务 URL。probe 仅隔离配置加载不消费的 CLI doctor 导入，没有启动服务器、浏览器或业务编译；webpack compiler 和临时加载钩子在 `finally` 中释放。

## 验证

- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/taro-dev-server-open.test.ts --update=none`：7 项通过，覆盖 registry 项目集合及两个项目的 `none`、未设置、其它浏览器值。
- `pnpm exec eslint e2e/taro-dev-server-open.test.ts e2e/fixtures/taro-dev-server-open/probe.mjs --no-ignore --max-warnings=0`：通过。
- demo 配置在同一 `--stdin-filename` 下与修改前提交逐条比较，强制 lint 没有新增诊断；显式导入 `node:process` 删除了 React 10 条、Vue 9 条既有诊断。两个配置仍各有 35 条原有诊断，不能写成严格 lint 全绿。
- 两个项目的 static 基线重新生成及 `--update=none` 复验，由集成 worktree 限定项目执行；真实 source CLI Web watch 验证也由同一集成 worktree 统一执行和收尾。本记录在这些步骤完成前维持 `partial`。

## 适用边界

配置回归证明控制意图能通过真实 Config 到达 WDS 选项，不等同于完整 CLI 和真实浏览器运行已经验收。旧 head 的 nightly 成功也不能替代包含此修复的新 head。

此改动修复已证明的自动打开边界，不解释旧 Safari PID 的精确来源。旧 job 的 `memory probe exceeded 1000ms deadline` 是独立采样诊断，已有有效 RSS 样本及原预算通过；不能据此放宽采样期限或内存门槛。

## 规则评估

不新增 AGENTS 规则。现有资源归属、真实消费链和限定 static 基线规则已经覆盖此场景，新增配置回归用于持久验证控制边界。
