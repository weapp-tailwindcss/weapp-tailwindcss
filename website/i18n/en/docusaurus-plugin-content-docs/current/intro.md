---
title: Introduction
description: weapp-tailwindcss compiles Tailwind CSS 4 for Web, mini programs, App WebView, React Native, and Lynx targets.
keywords:
  - introduction
  - intro
  - weapp-tailwindcss
  - tailwindcss
  - mini app
  - mini program
  - uni-app
  - taro
  - mpx
---

# Introduction

## Overview

`weapp-tailwindcss` is the cross-platform compiler and build integration layer for Tailwind CSS 4. It generates browser CSS, mini-program-compatible CSS, and App WebView styles, while sharing candidate and token foundations with the React Native and Lynx integrations.

The core package supports Vite, Webpack, Rspack, Gulp, and Node.js. Mini-program builds also transform generated class names in templates and scripts; React Native and Lynx use their corresponding platform packages.

:::info
The generator first compiles candidates with Tailwind CSS 4, then adapts selectors, CSS capabilities, and class mappings for the selected target. JS/WXML transforms only process candidates confirmed by the generator.
:::

## Environment requirements

- The current release line requires Node.js `^22.18.0 || >=24.11.0`.
- `uni-app` / `uni-app x` projects that use HBuilderX require HBuilderX `>=5.11`.

## Capabilities

- Generates target CSS for Web, mini programs, and App WebView through Vite, Webpack, Rspack, Gulp, and Node.js integrations.
- Mini-program builds transform generated class names in templates and scripts; React Native and Lynx use their corresponding platform packages.
- Only candidates confirmed by Tailwind CSS are transformed, keeping CSS and templates aligned across targets.

## Next steps

1. [Install dependencies](/docs/quick-start/install), including the optional standalone CLI.
2. Choose a [framework integration](/docs/quick-start/frameworks/uni-app-vite) for the project's builder.
3. Browse [templates](/docs/community/templates) or the [Tailwind CSS 4 reference](/docs/tailwindcss/v4-reference) for runnable examples and CSS-first conventions.
