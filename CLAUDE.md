# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**weapp-tailwindcss** is a Turbo-based monorepo that brings TailwindCSS atomic styling to mini-program (小程序) developers. It provides comprehensive TailwindCSS support for WeChat Mini Programs, Taro, uni-app, remax, mpx, and other mini-program frameworks across webpack, vite, rspack, rollup, rolldown, and gulp build tools.

## Monorepo Structure

- **packages/** - Core packages including:
  - `weapp-tailwindcss` - Main package with CLI (`weapp-tailwindcss` or `weapp-tw`)
  - `@weapp-tailwindcss/shared` - Shared utilities
  - `@weapp-tailwindcss/postcss` - PostCSS plugin
  - `@weapp-tailwindcss/babel` - Babel transformations
  - `@weapp-tailwindcss/logger` - Logging utilities
  - `tailwindcss-injector`, `tailwindcss-core-plugins-extractor`, `tailwindcss-config` - Build tool integrations

- **packages-runtime/** - Runtime-specific implementations (vite, webpack integrations)

- **apps/** - Reserved workspace; mini-program demo projects have moved to `demo/`

- **demo/** - Framework-specific demo projects for the retained Tailwind CSS v3/v4 matrix (gulp, mpx, Taro webpack/vite, uni-app vite, weapp-vite)

- **templates/** - Project templates for different frameworks

- **website/** - Documentation website

- **benchmark/** - Performance benchmarking tools

- **e2e/** - End-to-end tests with CSS snapshot testing

## Common Development Commands

### Build
```bash
pnpm build                # Build all packages (uses turbo cache)
pnpm build:nocache        # Build without cache (TURBO_FORCE=1)
pnpm build:apps           # Build apps only
pnpm build:pkgs           # Build packages only
pnpm build:docs           # Build documentation website
pnpm build:demo           # Build demo apps
```

### Test
```bash
pnpm test                 # Run all tests (vitest)
pnpm test:dev             # Run tests in watch mode
pnpm test:core            # Run main package tests
pnpm test:plugins         # Run plugin package tests
pnpm test:typography      # Run typography tests
pnpm test:ui              # Run tests with UI
pnpm e2e                  # Run end-to-end tests
pnpm e2e:u                # Update e2e snapshots
pnpm bench                # Run benchmarks
```

### Development
```bash
pnpm dev:apps             # Run all apps in development mode
pnpm format               # Format code with prettier
pnpm lint                 # Lint code
pnpm lint:fix             # Fix linting issues
```

### Release
```bash
pnpm release              # Create a pnpm change intent
pnpm version-packages     # Apply pending versions and changelogs
pnpm publish-packages     # Publish stable packages through repoctl
pnpm release:pre          # Publish the current prerelease lane
pnpm pr                   # Enter alpha prerelease mode
pnpm pr:beta              # Enter beta prerelease mode
pnpm pr:rc                # Enter rc prerelease mode
pnpm pr:next              # Enter next prerelease mode
pnpm pr:exit              # Exit prerelease mode
```

### Demo Management
```bash
pnpm demo:install         # Install dependencies for demos
pnpm demo:install:beta    # Install beta versions for demos
pnpm demo:install:alpha   # Install alpha versions for demos
```

## Architecture Notes

### Package Entry Points
The main `weapp-tailwindcss` package exports multiple entry points for different use cases:
- Default: webpack/vite plugin
- `./webpack4`: PostCSS 7 + webpack 4 compatibility
- `./vite`, `./webpack`, `./gulp`, `./core`: Build-specific integrations
- `./escape`, `./types`, `./defaults`, `./presets`: Utilities
- CSS exports: `./preflight.css`, `./theme.css`, `./utilities.css`, `./uni-app-x.css`

### Turbo Build System
- Uses turbo for task orchestration and caching
- Build dependencies are defined in `turbo.json`
- `packages/*` and `packages-runtime/*` must build before `apps/*` and `demo/*`

### Workspace Dependencies
- Uses pnpm workspaces with `catalog:` for centralized dependency versioning (see `pnpm-workspace.yaml`)
- Internal packages reference each other with `workspace:*`

### Testing Architecture
- Root `vitest.config.ts` dynamically discovers all package vitest configs from workspace
- E2E tests use CSS snapshot testing (`e2e/update-snapshots` script syncs snapshots)

### Node.js Requirements
- Root package requires `node >= 18.0.0`
- Main `weapp-tailwindcss` package requires `node ^18.17.0 || >=20.5.0`
- Package manager: pnpm@11.5.3

### TailwindCSS Version Support
- Supports TailwindCSS v4, v3, and v2 JIT
- Different entry points handle different TailwindCSS versions

## CLI Tool
The package provides a CLI via `bin/weapp-tailwindcss.js`:
```bash
weapp-tailwindcss patch    # Patch TailwindCSS for mini-program compatibility
weapp-tw patch             # Shorthand alias
```

## Special Conventions
- ES modules throughout (`type: "module"`)
- TypeScript strict mode
- repoctl with pnpm change intents for versioning and release management
- Commitlint enforces conventional commits
- Primary documentation is in Chinese (tw.weapp.dev)
