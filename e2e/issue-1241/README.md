# Issue #1241 双 CSS 入口复现

从仓库根目录先执行 `pnpm --filter weapp-tailwindcss... run build`，再执行：

```sh
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1241.test.ts e2e/issue-1241-layout.test.ts e2e/issue-1241-watch.test.ts --update=none
```

项目在系统临时目录生成；首次通过 pnpm 安装 `dependencies.ts` 中固定的原始 uni-app/Vite/Vue/Tailwind 版本，临时 manifest 同时继承仓库根 `packageManager`。安装前核验实际 pnpm 版本；安装仍限制为 120 秒，不因日志包含 `Done` 忽略超时。`E2E_ISSUE_1241_DEPENDENCIES` 可指向已有安装目录，其 pnpm 声明和依赖版本必须匹配；报告明确记录是否复用。产品只消费本工作树的构建包并校验解析路径。

版本、锁文件、项目路径、日志和产物记录在 `e2e/.artifacts/issue-1241/`。安装准备从开始就写入 `preparation/<本轮临时目录名>/report.json`，记录阶段、要求与实际 pnpm、Node、命令和失败信息，`version.log` 与 `install.log` 保存对应输出；失败不覆盖其他轮次。失败项目保留以便排查。工具链身份修复及超时证据边界见 [准备期记录](../../docs/engineering/lessons/issue-1241-install-toolchain.md)。

watch 严格删除用例显式设置 `generator.hmr.preserveDeletedCss: false`，每轮核对新 marker、同一进程和同状态干净构建。默认保留删除类的产品行为不变。

DevTools 只在显式设置 `E2E_IDE=1` 和 `E2E_PREFLIGHT_WECHAT_CLI` 后执行 `e2e/issue-1241-ide.test.ts`。先按多端手册确认 IDE 实例；该用例只关闭自己打开的临时项目。四档布局页面与 static 基线共用代码。

基线更新必须单独加 `-u`，审查后再运行上面的不更新命令。根因、旧版对照和证据边界见 [修复记录](../../docs/engineering/lessons/multi-css-file-source-1241.md)。
