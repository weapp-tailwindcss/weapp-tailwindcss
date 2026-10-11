---
title: Diagnose project configuration using doctor command
description: Use weapp-tailwindcss doctor to quickly check Node.js, Tailwind CSS, framework dependencies, and builder configurations.
keywords:
  - FAQ
  - Troubleshooting
  - doctor
  - diagnostic commands
  - weapp-tailwindcss
  - tailwindcss
  - postcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
  - mpx
---

# Use doctor command to diagnose project configuration

When the project has problems such as styles not being generated, classes in JS not being escaped, CSS entries not being scanned, plug-ins not taking effect on the target, etc., you can first run the `doctor` command to collect the project configuration status.

```bash npm2yarn
npx weapp-tailwindcss doctor
```

If you are not in the project root directory, you can specify the business project directory through `--cwd`:

```bash npm2yarn
npx weapp-tailwindcss doctor --cwd ./packages/miniprogram
```

## Check content

The `doctor` command only reads the local project file and does not modify the project configuration. Currently the following is checked:

| Check items              | Description                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `package.json`           | Confirm whether the command is running in the project root directory                  |
| Node.js                  | Check whether the current Node.js meets the minimum version requirements              |
| Package Manager          | Identify `packageManager`, `pnpm-lock.yaml`, `package-lock.json` or `yarn.lock`       |
| `weapp-tailwindcss`      | Check whether the current project has this plug-in installed                          |
| `tailwindcss`            | Check whether Tailwind CSS can be parsed and try to read the actual installed version |
| Tailwind configuration   | Check if `tailwind.config.*` exists                                                   |
| PostCSS configuration    | Check if `postcss.config.*` exists                                                    |
| Build mode configuration | Check if v5 project should remove Tailwind official PostCSS / Vite build plugin       |
| Framework dependencies   | Identify Taro, uni-app, MPX, Remax                                                    |
| Builder Configuration    | Recognize `vite.config.*` or `webpack.config.*`                                       |

## Output description

Ordinary output is suitable for manual troubleshooting:

```bash npm2yarn
npx weapp-tailwindcss doctor
```

JSON output is suitable for use in issues, CI or automation scripts:

```bash npm2yarn
npx weapp-tailwindcss doctor --json
```

Strict mode returns a non-zero exit code when `warn` or `error` is present, suitable for placement in project inspection scripts:

```bash npm2yarn
npx weapp-tailwindcss doctor --strict
```

## Common diagnostic results

### package.json not detected

It means that the command is most likely not running in the project root directory. Please switch to the business project root directory and try again, or use `--cwd` to specify the directory.

```bash npm2yarn
npx weapp-tailwindcss doctor --cwd ./demo/uni-app-vue3-vite
```

### tailwindcss not detected

It means that `tailwindcss` is not installed in the current project, or the dependency cannot be resolved from the current directory. Please confirm that the dependency installation is complete before running the diagnostic command again.

### Build mode projects still register the Tailwind official build plug-in

`weapp-tailwindcss@5` By default, the `WeappTailwindcss` builder plugin takes over Tailwind CSS generation. Do not register `@tailwindcss/postcss` or `@tailwindcss/vite` at the same time when building the mini program.

If the project already has `postcss.config.*`, only keep the business's own non-Tailwind plug-ins. The entry CSS of Tailwind CSS 4.x uses `@import "tailwindcss"` and `@source`; it should be passed to `cssEntries` explicitly through `WeappTailwindcss`, and the absolute path resolved from the project root directory should be used. `cssEntries` is not a switch that replaces import. The entry CSS still needs to be included in the build graph by the framework.

### tailwind.config.* not detected

Tailwind CSS 4 supports CSS-first configuration, and `tailwind.config.*` not being detected is not necessarily a problem. If the class in the JS string is not recognized, you need to check the `@source` in the CSS entry.

The current documentation only maintains Tailwind CSS 4 access instructions.

## issue feedback and suggestions

When submitting an issue, it is recommended to attach the following information:

```bash npm2yarn
npx weapp-tailwindcss doctor --json
```

Also add:

| Information          | Examples                                  |
| -------------------- | ----------------------------------------- |
| Framework            | Taro / uni-app / MPX / Native applet      |
| Builders             | Vite/Webpack/Gulp                         |
| Tailwind CSS version | v4                                        |
| Target               | WeChat Mini Program / H5 / App / Hongmeng |
| Reproduction command | `pnpm dev:mp-weixin`                      |

This allows you to more quickly determine whether the problem is related to dependency installation, Tailwind scan range, PostCSS registration, plug-in disabling conditions, or mini-program limitations.

See the [support matrix](/docs/reference/support-matrix) for verified framework, builder, and target coverage. `not covered` means that no reproducible automated or local evidence is currently recorded; it is not a claim that the capability is impossible.
