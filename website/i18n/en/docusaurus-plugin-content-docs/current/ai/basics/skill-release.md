---
sidebar: aiSidebar
title: Skill publishing and synchronization
description: Describe the verification and synchronization process of weapp-tailwindcss official skill from the source warehouse to the aggregated installation warehouse.
keywords:
  - Skill
  - release
  - synchronous
  - sonofmagic/skills
  - weapp-tailwindcss
  - AI programming
  - Workflow
  - Mini program
---

# Skill publishing and synchronization

`weapp-tailwindcss/weapp-tailwindcss` by `skills/` is the only source of truth for official Skill content. The `sonofmagic/skills` installed and used by users is an aggregation warehouse, and copies are not manually maintained here.

## Synchronization relationship

```text
weapp-tailwindcss/weapp-tailwindcss@main:skills/
  -> sonofmagic/skills@main:skills/weapp-tailwindcss/
```

The `Sync Skills From Upstreams` workflow of the aggregation warehouse regularly pulls the entire `.github/skills-sources.json` directory based on `skills/`. There is no need to submit directly to the aggregation warehouse when adding, deleting or renaming skills.

## Check before publishing

1. Verify directory, frontmatter, references, UI metadata and trigger use cases:

```bash
pnpm skills:validate
```

2. Use the official skill validator to verify the directories one by one.
3. Check discoverable names locally:

```bash
npx skills add . --list
```

4. Temporarily install the full package and verify that each `--skill` name is valid.
5. Do independent forward testing with positive, adjacent boundary and negative cue words.
6. Build the website after synchronizing the README, AI home page, Skill page and LLM entrance.

## Release process

1. Submit `skills/**`, verification corpus and document entry in this warehouse.
2. Merge into `main`.
3. Wait for the scheduled synchronization of the aggregation warehouse, or manually run the `Sync Skills From Upstreams` workflow of the aggregation warehouse when immediate release is required.
4. Check whether the sync submission contains 8 Skill directories.
5. Perform `sonofmagic/skills` and temporary installation verification from `--list`.

Skills no longer use standalone `skill-weapp-tailwindcss-v*` tags or GitHub Release as content distribution mechanisms. The version history is based on the submission of the source warehouse and the synchronous submission of the aggregation warehouse.

## User installation command

The full suite of commands remains consistent in the documentation:

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

Do not use `--all` instead of this command on an aggregation repository because the aggregation repository also contains skills from other projects.
