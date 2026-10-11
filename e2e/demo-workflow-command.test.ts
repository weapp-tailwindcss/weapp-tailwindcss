import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
import { runStep } from '../scripts/demo-e2e-workflow/step'

it('原生命令保留空参数、引号和 shell 字符，不交给 Windows shell 重解释', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workflow args & '))
  try {
    const script = path.join(root, 'inspect.cjs')
    const result = path.join(root, 'args.json')
    await writeFile(script, 'require("node:fs").writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)))')
    const args = ['', '空 格', 'quote"and$literal', '&', '%PATH%', 'a\\b']
    const report = await runStep({ name: 'native arguments', command: process.execPath, args: [script, result, ...args] }, 1, 1)
    expect(report.exitCode).toBe(0)
    expect(JSON.parse(await readFile(result, 'utf8'))).toEqual(args)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('pnpm 阶段复用活动 JavaScript CLI，并原样传递参数', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workflow pnpm & '))
  try {
    const directory = path.join(root, 'active CLI')
    await mkdir(directory)
    const cli = path.join(directory, 'pnpm.cjs')
    const result = path.join(root, 'pnpm.json')
    await writeFile(cli, 'require("node:fs").writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)))')
    const args = ['', '空 格', '"quoted" & %PATH%']
    const report = await runStep({ name: 'pnpm arguments', command: 'pnpm', args: [result, ...args] }, 1, 1, {}, { ...process.env, npm_execpath: cli })
    expect(report.exitCode).toBe(0)
    expect(JSON.parse(await readFile(result, 'utf8'))).toEqual(args)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
