import { expect, it } from 'vitest'
import { benchmarkProjects } from '../scripts/projects.mjs'
import { isWatchReady } from '../scripts/watch-readiness.mjs'

it('uni 首次输出写入后仍等待 watcher 就绪，避免初始化期间吞掉首轮修改', () => {
  const project = benchmarkProjects.find(project => project.key === 'demo-uni-app-vite-tailwindcss-v4__mp-weixin')
  const state = {
    outputExists: true,
    outputHasContent: true,
    initialOutputMtime: 1,
    outputMtime: 2,
    watchReadyLog: project.watchReadyLog,
    logs: ['DONE Build complete. Watching for changes...'],
  }
  expect(isWatchReady(state)).toBe(false)
  expect(isWatchReady({ ...state, logs: [...state.logs, 'ready in 3767ms.'] })).toBe(true)
})
