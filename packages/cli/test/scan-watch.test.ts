import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { createCliFixture, retryAssertion, runCli, spawnCli } from './parity-harness'

it('输出文件不参与扫描，watch 删除和重建 qxml 不残留旧类名', async () => {
  const project = await createCliFixture({
    'input.css': '@import "tailwindcss" source(none); @source "./pages";',
    'pages/page.qxml': '<view class="flex"></view>',
    'pages/out.css': '.grid { display: grid; }',
  })
  let child: ReturnType<typeof spawnCli> | undefined
  try {
    await runCli(project.root, ['-i', 'input.css', '-o', 'pages/out.css', '--silent'])
    expect(await project.read('pages/out.css')).not.toContain('.grid')
    child = spawnCli(project.root, ['-i', 'input.css', '-o', 'pages/out.css', '--watch', '--poll=50', '--silent'])
    await retryAssertion(async () => expect(await project.read('pages/out.css')).toContain('.flex'))
    await project.write('pages/page.qxml', '<view class="grid"></view>')
    await retryAssertion(async () => {
      const css = await project.read('pages/out.css')
      expect(css).toContain('.grid')
      expect(css).not.toContain('.flex')
    })
    await fs.rm(path.join(project.root, 'pages', 'page.qxml'))
    await retryAssertion(async () => expect(await project.read('pages/out.css')).not.toContain('.grid'))
    await project.write('pages/page.qxml', '<view class="underline"></view>')
    await retryAssertion(async () => {
      const css = await project.read('pages/out.css')
      expect(css).toContain('.underline')
      expect(css).not.toContain('.grid')
    })
  }
  finally {
    if (child && child.exitCode === null) {
      const exited = new Promise<void>(resolve => child!.once('exit', () => resolve()))
      child.kill('SIGTERM')
      await exited
    }
    await project.cleanup()
  }
})
