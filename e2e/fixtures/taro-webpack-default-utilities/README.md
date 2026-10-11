# Windows 默认 utility 回归

依赖 manifest、pnpm 11.25.0 锁文件及安装配置来自用户复现模板
https://github.com/icebreaker-template/taro-webpack-tailwindcss-v4
（2026-09-06 本地复现版本，weapp-tailwindcss 5.5.1 / Tailwind CSS 4.3.3 / Taro 4.2.1）。

页面和配置缩减到真实 CSS 入口、标准 utility 与特殊 utility 对照。
FirstCompilation 插件仅报告 Webpack 成功完成的生命周期，不参与源码扫描或生成。

运行 `pnpm e2e:windows-utilities`，在系统临时目录冻结安装原始模板。
脚本先验收发布版，再安装当前 worktree 打包后的核心包并验收开发首编译、生产构建。
Windows 发布版必须呈现标准规则缺失且特殊规则存在；其他系统发布版应正常。
安装或编译失败不会被计为成功复现。

静态基线为 `expected.json`，仅记录相关规则与声明，避免 bundler 格式和无关 CSS 影响比较。
修改基线使用 `pnpm e2e:windows-utilities --update`，CI 禁止更新。
报告、完整 WXSS/JS 和日志输出至 `e2e/.artifacts/windows-utilities`。
