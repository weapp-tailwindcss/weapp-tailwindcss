import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { measure } from './measure.mjs'
import { prepare } from './prepare.mjs'
import { assertProcessesStopped, failureEvidence, processOwnership } from './owned-process.mjs'

export const runOrder = [['current', 1], ['previous', 1], ['previous', 2], ['current', 2], ['current', 3], ['previous', 3]]

export async function main() {
  assert.equal(process.platform, 'linux', '真实诊断固定 Linux；本机只运行纯 fixture')
  assert.equal(process.version, 'v22.23.4', '固定与首败相同 Node')
  assert.ok(!process.env.NODE_OPTIONS, '不接受未登记 NODE_OPTIONS')
  assert.ok(!process.execArgv.some(value => /gc|inspect|prof/i.test(value)), '不接受主动 GC 或 profiler')
  const index = process.argv.indexOf('--out-dir')
  const outDir = path.resolve(index < 0 ? '.tmp/taro-source-ab' : process.argv[index + 1])
  await fs.mkdir(outDir, { recursive: true })
  assert.deepEqual(await fs.readdir(outDir), [], '输出必须为空')
  const runs = []
  let preparation, primary
  try {
    preparation = await prepare(outDir)
    for (const [role, run] of runOrder) {
      process.stdout.write(`[source-ab] ${role}/${run}: ${preparation.refs[role]} 完整冷构建\n`)
      runs.push(await measure(preparation.roots[role], role, run, outDir, {
        nativeHelpers: preparation.nativeHelpers[role].helpers,
        unrefServices: preparation.nativeHelpers[role].packages,
        identity: preparation.identities[role], sourceIdentity: preparation.archives[role],
      }))
    }
    await fs.writeFile(path.join(outDir, 'report.json'), `${JSON.stringify({ diagnosticOnly: true, budgetAcceptance: false, runOrder, preparation, runs }, null, 2)}\n`)
  }
  catch (error) {
    primary = error
    await fs.writeFile(path.join(outDir, 'failure.json'), `${JSON.stringify({ diagnosticOnly: true, completedRuns: runs, error: failureEvidence(error), processes: processOwnership() }, null, 2)}\n`)
    throw error
  }
  finally {
    if (preparation) {
      try { assertProcessesStopped(); await fs.rm(preparation.temporary, { recursive: true, force: true }) }
      catch (error) {
        await fs.writeFile(path.join(outDir, 'cleanup-error.json'), `${JSON.stringify({ temporary: preparation.temporary, error: failureEvidence(error) }, null, 2)}\n`)
        if (!primary) throw error
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error); process.exitCode = 1 })
