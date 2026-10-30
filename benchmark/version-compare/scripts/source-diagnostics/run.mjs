import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const artifactRoot = path.resolve('.tmp', 'source-diagnostics')

/** 在安装前留下本轮入口；安装或准备失败时 always 上传仍能说明未执行范围。 */
export async function initializeEvidence(directory = artifactRoot, env = process.env) {
  await fs.mkdir(directory, {
    recursive: true,
  })
  const initial = {
    schemaVersion: 1,
    diagnosticOnly: true,
    budgetAcceptance: false,
    status: 'initialized-not-complete',
    initializedAt: new Date().toISOString(),
    kind: env.SOURCE_DIAGNOSTIC_KIND,
    driverCommit: env.SOURCE_DIAGNOSTIC_DRIVER,
    products: {
      base: env.SOURCE_DIAGNOSTIC_BASE,
      current: env.SOURCE_DIAGNOSTIC_CURRENT,
    },
  }
  await fs.writeFile(path.join(directory, 'initialization.json'), `${JSON.stringify(initial, null, 2)}\n`, {
    flag: 'wx',
  })
  return initial
}
function request(env) {
  const kind = env.SOURCE_DIAGNOSTIC_KIND
  if (!['watch', 'taro', 'runtime'].includes(kind)) {
    throw new Error('必须明确选择 watch/taro/runtime 源码诊断')
  }
  for (const key of ['DRIVER', 'BASE', 'CURRENT']) {
    if (!/^[a-f\d]{40}$/.test(env[`SOURCE_DIAGNOSTIC_${key}`] ?? '')) {
      throw new Error(`${key} 必须为完整 commit SHA`)
    }
  }
  if (process.version !== 'v22.23.4') {
    throw new Error('远端源码诊断必须固定 Node 22.23.4')
  }
  return {
    kind,
    driverCommit: env.SOURCE_DIAGNOSTIC_DRIVER,
    products: [{
      role: 'base',
      sourceCommit: env.SOURCE_DIAGNOSTIC_BASE,
    }, {
      role: 'current',
      sourceCommit: env.SOURCE_DIAGNOSTIC_CURRENT,
    }],
  }
}
async function collectTaro(preparation, evidence) {
  const {
    runTaroCpuDiagnostics,
  } = await import('../taro-cpu-diagnostics/run-taro-cpu.mjs')
  const roles = preparation.roles.map((role) => {
    const runner = role.inputs.files.find(file => file.logical === 'scripts/taro-build-runner.mjs')
    if (!runner) {
      throw new Error('准备凭证缺少实际 Taro runner')
    }
    return {
      role: role.role,
      root: role.root,
      sourceCommit: role.sourceCommit,
      lockSha256: role.lockSha256,
      runnerSha256: runner.sha256,
    }
  })
  const result = await runTaroCpuDiagnostics({
    roles,
    outputDirectory: path.join(evidence, 'taro'),
    preloadFile: fileURLToPath(new URL('../taro-cpu-diagnostics/taro-cpu-loaded-preload.cjs', import.meta.url)),
  })
  if (result.status !== 'complete') {
    throw new Error(`Taro CPU 诊断未完成：${result.firstFailure?.message}`)
  }
  return {
    status: result.status,
    receipt: result.receipt,
  }
}
async function collectRuntime(preparation, evidence) {
  const {
    createRuntimeVersions,
  } = await import('./runtime-versions.mjs')
  const {
    acceptRuntimeEvidence,
  } = await import('./join-runtime.mjs')
  const {
    executeCommand,
  } = await import('./command.mjs')
  const {
    readBounded,
    writeJson,
  } = await import('./files.mjs')
  const versions = await createRuntimeVersions(preparation)
  const versionsFile = path.join(evidence, 'expected-versions.json')
  await writeJson(versionsFile, versions)
  const rawFile = path.join(evidence, 'matrix-raw.json')
  const runtimeDirectory = path.join(evidence, 'runtime')
  const command = await executeCommand({
    executable: process.execPath,
    args: [fileURLToPath(new URL('../run-matrix.mjs', import.meta.url)), '--versions-file', versionsFile, '--only', 'demo-weapp-vite-tailwindcss-v4__mp-weixin', '--build-runs', '3', '--hmr-runs', '3', '--weapp-runtime-diagnostics', '--runtime-diagnostic-dir', runtimeDirectory, '--out', rawFile],
    cwd: preparation.sourceRepository,
    stdoutFile: path.join(evidence, 'matrix.stdout.log'),
    stderrFile: path.join(evidence, 'matrix.stderr.log'),
    capture: false,
  })
  await writeJson(path.join(evidence, 'matrix-command.json'), command)
  if (command.firstFailure || command.exitCode !== 0 || !command.closeConfirmed || command.cleanupErrors.length) {
    throw new Error(`运行时诊断进程未完成：${command.firstFailure?.message ?? command.exitCode}`)
  }
  const report = JSON.parse((await readBounded(rawFile)).toString('utf8'))
  const result = await acceptRuntimeEvidence({
    report,
    expectedVersions: versions,
    runtimeDirectory,
  })
  await writeJson(path.join(evidence, 'runtime-acceptance.json'), result)
  return result
}
async function collectWatch(preparation, evidence) {
  const {
    executeCommand,
  } = await import('./command.mjs')
  const {
    writeJson,
  } = await import('./files.mjs')
  const results = []
  for (const role of preparation.roles) {
    const output = path.join(evidence, `watch-${role.role}`)
    const roleFile = path.join(evidence, `watch-${role.role}-prepared.json`)
    await writeJson(roleFile, role)
    const command = await executeCommand({
      executable: process.execPath,
      args: [fileURLToPath(new URL('../watch-consumer/index.mjs', import.meta.url)), role.root, role.sourceCommit, roleFile, output],
      cwd: preparation.sourceRepository,
      stdoutFile: path.join(evidence, `watch-${role.role}.stdout.log`),
      stderrFile: path.join(evidence, `watch-${role.role}.stderr.log`),
      timeoutMs: 60000,
      capture: false,
    })
    await writeJson(path.join(evidence, `watch-${role.role}-command.json`), command)
    results.push({
      role: role.role,
      command,
    })
  }
  if (results.some(({
    command,
  }) => command.firstFailure || command.exitCode !== 0 || !command.closeConfirmed || command.cleanupErrors.length)) {
    throw new Error('至少一侧原始 watch 契约失败；两侧消费图与原始错误均已保留')
  }
  return {
    status: 'complete',
    roles: results.map(result => result.role),
  }
}

/** driver 与产品来源分开绑定；所有失败保留原件，不能进入正式预算验收。 */
export async function runSourceDiagnostics(env = process.env) {
  const {
    prepareSourceDiagnostics,
    verifyPreparedRole,
  } = await import('./prepare.mjs')
  const {
    errorRecord,
    writeJson,
  } = await import('./files.mjs')
  const summary = {
    schemaVersion: 1,
    diagnosticOnly: true,
    budgetAcceptance: false,
    status: 'incomplete',
    startedAt: new Date().toISOString(),
    afterVerification: [],
  }
  let preparation
  let stage = 'request'
  try {
    const options = request(env)
    summary.request = options
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-source-diagnostic-'))
    summary.ownedPreparationParent = parent
    stage = 'prepare'
    preparation = await prepareSourceDiagnostics({
      ...options,
      sourceRepository: process.cwd(),
      outputDirectory: path.join(parent, 'prepared'),
      evidenceDirectory: path.join(artifactRoot, 'preparation'),
      pnpmEntry: env.npm_execpath,
    })
    summary.preparationReceipt = preparation.receipt
    if (preparation.status !== 'complete') {
      throw new Error(`两侧准备未完成：${preparation.firstFailure?.message}`)
    }
    stage = 'before-verification'
    for (const role of preparation.roles) {
      await verifyPreparedRole(role, {
        phase: 'before',
      })
    }
    stage = `${options.kind}-workload`
    summary.result = await {
      watch: collectWatch,
      taro: collectTaro,
      runtime: collectRuntime,
    }[options.kind](preparation, artifactRoot)
    summary.status = 'complete'
  }
  catch (error) {
    summary.firstFailure = errorRecord(stage, error)
  }
  finally {
    for (const role of preparation?.roles ?? []) {
      if (role.status !== 'complete') {
        continue
      }
      try {
        await verifyPreparedRole(role, {
          phase: 'after',
        })
        summary.afterVerification.push({
          role: role.role,
          complete: true,
          trackedSourcesRestored: true,
        })
      }
      catch (error) {
        summary.status = 'incomplete'
        const failure = errorRecord('after-verification', error)
        summary.firstFailure ??= failure
        summary.afterVerification.push({
          role: role.role,
          complete: false,
          failure,
        })
      }
    }
    summary.finishedAt = new Date().toISOString()
    await writeJson(path.join(artifactRoot, 'diagnostic-summary.json'), summary)
  }
  if (summary.status !== 'complete') {
    process.exitCode = 1
  }
  return summary
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const action = process.argv.slice(2)
  const operation = action.length === 1 && action[0] === '--initialize' ? initializeEvidence() : action.length === 0 ? runSourceDiagnostics() : Promise.reject(new Error('仅支持 --initialize 或无参数入口'))
  operation.catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
