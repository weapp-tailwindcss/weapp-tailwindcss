# Headless 组件库开发指南

## 项目概述

本项目为 `@weapp-tailwindcss/ui` 提供了一套完整的 headless 组件库架构,支持原生微信小程序、uni-app 和 Taro 三大平台。

## 目录结构

```
packages-runtime/ui/
├── src/
│   ├── components/              # 组件源码目录
│   │   ├── core/                # 核心基础组件
│   │   │   └── button/          # Button 组件(已实现)
│   │   ├── feedback/            # 反馈类组件
│   │   ├── data-display/        # 数据展示组件
│   │   ├── navigation/          # 导航类组件
│   │   └── layout/              # 布局组件
│   ├── adapters/                # 平台适配器
│   │   ├── native.ts            # 原生小程序适配
│   │   ├── taro.ts              # Taro 适配
│   │   ├── uni-app.ts           # uni-app 适配
│   │   └── index.ts             # 统一导出
│   ├── hooks/                   # 跨平台 Hooks
│   │   └── use-controllable-state.ts
│   ├── utils/                   # 工具函数
│   │   ├── class-names.ts       # 类名合并
│   │   ├── platform.ts          # 平台检测
│   │   └── accessibility.ts     # 无障碍辅助
│   ├── preset.ts                # Tailwind 预设
│   ├── variants.ts              # Variants 定义
│   └── index.css                # 样式入口
├── scripts/
│   └── generate-component.ts    # 组件生成脚本
└── README.md
```

## 已完成的功能

### ✅ 阶段一: 基础设施

- [x] 创建组件目录结构
- [x] 创建平台适配器 (native, taro, uni-app)
- [x] 创建跨平台 Hooks
- [x] 创建工具函数
- [x] 创建组件生成脚本

### ✅ 阶段二: 核心组件

- [x] Button 组件 (Taro 实现)

### ✅ 配置更新

- [x] 更新 package.json 导出配置
- [x] 支持组件、工具、Hooks 的独立导出

## 使用指南

### 安装

```bash
npm install @weapp-tailwindcss/ui
```

### 导入组件

```tsx
// 导入 Button 组件
import { Button } from '@weapp-tailwindcss/ui/components'

// 或单独导入
import { Button, ButtonProps } from '@weapp-tailwindcss/ui/components/core/button'
```

### 导入工具函数

```tsx
// 导入类名合并工具
import { cn } from '@weapp-tailwindcss/ui/utils'

// 导入平台检测
import { currentPlatform, isNative, isTaro } from '@weapp-tailwindcss/ui/utils'
```

### 导入 Hooks

```tsx
// 导入受控/非受控状态管理
import { useControllableState, useDisclosure, useToggle } from '@weapp-tailwindcss/ui/hooks'
```

### 导入适配器

```tsx
// 导入当前平台适配器
import { adapter, getCurrentAdapter } from '@weapp-tailwindcss/ui/adapters'
```

## 组件开发

### 使用组件生成脚本

```bash
# 生成新组件
npm run gen:component core input

# 生成带测试的组件
npm run gen:component core input --with-tests
```

### 手动创建组件

每个组件应包含以下文件:

```
components/<category>/<name>/
├── index.ts                    # 导出入口
├── types.ts                    # TypeScript 类型定义
├── <name>.taro.tsx             # Taro 组件
├── <name>.uni.vue              # uni-app 组件 (待实现)
├── <name>.native.wxml          # 原生小程序模板 (待实现)
├── <name>.native.ts            # 原生小程序逻辑 (待实现)
└── README.md                   # 组件文档
```

### Button 组件示例

```tsx
import { Button } from '@weapp-tailwindcss/ui/components'

// 基础用法
<Button>点击我</Button>

// 不同变体
<Button tone="primary" appearance="solid">主要按钮</Button>
<Button tone="danger" appearance="outline">危险按钮</Button>
<Button tone="secondary" appearance="ghost">次要按钮</Button>

// 不同尺寸
<Button size="sm">小按钮</Button>
<Button size="md">中等按钮</Button>
<Button size="icon">图标</Button>

// 状态
<Button disabled>禁用按钮</Button>
<Button loading>加载中</Button>

// 块级按钮
<Button block>块级按钮</Button>

// 带图标
<Button leftIcon="🚀">左侧图标</Button>
<Button rightIcon="→">右侧图标</Button>
```

## 开发路线图

### 待实现组件

#### 核心组件

- [ ] Input - 输入框
- [ ] Textarea - 多行文本
- [ ] Checkbox - 复选框
- [ ] Radio - 单选框
- [ ] Switch - 开关
- [ ] Select - 选择器

#### 反馈类组件

- [ ] Toast - 轻提示
- [ ] Modal - 模态框
- [ ] Dialog - 对话框
- [ ] Alert - 警告提示
- [ ] Loading - 加载指示器
- [ ] Skeleton - 骨架屏
- [ ] Progress - 进度条

#### 数据展示组件

- [ ] Card - 卡片
- [ ] Avatar - 头像
- [ ] Badge - 徽章
- [ ] Tag - 标签
- [ ] List - 列表
- [ ] Table - 表格
- [ ] Collapse - 折叠面板

#### 导航组件

- [ ] Tabs - 标签页
- [ ] Pagination - 分页器
- [ ] Breadcrumb - 面包屑
- [ ] Menu - 菜单
- [ ] Dropdown - 下拉菜单

#### 布局组件

- [ ] Grid - 网格
- [ ] Flex - 弹性布局
- [ ] Divider - 分割线
- [ ] Spacer - 间距

## 贡献指南

1. 创建新组件前,先使用生成脚本创建基础结构
2. 遵循现有的代码风格和命名规范
3. 为组件添加完整的 TypeScript 类型定义
4. 编写组件文档和使用示例
5. 添加单元测试(如需要)

## 设计原则

### 开放代码

- 开发者可直接修改组件源码
- 不封装黑盒,保持透明

### 跨平台统一

- 单一 API 支持多平台
- 通过适配器抹平差异

### 样式解耦

- 逻辑与样式分离
- 样式由 Design Token 驱动
- 使用 Tailwind CSS 和 tailwind-variants

### 灵活组合

- 组件采用组合式设计
- 支持受控/非受控模式
- 提供丰富的 Props 配置

## 技术栈

- **TypeScript** - 类型安全
- **Tailwind CSS** - 原子化样式
- **tailwind-variants** - 样式变体管理
- **tailwind-merge** - 类名合并
- **React** (Taro) - UI 框架
- **Vue** (uni-app) - UI 框架

## 许可证

ISC

## 联系方式

- 仓库: https://github.com/weapp-tailwindcss/weapp-tailwindcss
- 问题反馈: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues
