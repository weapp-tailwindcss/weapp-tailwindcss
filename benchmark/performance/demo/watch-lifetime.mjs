export async function withSerialWatchers(modes, start, measure) {
  for (const mode of modes) {
    const watcher = await start(mode)
    try { await measure(mode, watcher) }
    finally { await watcher.close() }
  }
}
