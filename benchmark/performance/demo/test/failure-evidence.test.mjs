import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { saveWatchFailure } from '../failure-evidence.mjs'

it('超时保存当前源码与旧 JS/CSS 产物，并在原消费项目清理后仍可诊断', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'watch-failure-'))
  const project = path.join(root, 'consumer')
  const output = path.join(project, 'dist')
  const destination = path.join(root, 'evidence')
  try {
    await mkdir(output, { recursive: true })
    await writeFile(path.join(project, 'entry.js'), 'current-marker')
    await writeFile(path.join(root, 'shared.css'), '.current{}')
    await writeFile(path.join(output, 'entry.js'), 'previous-marker')
    await writeFile(path.join(output, 'entry.wxss'), '.previous{}')
    const context = { mode: 'static', phase: 'measure', operation: 'config', marker: 'current-marker', offset: 42 }
    const result = await saveWatchFailure({ project, inputs: ['entry.js', 'entry.js', path.relative(project, path.join(root, 'shared.css'))], output, destination, context, error: new Error('本轮产物超时') })
    await rm(project, { recursive: true, force: true })
    const saved = JSON.parse(await readFile(path.join(destination, 'manifest.json'), 'utf8'))
    expect(saved).toEqual(result)
    expect(saved.context).toEqual(context)
    expect(saved.error).toContain('本轮产物超时')
    expect(saved.files).toHaveLength(4)
    expect(new Set(saved.files.map(file => file.saved)).size).toBe(4)
    for (const file of saved.files) {
      expect(path.dirname(path.resolve(destination, file.saved))).toBe(destination)
    }
    const source = saved.files.find(file => file.kind === 'source' && file.original === 'entry.js')
    const script = saved.files.find(file => file.kind === 'output' && file.original === 'entry.js')
    expect(await readFile(path.join(destination, source.saved), 'utf8')).toBe('current-marker')
    expect(await readFile(path.join(destination, script.saved), 'utf8')).toBe('previous-marker')
  }
  finally { await rm(root, { recursive: true, force: true }) }
})

it('文件删除或无产物时保留缺证原因和原失败，不伪造恢复成功', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'watch-failure-missing-'))
  try {
    const result = await saveWatchFailure({ project: root, inputs: ['deleted.tsx'], output: path.join(root, 'absent-dist'), destination: path.join(root, 'evidence'), context: { mode: 'native', phase: 'reset' }, error: new Error('恢复 marker 超时') })
    expect(result.error).toContain('恢复 marker 超时')
    expect(result.files).toHaveLength(1)
    expect(result.files[0].error).toBe('ENOENT')
  }
  finally { await rm(root, { recursive: true, force: true }) }
})
