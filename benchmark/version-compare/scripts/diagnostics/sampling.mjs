import { Session } from 'node:inspector'
import { performance } from 'node:perf_hooks'
import { limits } from './constants.mjs'

export async function createAllocationSampler({ session = new Session(), samplingInterval = limits.samplingInterval } = {}) {
  session.connect()
  const post = (method, params = {}) => new Promise((resolve, reject) => {
    session.post(method, params, (error, result) => error ? reject(error) : resolve(result))
  })
  const parameters = { samplingInterval, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }
  let closed = false
  let count = 0
  try {
    await post('HeapProfiler.startSampling', parameters)
  }
  catch (error) {
    session.disconnect()
    throw error
  }
  return {
    parameters,
    async capture(stop = false) {
      if (closed || ++count > limits.maxSnapshots) {
        throw new Error('分配采样已关闭或超过阶段上限')
      }
      const startedAtEpochMs = Date.now()
      const started = performance.now()
      try {
        const { profile } = await post(stop ? 'HeapProfiler.stopSampling' : 'HeapProfiler.getSamplingProfile')
        return { profile, startedAtEpochMs, completedAtEpochMs: Date.now(), durationMs: performance.now() - started, parameters, sampledAllocatedBytesIncludingCollected: true }
      }
      finally {
        if (stop) {
          closed = true
          session.disconnect()
        }
      }
    },
    async close() {
      if (closed) {
        return
      }
      closed = true
      try {
        await post('HeapProfiler.stopSampling')
      }
      finally {
        session.disconnect()
      }
    },
  }
}
