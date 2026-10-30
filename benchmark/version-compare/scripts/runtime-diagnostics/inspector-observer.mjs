import { Buffer } from 'node:buffer'
import { Session } from 'node:inspector'
import { limits, sha256 } from './worker-evidence.mjs'

/** V8 scriptParsed 只证明脚本被解析；分配样本包含已回收对象，不是存活堆。 */
export async function createInspectorObserver({
  root,
  modules,
  onFailure,
}) {
  const session = new Session()
  session.connect()
  const post = (name, parameters = {}) => new Promise((resolve, reject) => {
    session.post(name, parameters, (error, result) => error ? reject(error) : resolve(result))
  })
  let sourceQueue = Promise.resolve()
  let firstFailure
  let sourceBytes = 0
  let sampling = false
  let closed = false
  let acceptingScripts = true
  const scriptIds = new Set()
  const sourceIds = new Set()
  const parameters = {
    samplingInterval: limits.samplingInterval,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  }
  function fail(error) {
    firstFailure ??= error
    onFailure(error)
  }
  const parsed = ({
    params,
  }) => {
    if (closed || !acceptingScripts || firstFailure) {
      return
    }
    try {
      if (scriptIds.has(params.scriptId)) {
        throw new Error('Inspector scriptId 重复，脚本身份不完整')
      }
      scriptIds.add(params.scriptId)
      if (scriptIds.size > limits.maxEvents) {
        throw new Error('Inspector 脚本数超过固定上限')
      }
      const scope = modules.describe(params.url)
      modules.recordParsed({
        sourceScope: scope,
        scriptId: params.scriptId,
        url: params.url,
        inspectorHash: params.hash,
        isModule: params.isModule,
        sourceMapURL: params.sourceMapURL,
        sourceMapStatus: '仅保留声明，未读取或应用映射',
        startLine: params.startLine,
        startColumn: params.startColumn,
        endLine: params.endLine,
        endColumn: params.endColumn,
        interpretation: 'V8 已解析脚本，不证明模块求值或函数执行',
      })
      if (!scope.target) {
        return
      }
      const file = scope.realpath
      if (sourceIds.size >= limits.maxSourceFiles) {
        throw new Error('Inspector 源码身份文件数超过固定上限')
      }
      sourceIds.add(params.scriptId)
      sourceQueue = sourceQueue.then(async () => {
        const {
          scriptSource,
        } = await post('Debugger.getScriptSource', {
          scriptId: params.scriptId,
        })
        const bytes = Buffer.byteLength(scriptSource)
        if (sourceBytes + bytes > limits.maxSourceBytes) {
          throw new Error('Inspector 源码身份字节超过固定上限')
        }
        sourceBytes += bytes
        modules.recordSource({
          scriptId: params.scriptId,
          url: params.url,
          realpath: file,
          sha256: sha256(Buffer.from(scriptSource)),
          utf8Bytes: bytes,
          interpretation: 'Debugger 返回的实际已解析源码，可能包含 CJS wrapper；无 source map 不比较生成函数身份',
        })
      }).catch(fail)
    }
    catch (error) {
      fail(error)
    }
  }
  session.on('Debugger.scriptParsed', parsed)
  try {
    await post('Debugger.enable', {
      maxScriptsCacheSize: limits.maxSourceBytes,
    })
    await post('HeapProfiler.startSampling', parameters)
    sampling = true
  }
  catch (error) {
    session.off('Debugger.scriptParsed', parsed)
    session.disconnect()
    throw error
  }
  return {
    parameters,
    summary: () => ({
      scriptCount: scriptIds.size,
      sourceCount: sourceIds.size,
      sourceBytes,
      firstFailure: firstFailure?.message,
    }),
    async capture(stop) {
      if (closed || !sampling) {
        throw new Error('Inspector 诊断已关闭')
      }
      await sourceQueue
      if (firstFailure) {
        throw firstFailure
      }
      const result = await post(stop ? 'HeapProfiler.stopSampling' : 'HeapProfiler.getSamplingProfile')
      if (stop) {
        sampling = false
      }
      return result.profile
    },
    async close() {
      if (closed) {
        return
      }
      const failures = []
      acceptingScripts = false
      try {
        if (sampling) {
          await post('HeapProfiler.stopSampling')
        }
      }
      catch (error) {
        failures.push(error)
      }
      try {
        await sourceQueue
        await post('Debugger.disable')
        if (firstFailure) {
          throw firstFailure
        }
      }
      catch (error) {
        failures.push(error)
      }
      finally {
        closed = true
        session.off('Debugger.scriptParsed', parsed)
        session.disconnect()
      }
      if (failures.length === 1) {
        throw failures[0]
      }
      if (failures.length > 1) {
        throw new AggregateError(failures, 'Inspector 停止采样与关闭失败', {
          cause: failures[0],
        })
      }
    },
  }
}
