import { Buffer } from 'node:buffer'
import { writeFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createGcDiagnostics } from '../gc-diagnostics.mjs'
import { appendNodeImport } from '../gc-paths.mjs'
import { diagnosticMutationMarker, limits, mpxProject, mutationMarkerRule } from './constants.mjs'
import { rootRelativeKey, sha256 } from './evidence.mjs'
import { verifyOperationEvidence } from './operation-evidence.mjs'

const modules = ['constants.mjs', 'evidence.mjs', 'frames.mjs', 'sampling.mjs', 'capture.mjs', 'preload.mjs', 'operations.mjs']
const diagnosticEnvironment = /^(?:UNI_|TARO_|MPX_|TAILWIND|WEAPP_TW_|NODE_ENV$|NODE_OPTIONS$|CI$|HUSKY$)/

export async function createCaseDiagnostics(options) {
  if (!options.allocation) {
    return createGcDiagnostics(options)
  }
  const gc = await createGcDiagnostics(options)
  if (!gc?.env.WEAPP_TW_BENCH_GC_SESSION) {
    throw new Error('分配诊断无法取得实际 worker 身份')
  }
  const identity = { ...JSON.parse(gc.env.WEAPP_TW_BENCH_GC_SESSION), platform: process.platform, mode: options.allocation === 'inputs' ? 'inputs' : 'allocation' }
  if (identity.project === mpxProject) {
    const serviceFile = path.join(identity.root, 'packages/weapp-tailwindcss/src/core/compiler/generator-service-pool.ts')
    const available = await fs.access(serviceFile).then(() => true, (error) => {
      if (error.code !== 'ENOENT') {
        throw error
      }
      return false
    })
    identity.capabilities = { compilerServicePool: { available, interpretation: available ? '仅统计真实执行的操作' : '此版本没有服务池，不以零次调用参与比较' } }
  }
  const directory = identity.sessionDirectory
  const moduleHashes = {}
  for (const name of modules) {
    const source = await fs.readFile(new URL(name, import.meta.url))
    await fs.writeFile(path.join(directory, name), source)
    moduleHashes[name] = sha256(source)
  }
  const env = {
    ...gc.env,
    NODE_OPTIONS: appendNodeImport(gc.env.NODE_OPTIONS, path.join(directory, 'preload.mjs')),
    WEAPP_TW_BENCH_ALLOCATION_SESSION: JSON.stringify({ ...identity, moduleHashes }),
  }
  const events = []
  const sources = []
  const environment = Object.fromEntries(Object.entries({ ...process.env, ...options.env, ...env }).filter(([key]) => diagnosticEnvironment.test(key)))
  let status
  let closing
  let sequence = 0
  function mark(type, round) {
    if (events.length >= 256) {
      throw new Error('诊断阶段数量超过上限')
    }
    gc.mark(type, round)
    const phase = { type, round, atEpochMs: Date.now(), sequence: ++sequence }
    events.push(phase)
    writeFileSync(path.join(directory, 'stage.json'), JSON.stringify(phase))
  }
  mark(options.kind === 'build' ? 'build-start' : 'watch-start')
  const controller = {
    env,
    mutationMarker: diagnosticMutationMarker,
    spawned(pid) {
      gc.spawned(pid)
    },
    mark,
    async source(type, sourcePath, expected, marker) {
      if (sources.length >= 64) {
        throw new Error('诊断来源写入次数超过上限')
      }
      const actual = await fs.readFile(sourcePath)
      const actualHash = sha256(actual)
      const expectedHash = expected === undefined ? undefined : sha256(Buffer.from(expected))
      const text = actual.toString('utf8')
      sources.push({
        type,
        sourceKey: sourcePath,
        comparableKey: rootRelativeKey(sourcePath, identity.root),
        sha256: actualHash,
        expectedSha256: expectedHash,
        utf8Bytes: actual.length,
        marker,
        markerNormalizedSha256: sha256(marker ? text.replaceAll(marker, '<benchmark-marker>') : text),
        atEpochMs: Date.now(),
      })
      if (expectedHash !== undefined && expectedHash !== actualHash) {
        throw new Error(`实际来源写入与预期不符：${type}`)
      }
    },
    beforeStop() {
      closing ??= (async () => {
        mark('watch-stop')
        const command = { type: 'stop', sequence }
        await fs.writeFile(path.join(directory, 'command.json'), JSON.stringify(command))
        const deadline = Date.now() + limits.commandTimeoutMs
        while (Date.now() < deadline) {
          try {
            const reply = JSON.parse(await fs.readFile(path.join(directory, 'reply.json'), 'utf8'))
            if (reply.sequence === command.sequence) {
              if (!reply.complete || reply.error) {
                throw new Error(`分配采样关闭失败：${reply.error}`)
              }
              return
            }
          }
          catch (error) {
            if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
              throw error
            }
          }
          await new Promise(resolve => setTimeout(resolve, 20))
        }
        throw new Error('分配采样关闭超时；不将缺失的最后阶段当作成功')
      })()
      return closing
    },
    async finish() {
      await gc.finish()
      let error
      let operationEvidence
      try {
        status = JSON.parse(await fs.readFile(path.join(directory, 'status.json'), 'utf8'))
        const startup = JSON.parse(await fs.readFile(path.join(directory, 'process-start.json'), 'utf8'))
        const expectedCount = options.kind === 'build' ? 1 : 8
        if (Object.entries(moduleHashes).some(([name, hash]) => startup.moduleHashes?.[name] !== hash)
          || startup.preloadSha256 !== moduleHashes['preload.mjs'] || !status.complete || status.recordingError || (status.snapshotCount ?? status.compilationCount) !== expectedCount) {
          throw new Error(`分配诊断证据不完整：${JSON.stringify(status)}`)
        }
        if (identity.project === mpxProject) {
          operationEvidence = await verifyOperationEvidence(directory, status, identity)
        }
        const expectedPhases = options.kind === 'build'
          ? [['build-start', undefined]]
          : [['watch-start', undefined], ...[1, 2, 3].flatMap(round => [['mutation-write', round], ['rollback-write', round]]), ['watch-stop', undefined]]
        for (const [index, [type, round]] of expectedPhases.entries()) {
          const inputs = JSON.parse(await fs.readFile(path.join(directory, `inputs-${index + 1}.json`), 'utf8'))
          if (inputs.phase.type !== type || inputs.phase.round !== round || inputs.sources.length === 0) {
            throw new Error(`诊断阶段未对齐：${index + 1}`)
          }
          if (identity.mode === 'allocation') {
            const profile = await fs.readFile(path.join(directory, inputs.profileFile))
            if (sha256(profile) !== inputs.profileReceipt.sha256) {
              throw new Error(`分配 profile 哈希不匹配：${index + 1}`)
            }
            const frames = await fs.readFile(path.join(directory, inputs.framesFile))
            const receipt = status.frameReceipts?.[index]
            const mapping = JSON.parse(frames)
            if (receipt?.file !== inputs.framesFile || receipt.receipt.sha256 !== sha256(frames)
              || mapping.profileFile !== inputs.profileFile || mapping.profileReceipt.sha256 !== inputs.profileReceipt.sha256) {
              throw new Error(`分配栈映射缺失或哈希不匹配：${index + 1}`)
            }
          }
        }
      }
      catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause)
      }
      await fs.writeFile(path.join(directory, 'allocation-controller.json'), JSON.stringify({
        identity,
        moduleHashes,
        command: ['pnpm', 'run', options.kind === 'build' ? options.projectMeta.buildScript : options.projectMeta.devScript],
        environment,
        environmentScope: '构建相关白名单，不宣称进程完整环境相等',
        sources,
        events,
        status,
        operationEvidence,
        error,
        diagnosticOnly: true,
        mutationMarkerRule,
      }, null, 2))
      if (error) {
        throw new Error(error)
      }
    },
  }
  await controller.source('initial', path.resolve(options.cwd, options.projectMeta.sourceFile))
  return controller
}
