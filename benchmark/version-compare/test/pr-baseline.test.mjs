import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { resolvePrBaseline } from '../scripts/pr-baseline.mjs'

it('主分支推进后以实际合并父提交为基准，不把上游变化算入 PR', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'perf-pr-base-'))
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const commit = async (file, content) => {
    await writeFile(path.join(cwd, file), content)
    git('add', file)
    git('commit', '-m', 'test: 基准身份回归')
    return git('rev-parse', 'HEAD')
  }
  try {
    git('init', '-b', 'main')
    git('config', 'user.name', 'Benchmark Test')
    git('config', 'user.email', 'benchmark@example.invalid')
    git('config', 'commit.gpgsign', 'false')
    const base = await commit('base.txt', '原始主分支')
    git('switch', '-c', 'feature')
    const head = await commit('pr.txt', '本次 PR')
    expect(resolvePrBaseline({ cwd, head, base })).toEqual({ tested: head, baseline: base })
    git('switch', 'main')
    const advanced = await commit('upstream.txt', '其他 PR 的生产变化')
    git('merge', '--no-ff', 'feature', '-m', 'test: 模拟 GitHub 临时合并')
    expect(resolvePrBaseline({ cwd, head, base })).toEqual({ tested: git('rev-parse', 'HEAD'), baseline: advanced })
    expect(() => resolvePrBaseline({ cwd, head: base, base })).toThrow('不属于本次 PR')
    git('switch', '--detach', advanced)
    expect(() => resolvePrBaseline({ cwd, head, base })).toThrow('已确认的 head')
  }
  finally { await rm(cwd, { recursive: true, force: true }) }
})
