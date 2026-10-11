---
sidebar: aiSidebar
audience: maintainer
title: LLM Friendly Documentation (llms.txt)
description: >-
  LLM Friendly Documentation (llms.txt): Current concepts, configuration guidance, and practical examples for
  weapp-tailwindcss users.
keywords:
  - AI programming
  - LLM
  - Workflow
  - Friendly documentation
  - llms.txt
  - ai
  - llms
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
  - mpx
---

# LLM friendly documentation (llms.txt)

## Generation method

:::warning Maintainers only
This section describes the documentation-site generation flow, not application build steps for `weapp-tailwindcss` users.
:::

1. Execute `pnpm --filter @weapp-tailwindcss/website build` (or `cd website && pnpm build`) in the warehouse root directory.
2. After building, `website/build/` will generate:

- `llms.txt` (index)
- `llms-full.txt` (full content)
- `llms-index.json` (product, integration, API, migration, and troubleshooting index)
- `llms-index-full.json` (complete index including blog, AI fundamentals, and history)
- `llms-quickstart.txt` (Getting Started/AI Workflow)
- `llms-api.txt` (configuration, API, migration and issues)
- Remove the pure Markdown file of MDX import to facilitate direct feeding to the model.

## Online address

- `https://tw.weapp.dev/llms.txt`
- `https://tw.weapp.dev/llms-full.txt`
- `https://tw.weapp.dev/llms-index.json`
- `https://tw.weapp.dev/llms-index-full.json`
- `https://tw.weapp.dev/llms-quickstart.txt`
- `https://tw.weapp.dev/llms-api.txt`

English assets are served from the site root, while Chinese assets use the `/zh-cn` prefix.

## Example prompt words for AI

> You can read the entry and configuration instructions of weapp-tailwindcss from https://tw.weapp.dev/llms-quickstart.txt and https://tw.weapp.dev/llms-api.txt Please cite the relevant links when answering.

## Offline use

- Download `llms-full.txt` directly to the model.
- Or package the Markdown file in the generation phase as a whole for model context retrieval.
