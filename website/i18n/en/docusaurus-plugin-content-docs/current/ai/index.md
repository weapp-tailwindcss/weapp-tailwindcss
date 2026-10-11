---
sidebar: aiSidebar
audience: maintainer
title: AI generates small program code
description: This page is about using AI to quickly build small programs. I hope it can help everyone continuously improve their development efficiency.
keywords:
  - AI programming
  - LLM
  - Workflow
  - AI
  - Generate applet code
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
  - mpx
---

#AI generates small program code

## Improve efficiency

This page is about using AI to quickly build small programs. I hope it can help everyone continuously improve their development efficiency.

At the same time, I also hope that everyone can discuss and participate together to quickly generate hundreds or thousands of small programs, APPs, and websites!

## AI Learning Center: Skill Quick Installation

The official skill suite is split into 1 compatibility router and 7 dedicated workflows. Install the full suite for setup, migration, troubleshooting, runtime, custom builds, Expo React Native, and ReactLynx/Rspeedy:

```bash
npx skills add sonofmagic/skills \
  --skill weapp-tailwindcss \
  --skill weapp-tailwindcss-setup \
  --skill weapp-tailwindcss-migrate \
  --skill weapp-tailwindcss-troubleshoot \
  --skill weapp-tailwindcss-runtime \
  --skill weapp-tailwindcss-custom-build \
  --skill weapp-tailwindcss-react-native \
  --skill weapp-tailwindcss-lynx \
  -y
```

The original `weapp-tailwindcss` name continues to serve as the lightweight coordination entry, and the old installation commands will not become invalid.

For detailed instructions, see: [Skill (Skill System)](/docs/ai/basics/skill)

:::warning Maintainers only
The following commands are for repository contributors and documentation maintainers, not for integrating `weapp-tailwindcss` into an application.
:::

## How to contribute

### Pre-environment

1. `nodejs@22`
2. `pnpm@11`
3. `Github` account

### start

Click [`fork weapp-tailwindcss`](https://github.com/weapp-tailwindcss/weapp-tailwindcss/fork), then go to `git clone` locally and open this directory:

1. Execute `pnpm i` to install dependencies
2. Execute `pnpm build:pkg` to build the local dependency package of `website`
3. Then `cd website && pnpm dev` (switch to the `website` directory, run `pnpm dev`, of course you can also right-click to open the terminal in `vscode`, and then run `pnpm dev`)
4. Visit `http://localhost:4000` which is the official documentation website of `weapp-tailwindcss`

Then, you can create a new `website/docs/ai` / `md` file in the `mdx` directory and write it, and the route will be automatically mapped to:

Go to `http://localhost:4000/docs/ai/{your_doc_name}` path

> For example, if you create a `v0.md`, your route is `http://localhost:4000/docs/ai/v0`
>
> If you create a `index.md`, for example, this page is an `index.md`. The access path of this page is http://localhost:4000/docs/ai

If you have materials, you can put them in the `website/docs/ai/assets/{your_doc_name}` directory and then reference them in the `md` file

## Example

### Website

1. https://v0.dev/

2. https://docs.crewai.com/guides

3. https://bolt.new/

### Upload pictures

For example, to implement `Web cloud music`, open `Web cloud music` on your mobile phone, then take a screenshot and upload it to `v0.dev`

> Screenshots here

### Prompt words

Then the prompt word is

- `The technology stack is uni-app vue3 tailwindcss, implement this page` (customized according to your needs)

Then just copy the code

> Screenshots here
