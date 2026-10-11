# Issue 1210：H5 渐变和阴影

Refs #1210。H5 路由为 `/#/pages/issue-1210/index`，manifest 仅对 H5 启用样式隔离 2.0。

页面使用 scoped SCSS，覆盖两色/三色渐变、自定义渐变位置、普通/彩色阴影、ring、drop-shadow 和局部 `@apply`，末尾的手写渐变用于对照。

从仓库根目录运行：

```sh
pnpm exec cross-env CI=1 E2E_ISSUE_1210=1 vitest run --config e2e/vitest.e2e.config.ts e2e/issue-1210-web.test.ts --update=none
```

测试创建独立 dev 服务，验证项目身份、每轮保存标识和计算样式；退出时恢复本测试写入的页面内容。不要在同一页面运行两个会修改源码的用例。

HBuilderX 验证增加 `E2E_ISSUE_1210_HBUILDERX=1`；连接已有服务可设置 `E2E_ISSUE_1210_URL`。生产预览设置该 URL 并增加 `E2E_ISSUE_1210_PRODUCTION=1`，仅验证首次加载，不修改源码。

日志、CSS、截图和计算样式写入 `e2e/.artifacts/issue-1210/`。实际验证结果及 IDE 限制见 [根因复盘](../../../../docs/engineering/lessons/issue-1210-uni-app-x-web-runtime-properties.md)。
