import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { planStep } from '../steps.mjs'

it.each(['native', 'static', 'enabled'])('%s 文本保存不写未变化的 CSS，样式更改和外部改写仍恢复', async (mode) => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'cost-step-isolation-'))
  try {
    const consumer = { project, mode }
    const css = '.probe { width: 41px }'
    const files = text => new Map([['entry.js', `// COST_SEQUENCE\n${text}`], ['style.css', css]])
    const save = async (inputs, marker) => {
      const writes = []
      await (await planStep(consumer, inputs, marker))({ afterWrite: file => writes.push(path.basename(file)) })
      return writes
    }
    await save(files('first'), 'marker-1')
    expect(await save(files('second'), 'marker-2')).toEqual(['entry.js'])
    if (mode === 'static') expect(await readFile(path.join(project, 'style.css'), 'utf8')).toContain('marker-1')
    const changed = files('second').set('style.css', css.replace('41px', '43px'))
    expect(await save(changed, 'marker-3')).toContain('style.css')
    expect(await save(files('first'), 'marker-4')).toContain('style.css')
    await writeFile(path.join(project, 'style.css'), 'external change')
    expect(await save(files('first'), 'marker-5')).toContain('style.css')
  }
  finally { await rm(project, { recursive: true, force: true }) }
})
