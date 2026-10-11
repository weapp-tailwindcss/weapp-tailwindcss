# mpx-tailwindcss-v4

`Mpx + Tailwind CSS v4 + weapp-tailwindcss` 小程序模板。

## 适用场景

- 使用 `Mpx` 开发微信小程序
- 需要直接体验 `Tailwind CSS v4` 在小程序侧的接入方式
- 希望保留 `weapp-tailwindcss` 的补丁与样式转换链路

## 技术栈

- `Mpx`
- `Tailwind CSS v4`
- `weapp-tailwindcss`
- `pnpm`

## 使用前提

- Node.js `22.12+`（`weapp-tailwindcss@5.2.0` 起）
- `pnpm`
- 微信开发者工具

## 快速开始

```bash
pnpm install
pnpm serve
```

如果要直接打开微信开发者工具：

```bash
pnpm open
```

## 常用命令

```bash
pnpm serve   # 小程序开发构建
pnpm build   # 小程序生产构建
pnpm lint    # 代码检查
pnpm open    # 打开微信开发者工具
```

## 模板说明

- 生成模式不需要配置 `postinstall: "weapp-tw patch"`
- 输出目录为 `dist/wx`
- 如需调整类名提取范围，请同步检查 `tailwind` 与构建配置

## 相关文档

- `weapp-tailwindcss`：<https://tw.weapp.dev/>
- `Mpx`：<https://mpxjs.cn/>
