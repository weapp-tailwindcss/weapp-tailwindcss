# @weapp-tailwindcss/hbuilderx-runner

> English | [简体中文](./README.zh-CN.md)

Stable HBuilderX CLI runner utilities for local e2e workflows, demo scripts, and future CLI wrappers.

```ts
import {
  createHBuilderXRunner,
} from '@weapp-tailwindcss/hbuilderx-runner'

const hbuilderx = await createHBuilderXRunner({
  channel: 'alpha',
  cwd: projectRoot,
})
console.log(hbuilderx.resolution)

await hbuilderx.prepareProject({ cwd: projectRoot })

const launch = hbuilderx.startLaunch({
  cwd: projectRoot,
  platform: 'app-android',
  args: ['--deviceId', 'emulator-5554'],
})

await launch.stop()
```

The package only stabilizes the HBuilderX invocation layer. It does not handle Tailwind or mini program style transformation.

## Scope

- Resolve stable and Alpha installations through `channel: 'auto' | 'stable' | 'alpha'` or `HBUILDERX_CHANNEL`.
- Bind the native CLI path, the host returned by `listhost`, and the `version --host` result to one runner session so another running edition cannot capture commands.
- Wrap `project open/close`, `launch`, long-running processes, timeouts, recent logs, and process-tree cleanup.
- Classify common failures into `HBuilderXCommandError`, including project recognition failures, config load failures, missing Android/iOS/Harmony toolchains, and timeouts.
- Provide local Android `adb`, iOS Xcode/simulator, and Harmony `hdc` probes for e2e and demo scripts.

## Edition selection

The default channel is `auto`. Resolution uses this precedence:

1. An explicit CLI candidate/path passed to the API;
2. `HBUILDERX_CLI_PATH`;
3. A running instance matching `channel` or `HBUILDERX_CHANNEL`;
4. Default macOS install paths, preferring stable over Alpha in `auto` mode.

The macOS defaults are `/Applications/HBuilderX.app/Contents/MacOS/cli` and `/Applications/HBuilderX-Alpha.app/Contents/MacOS/cli`. Set `HBUILDERX_CLI_PATH` for non-standard Windows/Linux installations.

`resolveHBuilderXCli` returns an explicitly configured existing path without querying running processes. `resolveHBuilderXCliInfo` also reports `isRunning`, so it still queries the operating system. A configured runner connects through the native CLI host handshake.

If one CLI matches multiple hosts, the runner reports an ambiguity instead of guessing. Set `HBUILDERX_HOST` or pass `host` to `createHBuilderXRunner`.

Some HBuilderX releases reject concurrent stable and Alpha processes. The runner never closes an existing instance automatically; it reports `cli-instance-mismatch` when the target edition cannot start, so close the conflicting instance before retrying.

`runPnpmCommand`, `spawnPnpmCommand`, `hbuilderxPnpmArgs`, and the synchronous `startLaunch` remain for compatibility. Use a bound runner when the stable/Alpha choice must be deterministic; the `@dcloudio/hbuilderx-cli` pnpm wrapper performs its own process discovery and cannot provide that guarantee.

## Timeouts and cleanup

After `timeoutMs`, `runCommand` cleans up its own process before waiting for the real `close` event and final logs. Cleanup has a separate budget: POSIX waits up to one second after the requested signal, then up to one second after `SIGKILL`; Windows runs `taskkill /T /F` with a five-second timeout, then waits up to one second for closure. Cleanup already in progress also waits for descendants in the default detached process group, including descendants that close their pipes before the root exits.

A graceful exit code of zero after the business deadline still has the `timeout` classification. `allowFailure` permits business failures, but never cleanup failures. `HBuilderXCommandError.cleanupError` and `cause` retain cleanup diagnostics alongside the command, cwd, observed exit and recent logs. A Windows partial tree-termination failure remains an error even if the root closes.

Call and await `stop()` before a long-running root process closes. Repeated calls share the same cleanup result. Natural closure revokes the numeric PID/group handle to avoid targeting a later process that reuses it; services that deliberately leave the group are outside this scope. With `detached: false`, only the owned root's closure is confirmed. The synchronous `killProcessTree` remains a best-effort compatibility request, not cleanup confirmation. Unreaped POSIX orphan processes or persistent permission errors that prevent confirmation cause conservative cleanup failure.
