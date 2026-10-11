import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('package entry', () => {
  it('exports the CLI runner without executing a command on import', async () => {
    const entry = path.join(packageRoot, 'dist/index.js')
    const script = `
      const before = process.title
      const module = await import(${JSON.stringify(entry)})
      process.stdout.write(JSON.stringify({ before, after: process.title, type: typeof module.runCli }))
    `
    const child = spawn(process.execPath, ['--input-type=module', '--eval', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', chunk => stdout.push(chunk))
    child.stderr.on('data', chunk => stderr.push(chunk))

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', code => resolve(code ?? 1))
    })

    expect(Buffer.concat(stderr).toString()).toBe('')
    expect(exitCode).toBe(0)
    expect(JSON.parse(Buffer.concat(stdout).toString())).toMatchObject({
      type: 'function',
    })
    const result = JSON.parse(Buffer.concat(stdout).toString()) as { before: string, after: string }
    expect(result.after).toBe(result.before)
  })
})
