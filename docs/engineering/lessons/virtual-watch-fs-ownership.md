---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1320
baseline: db117f17e9083ab0a4575a46dc15e364569563d6
regressions:
  - scripts/ci/demo-matrix/watch.test.mjs
  - scripts/ci/demo-matrix/virtual-removals.test.mjs
---

# 虚拟文件的监听存在性边界

## 症状

依赖升级后的本地完整 57 阶段验收在第 26 阶段失败：默认虚拟模块夹具空闲编译三次，超过既有上限二次。第 1–25 阶段通过，第 27–57 阶段未执行，不能将网站阶段或远端 CI 的成功视为整轮完成。

该轮网站三浏览器禁止更新验收实际完成：2124 passed、636 既有范围 skip、无 flaky/retry/result error。1204 次整图断言包含全部 20 张超高图；这些成功仅绑定上述源码和网站阶段。

## 根因与纠正

准确起始基线 e769e69b97c88b379a80d3cabca4fa20330b999a 的夹具实际解析 Webpack 5.105.4、Watchpack 2.5.2；升级后 Taro runner 固定 Webpack 5.91.0，解析 Watchpack 2.6.3。不能声称新旧 Webpack 版本相同。事件探针记录到 `scan (missing in initial scan)`，随后又出现 `watch (missing on attach)`。

Watchpack 2.6.3 的 macOS FSEventStream 启停后重新扫描会推进目录初始扫描完成时间。下一次挂载 watcher 时，纯虚拟文件在磁盘上依然缺失，错误触发 remove 和聚合重建。强制 polling 同样能够触发该边界。现代 Webpack 5.112.2 与 Watchpack 2.6.3 也能复现；仅给 Taro 降级 Watchpack 无法覆盖问题，且现代 Webpack 明确要求 `^2.6.3`。

修复放在 webpack-virtual-modules 0.6.2 的输入文件系统边界。插件在 afterEnvironment 和 watchRun 核对当前 WatchFileSystem，包装该实例的 watch，在实际 Watchpack 创建后为其 `_onRemove` 安装实例守卫。每个事件从监听器实际输入文件系统读取当前 `_virtualFiles`；仅精确路径仍为 own property 时忽略磁盘伪删除。真实物理删除、所有权结束后的删除及同批 change 保持原路。WeakSet 防止多插件重复包装，不修改全局原型。

不能只过滤 `emit('remove')` 或最终 aggregated 通知：原 `_onRemove` 仍会删除 aggregatedChanges 中的真实 change；Webpack 的 getInfo/pause 路径也直接读取这些集合。不能在最终回调中直接 return，否则可能已消费 once listener 并暂停监听。当前守卫在上述状态变化之前执行；不删除祖先目录依赖、不关闭物理 rescan、不放宽时间或编译次数门槛。

官方实现依据：[webpack-virtual-modules 0.6.2](https://unpkg.com/webpack-virtual-modules@0.6.2/lib/index.js)、[Watchpack 2.6.3](https://unpkg.com/watchpack@2.6.3/lib/index.js)、[目录监听实现](https://unpkg.com/watchpack@2.6.3/lib/DirectoryWatcher.js)。本轮核对上游正式版仍为 0.6.2，master 也没有该守卫。已有 [Issue #155](https://github.com/sysgears/webpack-virtual-modules/issues/155) 与 [Webpack 5 支持 PR #69](https://github.com/sysgears/webpack-virtual-modules/pull/69) 属于相关历史，不能视为本次问题已经被上游修复。

## 验证

在上述基线加本次未提交修复的 macOS、Node 24.22.1 工作树执行：

- `CI=1 pnpm test:demo:matrix`：72 files、1222 tests 全部通过。
- `CI=1 pnpm exec vitest run -c scripts/ci/demo-matrix/vitest.config.mts scripts/ci/demo-matrix/watch.test.mjs scripts/ci/demo-matrix/virtual-removals.test.mjs --update=none`：20 项定向通过。
- 根与 Mpx、Taro Webpack、uni-app Vite 三个独立模板的 `pnpm install --frozen-lockfile` 全部通过；模板各自先用 `pnpm install --lockfile-only` 生成锁文件。

回归覆盖 Taro 5.91.0 和现代 5.112.2、默认与 polling 监听、空闲上限、产物 42→84、真实物理更新/删除报错/缺失恢复、同批混合事件和恢复产物 88。额外验证 pause 聚合集合、once listener、动态 FS/map/所有权、多个插件、替换 WatchFileSystem，以及 POSIX、Windows 反斜杠、盘符根目录和相对路径的精确身份。

新物理夹具首轮在 modern polling 的混合阶段失败：虚拟更新先触发构建，磁盘删除尚未被 polling 发现，读取的是旧模块缓存。夹具改为在真实物理 remove 通知中写入虚拟模块，固定被验证的事件关系，随后同一四组矩阵通过；不靠延长等待或重复碰运气放行。

原始事件探针、准确基线、失败和回归日志保留在忽略目录 `e2e/.artifacts/dependency-upgrade-20261028/`。本轮新的完整预检、全部本地阶段、受影响 static 生成/禁止更新和最终 head CI 尚须完成；本记录保持 partial。

## 同轮安全审计补充

补丁本身仅改变虚拟文件存在性判定；在加入安全更新之前，四份变化锁规范化移除本补丁身份后与 db117f17 的业务图完全相同。随后刷新 audit，发现已存在版本的公告返回发生变化，不能把数据库新增公告说成该监听补丁引入漏洞，也不能只记录风险而遗漏已有兼容修复。

上游 Taro components-react 的 Solid peer 为 `*`，允许将 Solid 1.9.10 升为同系列 1.9.17，再按其官方 `~1.6.8` 配套升级 seroval/seroval-plugins 至 1.6.12；没有强制突破旧 Solid 的 `~1.3.0` 子依赖范围。MCP 新补丁明确允许 Hono node-server 2.1 系列，按官方范围更新到 2.1.5。根及受影响独立模板由 pnpm 定向更新锁，不修改 manifest、公开 Node 范围或 peer 范围。最终安装、锁图与审计结论以本轮最终采集为准。

Vue I18n 9 的 legacy 正式通道仍为 9.14.5：部分新公告要求 11.4.14，另有公告没有 patched_versions；DCloud 内部配套及 Mpx bridge 仍绑定 9 代，继续登记上游回补或专项迁移。公告撤回也不等于本仓库修复漏洞。

## 适用边界

补丁同时登记根及三个实际包含 0.6.2 的独立模板。uni-app Vite 模板的 unplugin 间接安装该包，但 Vite 构建不执行 Webpack 守卫；仍同步安装补丁，不能把它写成真实 Webpack 覆盖。uni-app Webpack 的 0.4.6 及其余四个不包含 0.6.2 的模板保持原锁。

插件接入沿用所审 Webpack 5.91.0/5.112.2 的异步 attach 行为，不声明任意自定义同步 WatchFileSystem 都已验证。此补丁不修复 Taro 固定 Webpack 的安全公告，也不扩大框架支持代际。上游正式版实现等价虚拟存在性边界且通过本仓库全部默认/polling、混合事件和物理恢复回归后，升级并删除根、三个模板的补丁与锁登记。

## 规则评估

不新增规则；沿用构建图取证、真实解析身份、根因回归及独立模板锁文件要求。[此前夹具包边界修复](virtual-watch-fixture-boundary.md) 的历史证据继续保留，其“polling 负对照应失败”只描述当时尚未修复虚拟 FS 边界的依赖版本，不能继续作为本补丁的期望行为。
