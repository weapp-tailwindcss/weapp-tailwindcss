import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { createPnpmCommand } from '../scripts/pnpm-command.mjs'

const repo = fileURLToPath(new URL('../', import.meta.url))

it('Gulp 真实构建通过 ESM 插件图生成样式并完成后续任务', async () => {
  const cwd = path.join(repo, 'demo', 'gulp-tailwindcss-v4')
  const { command, args, shell } = createPnpmCommand(['build'])
  const { stdout } = await promisify(execFile)(command, args, {
    cwd,
    shell,
    env: { ...process.env, CI: '1', WATCH: '', PLATFORM: 'weapp' },
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  })

  expect(stdout).toContain('Finished \'default\'')
  expect(await readFile(path.join(cwd, 'dist', 'app.wxss'), 'utf8')).toContain('color:')
  expect(await readFile(path.join(cwd, 'dist', 'pages', 'index', 'index.js'), 'utf8')).toContain('Page(')
}, 125_000)
