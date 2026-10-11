import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = path.resolve(packageRoot, '../..')
const cliEntry = path.join(packageRoot, 'dist/bin.cjs')

export interface CliResult {
  stdout: string
  stderr: string
}

export async function createCliFixture(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-tw-cli-test-'))
  await fs.symlink(
    path.join(repositoryRoot, 'node_modules'),
    path.join(root, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, file)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content)
  }
  return {
    root,
    read: (file: string) => fs.readFile(path.join(root, file), 'utf8'),
    write: async (file: string, content: string) => {
      const target = path.join(root, file)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, content)
    },
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  }
}

export async function runCli(cwd: string, args: string[], stdin?: string): Promise<CliResult> {
  const child = spawn(process.execPath, [cliEntry, ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on('data', chunk => stdout.push(chunk))
  child.stderr.on('data', chunk => stderr.push(chunk))
  if (stdin !== undefined) child.stdin.end(stdin)
  else child.stdin.end()

  const code = await new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', exitCode => resolve(exitCode ?? 1))
  })
  const result = {
    stdout: Buffer.concat(stdout).toString(),
    stderr: Buffer.concat(stderr).toString(),
  }
  if (code !== 0) {
    throw Object.assign(new Error(`CLI exited with code ${code}`), result, { code })
  }
  return result
}

export async function runCliFailure(cwd: string, args: string[], stdin?: string) {
  try {
    await runCli(cwd, args, stdin)
    throw new Error('Expected CLI command to fail.')
  }
  catch (error) {
    return error as Error & { stdout?: string, stderr?: string, code?: number }
  }
}

export function spawnCli(cwd: string, args: string[]) {
  return spawn(process.execPath, [cliEntry, ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

export async function retryAssertion(assertion: () => Promise<void>, timeout = 10_000) {
  const start = Date.now()
  let lastError: unknown
  while (Date.now() - start < timeout) {
    try {
      await assertion()
      return
    }
    catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  throw lastError
}
