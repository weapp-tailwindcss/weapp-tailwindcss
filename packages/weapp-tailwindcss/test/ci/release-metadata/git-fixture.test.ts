import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { gitFixture } from './fixture'

const directories: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it('临时 Git 仓库不继承自动维护写者，原生命令也不能在测试回收后继续改写 .git', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-fixture-maintenance-'))
  directories.push(root)
  const config = path.join(root, 'global.gitconfig')
  const trace = path.join(root, 'trace.jsonl')
  // 低阈值确定性触发维护；同步模式保证旧实现的回归失败不会遗留后台进程。
  fs.writeFileSync(config, [
    '[maintenance]',
    ' auto = true',
    ' autoDetach = false',
    ' strategy = incremental',
    '[maintenance "loose-objects"]',
    ' enabled = true',
    ' auto = 1',
    '[maintenance "commit-graph"]',
    ' enabled = true',
    ' auto = 1',
    '[gc]',
    ' auto = 1',
    ' autoDetach = false',
    '',
  ].join('\n'))
  vi.stubEnv('GIT_CONFIG_GLOBAL', config)
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
  vi.stubEnv('GIT_TRACE2_EVENT', trace)

  const { cwd, before, after } = gitFixture()
  directories.push(cwd)
  expect(before).not.toBe(after)
  // 直接调用 Git 模拟 fixture helper 以外的消费方，验证仓库本身也持有禁后台维护边界。
  execFileSync('git', ['commit', '--allow-empty', '-m', 'test: external command'], { cwd, stdio: 'pipe' })
  execFileSync('git', ['gc', '--auto'], { cwd, stdio: 'pipe' })

  const events: Array<{ event: string, argv?: string[] }> = fs.readFileSync(trace, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  const writers = events.filter(event => event.event === 'child_start' && event.argv?.some(argument => ['maintenance', 'pack-objects', 'commit-graph'].includes(argument)))
  expect(writers.map(event => event.argv)).toEqual([])
  expect(fs.readdirSync(path.join(cwd, '.git', 'objects', 'pack'))).toEqual([])
})
