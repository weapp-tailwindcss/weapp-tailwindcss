---
title: 简介
description: weapp-tailwindcss 使用 Tailwind CSS 4 为 Web、小程序、App WebView、React Native 与 Lynx 生成目标端产物。
keywords:
  - 简介
  - intro
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - uni-app
  - taro
  - mpx
---
# 简介

## 总览

`weapp-tailwindcss` 是 Tailwind CSS 4 的跨端编译与构建集成层。它根据目标端生成 Web CSS、小程序兼容 CSS、App WebView 样式，并为 React Native 与 Lynx 集成提供共享的候选类和 token 基础。

核心包支持 Vite、Webpack、Rspack、Gulp 和 Node.js。小程序构建还会同步转换模板与脚本中的已生成类名；React Native 和 Lynx 由对应平台包接入。

:::info
核心生成器先通过 Tailwind CSS 4 编译候选类，再按目标端处理选择器、CSS 能力和类名映射。JS/WXML 转换只处理生成器确认过的候选集合。
:::

## 环境要求

- 当前版本要求 Node.js `^22.18.0 || >=24.11.0`。
- 使用 HBuilderX 的 `uni-app` / `uni-app x` 项目要求 HBuilderX `>=5.11`。

## 能力概览

- 为 Web、小程序和 App WebView 生成目标端 CSS，并提供 Vite、Webpack、Rspack、Gulp 与 Node.js 接入。
- 小程序构建会同步转换模板和脚本中的已生成类名；React Native 与 Lynx 使用对应平台包。
- 生成器只转换 Tailwind CSS 确认过的候选类，便于在多端构建中保持 CSS 与模板一致。

## 下一步

1. [安装依赖](/docs/quick-start/install)：安装 Tailwind CSS 与 `weapp-tailwindcss`，也可选择独立 CLI。
2. [各框架注册方式](/docs/quick-start/frameworks/uni-app-vite)：按项目构建工具接入插件。
3. [模板项目](/docs/community/templates) 或 [Tailwind CSS 4 默认模式参考](/docs/tailwindcss/v4-reference)：查看可运行示例与 CSS-first 约定。
