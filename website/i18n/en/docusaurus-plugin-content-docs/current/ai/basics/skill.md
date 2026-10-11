---
sidebar: aiSidebar
title: Skill (skill system)
description: Install and use the weapp-tailwindcss official Skill Kit split into tasks.
keywords:
  - AI programming
  - LLM
  - Skill
  - weapp-tailwindcss
  - Tailwind CSS 4
  - Mini program
  - uni-app
  - taro
  - mpx
  - React Native
  - ReactLynx
---

# Skill (skill system)

`weapp-tailwindcss` official skill is for business project users. It splits the current v5 access, migration, troubleshooting and advanced capabilities into independent workflows, avoiding the need for one big Skill to maintain all frameworks and APIs at the same time.

This project uses [`vercel-labs/skills`](https://github.com/vercel-labs/skills) to install Skill. `weapp-tailwindcss/weapp-tailwindcss` is the content source of fact, and `sonofmagic/skills` is the user-facing aggregated installation repository.

## Install the complete package

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

You can also install only the compatible coordination entrance:

```bash
npx skills add sonofmagic/skills --skill weapp-tailwindcss
```

The coordination portal is responsible for identifying tasks and recommending specialized skills; the complete implementation and reference materials are located in each specialized skill.

View all installable content in the aggregation warehouse:

```bash
npx skills add sonofmagic/skills --list
```

## Skill division of labor

| Skill                            | Usage scenarios                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `weapp-tailwindcss`              | Generalized request, task identification, security baseline and compatibility entry  |
| `weapp-tailwindcss-setup`        | New setup, framework selection, standalone CLI, Tailwind CSS 4, and multiple targets |
| `weapp-tailwindcss-migrate`      | v4 to v5, legacy patch, CLI, generator, and environment migration                    |
| `weapp-tailwindcss-troubleshoot` | CLI, style generation, class translation, rpx, HMR, and runtime troubleshooting      |
| `weapp-tailwindcss-runtime`      | Dynamic class, merge, cva, variants and escape/unescape                              |
| `weapp-tailwindcss-custom-build` | Core API, self-developed bundler, style injection and sub-packaging isolation        |
| `weapp-tailwindcss-react-native` | Expo Metro, Native manifest and Android/iOS runtime                                  |
| `weapp-tailwindcss-lynx`         | ReactLynx, Rspeedy, Lynx native CSS, and encoder compatibility                       |

## Current common baseline

- Currently, only Tailwind CSS 4 is maintained on the mainline.
- The current `weapp-tailwindcss` manifest requires Node.js `^22.18.0 || >=24.11.0`; the HBuilderX project uses at least 5.11.
- The same managed build only generates Tailwind CSS by `WeappTailwindcss`, without overlaying the official Tailwind PostCSS/Vite generation plug-in.
- Tailwind entry uses pure CSS and must be actually imported by the project; `cssEntries` uses absolute paths and cannot replace the build map import.
- H5/Web usually retains plug-ins, and the generator automatically selects the Web target.
- JavaScript class only converts Tailwind-verified exact candidates of `classNameSet`.
- `@weapp-tailwindcss/cli` emits Web CSS by default; `--target weapp` only converts generated CSS and does not replace a full mini-program bundler.
- React Native uses a style manifest, while ReactLynx preserves `className` and emits Lynx native CSS; these pipelines are not interchangeable.

## Local development installation

Execute in the root directory of this warehouse:

```bash
npx skills add . \
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

## Prompt word example

```text
Use $weapp-tailwindcss-setup to configure the WeChat applet and H5 for the new uni-app Vue3 Vite project, giving complete files and verification steps.
```

```text
Use $weapp-tailwindcss-migrate to migrate old projects that are still running weapp-tw patch and @tailwindcss/vite to v5.
```

```text
Use $weapp-tailwindcss-troubleshoot to locate why the newly added arbitrary value class is no longer generated after the second HMR.
```

```text
Use $weapp-tailwindcss-custom-build to design in-memory conversion and sub-package style injection timing based on weapp-tailwindcss/core.
```

```text
Configure Metro for Expo SDK 54 and verify manifest warnings using $weapp-tailwindcss-react-native.
```

```text
Use $weapp-tailwindcss-lynx to configure Tailwind CSS 4 for ReactLynx and Rspeedy and inspect encoder warnings.
```

## Maintenance and verification

Source code is located at `skills/<skill-name>/`. Each directory contains `SKILL.md`, `agents/openai.yaml`, and `references/` loaded on demand.

```bash
pnpm skills:validate
npx skills add . --list
```

For the release link, see: [Skill Release and Synchronization] (/docs/ai/basics/skill-release).
