# 测试能力清单规则

## 适用范围

适用于本私有工具包。

## 核心职责

维护跨 Web、小程序、React Native、Lynx 共享的纯数据、类型与 CSS 夹具。

## 变更原则

- 不导入 Node、浏览器、框架运行时或任一公开包源码。
- 保留既有兼容性 case ID；原子子例通过映射补充，不改写历史身份。
- CSS 生成、设备控制、哈希和文件操作属于消费方，不放入本包。

## 测试要求

- 清单变更须覆盖唯一 ID、官方能力映射、夹具与预期的完整身份。
- 新增上游 root 必须显式登记；禁止数量阈值或默认 supported 代替覆盖。

## 推荐验证命令

- `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-inventory.test.ts --update=none`

## 提交前检查

- 保持 private，不进入公开包 dependencies。
- 原生和浏览器证据不能由静态清单通过推导。
