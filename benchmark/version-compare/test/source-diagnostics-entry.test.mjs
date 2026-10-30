import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'

const temporary = []
afterEach(async () => {
  for (const directory of temporary.splice(0)) {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it('未安装依赖也能初始化工件，错误请求非零退出并保留失败阶段', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'source-entry-fixture-'))
  temporary.push(cwd)
  const script = fileURLToPath(new URL('../scripts/source-diagnostics/run.mjs', import.meta.url))
  const invoke = args => spawnSync(process.execPath, [script, ...args], { cwd, env: { ...process.env, SOURCE_DIAGNOSTIC_KIND: 'invalid-fixture' }, encoding: 'utf8', timeout: 10000 })
  expect(invoke(['--initialize']).status).toBe(0)
  const directory = path.join(cwd, '.tmp', 'source-diagnostics')
  expect(JSON.parse(await fs.readFile(path.join(directory, 'initialization.json'), 'utf8'))).toMatchObject({ status: 'initialized-not-complete', diagnosticOnly: true, budgetAcceptance: false })
  expect(invoke([]).status).toBe(1)
  expect(JSON.parse(await fs.readFile(path.join(directory, 'diagnostic-summary.json'), 'utf8'))).toMatchObject({ status: 'incomplete', firstFailure: { stage: 'request' }, diagnosticOnly: true, budgetAcceptance: false })
})
