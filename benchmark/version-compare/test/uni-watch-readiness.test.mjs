import { expect, it } from 'vitest'
import { benchmarkProjects } from '../scripts/projects.mjs'
import { isWatchBuildComplete, isWatchReady } from '../scripts/watch-readiness.mjs'

const project = benchmarkProjects.find(project => project.key === 'demo-uni-app-vite-tailwindcss-v4__mp-weixin')

it('uni 首次输出写入后仍等待 watcher 就绪，避免初始化期间吞掉首轮修改', () => {
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

it.each(['Incremental Compiling...', '开始差量编译...'])('Uni 增量提交必须有本轮开始日志：%s', (start) => {
  const done = '\u001B[32mDONE\u001B[39m  Build complete. Watching for changes...'
  const logs = [done, start]
  expect(isWatchBuildComplete(logs, project.watchBuildLogs)).toBe(false)
  expect(isWatchBuildComplete([start, done], project.watchBuildLogs)).toBe(true)
  expect(isWatchBuildComplete([...logs, 'DONE  Build complete. Watching for changes...'], project.watchBuildLogs)).toBe(true)
  expect(isWatchBuildComplete([...logs, 'DONE  Build complete. Watching for changes...', start], project.watchBuildLogs)).toBe(false)
})

it('不把 Uni 提交日志协议套到其他框架', () => {
  expect(benchmarkProjects.filter(item => item.watchBuildLogs).map(item => item.key)).toEqual([project.key])
})
