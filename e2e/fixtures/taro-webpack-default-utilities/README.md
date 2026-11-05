# Windows 默认 utility 回归

依赖 manifest、pnpm 11.25.0 锁文件及安装配置来自用户复现模板
https://github.com/icebreaker-template/taro-webpack-tailwindcss-v4
（2026-09-06 本地复现版本，weapp-tailwindcss 5.5.1 / Tailwind CSS 4.3.3 / Taro 4.2.1）。

当前夹具已将 Tailwind CSS 及 `@tailwindcss/node`、`@tailwindcss/oxide` 的冻结依赖统一升级到 4.3.4。
保留原发布版核心、Taro、Webpack 与 manifest 中的历史 pnpm 声明，继续覆盖原 Windows 回归；
独立锁文件由仓库要求的 pnpm 12.15.0 生成，执行脚本仍只在临时副本同步仓库工具链。

页面和配置缩减到真实 CSS 入口、标准 utility 与特殊 utility 对照。
FirstCompilation 插件仅报告 Webpack 成功完成的生命周期，不参与源码扫描或生成。

运行 `pnpm e2e:windows-utilities`，在系统临时目录冻结安装原始模板。
脚本先验收发布版，再安装当前 worktree 打包后的核心包并验收开发首编译、生产构建。
Windows 发布版必须呈现标准规则缺失且特殊规则存在；其他系统发布版应正常。
安装或编译失败不会被计为成功复现。

静态基线为 `expected.json`，仅记录相关规则与声明，避免 bundler 格式和无关 CSS 影响比较。
修改基线使用 `pnpm e2e:windows-utilities --update`，CI 禁止更新。
报告、完整 WXSS/JS 和日志输出至 `e2e/.artifacts/windows-utilities`。

为使原发布核心兼容新版探针，独立 workspace 精确应用 `@weapp-tailwindcss/postcss@3.3.2` 的 pnpm 补丁。
补丁仅修改该发布包 ESM/CJS 的 `margin-trim` 正则，完整匹配 `inline` 或 `block`，不修改默认变量和原 Windows 回归身份。
删除条件：夹具明确迁移到包含正式修复的 PostCSS 版本，移除补丁后冻结安装、双入口探针回归及 `pnpm e2e:windows-utilities` 均通过；
不能用主仓库源码已修复代替独立发布包验证。
