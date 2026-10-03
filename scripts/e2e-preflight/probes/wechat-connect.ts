import type { MiniProgram } from '@weapp-vite/miniprogram-automator'
import { Launcher } from '../../wechat/automator'
import { waitForProbe } from './wait'

export async function connectWechat(port: number, timeoutMs = 30_000) {
  const launcher = new Launcher()
  let mini: MiniProgram | undefined
  await waitForProbe(async () => {
    try {
      const connection = await launcher.connect({ wsEndpoint: `ws://127.0.0.1:${port}`, timeout: Math.min(3000, timeoutMs) })
      mini = connection
      return { ready: true, error: '' }
    }
    catch (error) {
      return { ready: false, error: String(error) }
    }
  }, value => value.ready, timeoutMs)
  return mini!
}
