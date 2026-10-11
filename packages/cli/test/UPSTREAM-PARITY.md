# Tailwind CSS CLI test parity

Upstream baseline: `tailwindcss@4.3.3`.

| Upstream suite | Local coverage |
| --- | --- |
| `integrations/cli/index.test.ts` | `parity-build.test.ts`: file/stdin/stdout input, root/build invocation, watch/poll, optimization, source maps, cwd, silent output, errors and dependency rebuilds. |
| `integrations/cli/config.test.ts` | `parity-config-plugins.test.ts`: JS configuration, content discovery, relative configuration and imported stylesheet resolution. |
| `integrations/cli/plugins.test.ts` | `parity-config-plugins.test.ts`: CommonJS/ESM plugins, custom utilities, variants and relative plugin resolution. |
| `commands/canonicalize/canonicalize.test.ts` | `canonicalize-parity.test.ts`: positional/stdin/stream input, text/JSON/JSONL output and error handling. |
| `integrations/cli/standalone.test.ts` | Common CLI behavior is covered by the suites above. Native executable embedding and platform binary packaging are intentionally out of scope because `weapp-tw` is distributed as a Node package. |

The local tests execute the built `@weapp-tailwindcss/cli` binary entry in an isolated temporary project. They reuse the repository dependency installation without copying Tailwind's workspace-only integration runner.

The implementation uses the package's existing Tailwind v4 generator and design-system loader. It does not shell out to or depend on `@tailwindcss/cli`. Watch mode uses `@parcel/watcher` by default and supports the dependency-aware polling loop through `--poll` as a cross-platform fallback.

Reliability regressions additionally cover repeated native watch updates, error recovery and shutdown, external source-map feedback prevention, and input/output/map identity collisions (including filesystem aliases). These cases retain the existing public CLI interface.
