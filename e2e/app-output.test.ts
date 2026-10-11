import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readExistingAppHmrTransformedOutput, readExistingAppTransformedOutput } from './hbuilderx-local/app-output'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'app-output-'))
  directories.push(project)
  const output = path.join(project, 'output')
  await fs.mkdir(output)
  await fs.writeFile(path.join(output, 'changed.ts'), 'new-color')
  await fs.writeFile(path.join(output, 'other.ts'), 'old-color')
  await fs.writeFile(path.join(project, 'intermediate.ts'), 'intermediate')
  const item = {
    transformedFiles: ['intermediate.ts'],
    transformedOutputFiles: ['changed.ts', 'other.ts'],
    hmrTransformedOutputFiles: ['changed.ts'],
  }
  return { project, output, item }
}

describe('App HMR 删除断言的产物边界', () => {
  it('完整输出保留其他组件，删除断言仅读取当前组件且仍能发现真实残留', async () => {
    const { project, output, item } = await fixture()
    expect(await readExistingAppTransformedOutput(project, output, item)).toContain('old-color')
    expect(await readExistingAppHmrTransformedOutput(project, output, item)).toBe('new-color')
    await fs.appendFile(path.join(output, 'changed.ts'), ' old-color')
    expect(await readExistingAppHmrTransformedOutput(project, output, item)).toContain('old-color')
  })

  it('被检查的产物缺失时不能把空内容当成删除成功', async () => {
    const { project, output, item } = await fixture()
    await fs.unlink(path.join(output, 'changed.ts'))
    expect(await readExistingAppHmrTransformedOutput(project, output, item)).toBeUndefined()
  })

  it('未指定局部范围时仍检查全部转换产物', async () => {
    const { project, output, item } = await fixture()
    const full = await readExistingAppTransformedOutput(project, output, item)
    expect(await readExistingAppHmrTransformedOutput(project, output, { ...item, hmrTransformedOutputFiles: [] })).toBe(full)
    const withoutScope = { ...item }
    delete withoutScope.hmrTransformedOutputFiles
    expect(await readExistingAppHmrTransformedOutput(project, output, withoutScope)).toBe(full)
  })
})
