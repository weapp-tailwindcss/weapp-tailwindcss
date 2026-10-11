import type { ObserverLaunchDiagnostic } from './launch-environment'
import type { ProcessObserverQuery } from './transport'

const stages = ['request-received', 'query-completed', 'response-ready'] as const

export interface ObserverRequestDiagnostic {
  id: number
  kind: ProcessObserverQuery['kind']
  sentAt: number
  stages: Array<{ stage: string, elapsedMs: number }>
  progress: number
}

/** 诊断只记录本次传输阶段，不授予业务进程归属，也不重置请求截止。 */
export function createObserverDiagnostics(pid: number | undefined, launch?: ObserverLaunchDiagnostic) {
  const startedAt = Date.now()
  let readyAt: number | undefined
  let runtimeVersion: string | undefined
  const requests: ObserverRequestDiagnostic[] = []
  const elapsed = () => Math.max(0, Date.now() - startedAt)
  return {
    begin(id: number, query: ProcessObserverQuery) {
      const request: ObserverRequestDiagnostic = { id, kind: query.kind, sentAt: elapsed(), stages: [], progress: 0 }
      requests.push(request)
      if (requests.length > 4) {
        requests.shift()
      }
      return request
    },
    written(request: ObserverRequestDiagnostic) {
      request.stages.push({ stage: 'stdin-written', elapsedMs: elapsed() })
    },
    progress(message: { event: unknown, pid?: unknown, kind?: unknown, version?: unknown }, request?: ObserverRequestDiagnostic) {
      if (message.event === 'observer-ready') {
        if (readyAt !== undefined || message.pid !== pid || !Number.isInteger(message.pid)) {
          throw new Error('身份采集器准备进度缺少本体 PID 或重复，不能接受诊断行。')
        }
        if (message.version !== undefined && (typeof message.version !== 'string' || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(message.version))) {
          throw new Error('身份采集器运行时版本格式无效，不能接受诊断行。')
        }
        runtimeVersion = message.version as string | undefined
        readyAt = elapsed()
        return
      }
      if (readyAt === undefined || !request || message.kind !== request.kind || message.event !== stages[request.progress]) {
        throw new Error('身份采集器请求进度缺少本轮身份或阶段顺序无效。')
      }
      request.progress++
      request.stages.push({ stage: message.event as string, elapsedMs: elapsed() })
    },
    response(request: ObserverRequestDiagnostic) {
      request.stages.push({ stage: 'response-received', elapsedMs: elapsed() })
    },
    snapshot() {
      return {
        pid,
        elapsedMs: elapsed(),
        readyAtMs: readyAt ?? null,
        runtimeVersion: runtimeVersion ?? null,
        launch: launch ? { ...launch } : undefined,
        requests: requests.map(request => ({ id: request.id, kind: request.kind, sentAtMs: request.sentAt, stages: request.stages.map(stage => ({ ...stage })) })),
      }
    },
  }
}

export type ObserverDiagnostics = ReturnType<ReturnType<typeof createObserverDiagnostics>['snapshot']>
