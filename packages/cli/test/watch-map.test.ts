import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { createCliFixture, retryAssertion, spawnCli } from './parity-harness'

it.each(['out.css.map', 'dist/out.css.map'])('真实轮询构建忽略外置 map：%s', async (map) => {
  const project = await createCliFixture({
    'input.css': '@import "tailwindcss" source(none); @source "./pages";',
    'pages/index.html': '<div class="flex"></div>',
  })
  const child = spawnCli(project.root, ['-i', 'input.css', '-o', 'out.css', '--watch', '--poll=30', `--map=${map}`, '--silent'])
  let stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk.toString() })
  try {
    await retryAssertion(async () => expect(await project.read('out.css')).toContain('.flex'))
    await project.write('pages/new.html', '<div class="grid"></div>')
    await retryAssertion(async () => expect(await project.read('out.css')).toContain('.grid'))
    await fs.rm(path.join(project.root, 'pages', 'new.html'))
    await retryAssertion(async () => expect(await project.read('out.css')).not.toContain('.grid'))
    const mapPath = path.join(project.root, map)
    const stable = await fs.stat(mapPath)
    for (let round = 0; round < 4; round++) {
      await new Promise(resolve => setTimeout(resolve, 100))
      expect((await fs.stat(mapPath)).mtimeMs).toBe(stable.mtimeMs)
    }
    expect(stderr).toBe('')
  }
  finally {
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
    child.kill('SIGTERM')
    await exited
    await project.cleanup()
  }
})
