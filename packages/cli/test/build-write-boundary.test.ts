import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { runTailwindCli } from '../src/build'

const generation = vi.hoisted(() => ({ generate: vi.fn(), dispose: vi.fn() }))
vi.mock('weapp-tailwindcss/generator', () => ({
  resolveTailwindV4Source: async () => ({ dependencies: [] }),
  createWeappTailwindcssGenerator: () => generation,
}))
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
  vi.clearAllMocks()
})

it('生成过程中输出变为输入别名时，在任意产物写入前拒绝', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-write-boundary-'))
  roots.push(root)
  const input = path.join(root, 'input.css')
  const output = path.join(root, 'out.css')
  const map = path.join(root, 'out.css.map')
  await fs.writeFile(input, '.original{}')
  await fs.writeFile(output, 'previous output')
  generation.generate.mockImplementation(async () => {
    await fs.link(input, map)
    return { css: '.flex { display: flex }', dependencies: [] }
  })
  await expect(runTailwindCli(['--cwd', root, '-i', 'input.css', '-o', 'out.css', '--map=out.css.map', '--silent'])).rejects.toThrow(/identical/)
  expect(await fs.readFile(input, 'utf8')).toBe('.original{}')
  expect(await fs.readFile(output, 'utf8')).toBe('previous output')
  expect(generation.dispose).toHaveBeenCalledTimes(1)
})
