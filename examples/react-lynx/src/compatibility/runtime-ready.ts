interface RenderedRect {
  width: number
  height: number
}

interface RuntimeReadyOptions {
  intervalMs?: number
  now?: () => number
  sleep?: (duration: number) => Promise<void>
  timeoutMs?: number
}

function isRendered(rect: RenderedRect | null | undefined) {
  return Boolean(rect && rect.width > 0 && rect.height > 0)
}

export async function waitForProbeLayout(
  measure: (id: string) => Promise<RenderedRect | null | undefined>,
  options: RuntimeReadyOptions = {},
) {
  const intervalMs = options.intervalMs ?? 250
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? (duration => new Promise(resolve => setTimeout(resolve, duration)))
  // 软件 Android 模拟器首次 Lynx 布局可能明显慢于本机。
  const deadline = now() + (options.timeoutMs ?? 120_000)

  while (true) {
    const [probe, control] = await Promise.all([
      measure('probe-layout-aspect'),
      measure('control-layout-aspect'),
    ])
    if (isRendered(probe) && isRendered(control)) {
      return true
    }

    const remaining = deadline - now()
    if (remaining <= 0) {
      return false
    }
    await sleep(Math.min(intervalMs, remaining))
  }
}
