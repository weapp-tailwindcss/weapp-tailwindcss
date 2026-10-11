import { existsSync } from 'node:fs'
import process from 'node:process'

/** 通过跨进程取消信号进入原有 finally，先恢复源码再结束 watch 会话。 */
export function assertWatchCommandActive(env: NodeJS.ProcessEnv = process.env) {
  const cancelFile = env['E2E_WATCH_CANCEL_FILE']
  if (cancelFile && existsSync(cancelFile)) {
    throw new Error('watch command was cancelled; restoring owned sources')
  }
}
