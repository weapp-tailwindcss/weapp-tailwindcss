import { setTimeout } from 'node:timers/promises'

export async function waitForProbe<T>(read: () => Promise<T>, ready: (value: T) => boolean, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  let value: T
  do {
    value = await read()
    if (ready(value)) {
      return value
    }
    await setTimeout(Math.min(50, Math.max(0, deadline - Date.now())))
  } while (Date.now() < deadline)
  throw new Error(`探针状态未就绪：${JSON.stringify(value)}`)
}
