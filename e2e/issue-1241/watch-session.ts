import type { Buffer } from 'node:buffer'
import type { Project } from './project'
import process from 'node:process'
import { execa } from 'execa'
import { isCompileSuccessLine } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'

export function watchSession(project: Project) {
  let logs = ''
  let lastCompileSuccessAt = 0
  const child = execa(process.execPath, [project.uniBin, '-p', 'mp-weixin'], {
    cwd: project.root,
    env: { ...project.env, NODE_ENV: 'development', WEAPP_TW_HMR_TIMING: '0' },
    reject: false,
  })
  const collect = (chunk: Buffer) => {
    const text = chunk.toString()
    logs += text
    if (text.split(/\r?\n/).some(isCompileSuccessLine)) {
      lastCompileSuccessAt = Date.now()
    }
  }
  child.stdout?.on('data', collect)
  child.stderr?.on('data', collect)
  return {
    child,
    logs: () => logs,
    lastCompileSuccessAt: () => lastCompileSuccessAt,
    ensureRunning: () => {
      if (child.exitCode !== null) {
        throw new Error(`watch 提前退出：${logs}`)
      }
    },
    stop: async () => {
      child.kill('SIGTERM')
      await child
    },
  }
}
