# Tailwind 四端能力验收

<!-- agents:cwd=root -->

## 适用范围

适用于本目录的能力清单、生成/转换审计、浏览器及原生运行时报告。

## 核心职责

固定 Tailwind 注册表并维护逐案例、逐目标、逐验证层级的可重放证据。

## 变更原则

- 支持预期和语义 oracle 在运行前声明，禁止从本轮失败推导 unsupported。
- 共享 catalog 只放数据、类型、CSS；扫描用例不能从共享目录或 inline source 注入同一候选。
- 生成、编码、运行时、像素和负向证据不能互相代替。没有独立 oracle 的能力保留 not-run。
- 新报告使用 schema v2；旧报告仅作历史展示。报告必须绑定源码、锁文件、工具版本、夹具、预期、run ID 和原始产物。
- 本地统一调度必须消费本轮 extended 预检；微信继续使用上级规定的受保护连接和清理入口。
- 浏览器后台运行并在 finally 关闭自己的资源。原生宿主证据必须重读 PNG 和 sidecar 验真。

## 测试要求

判定变更必须补反例：错误样式、部分声明丢失、选择器/媒体条件丢失、空集合、过期报告及截图均不得通过。

## 推荐验证命令

- `pnpm e2e:tailwind:contract`
- `pnpm e2e:tailwind --list`
- `pnpm e2e:tailwind --preflight-report <本轮报告>`

## 提交前检查

更新受影响项目 static 基线并审查，以 `CI=1`、`--update=none` 重跑。记录通过、失败、阻塞和未执行范围，不能由退出码推断全部注册能力均可实际渲染。
