import type { ProcessIdentity } from '../../scripts/demo-e2e-workflow/process-table'

/** 合成采集器启动回执；运行采样必须另外提供，不复用这份数据。 */
export function observerPreparation(identity: ProcessIdentity) {
  return {
    identities: [identity],
    memory: { rssMb: 10, maxProcessRssMb: 10, processCount: 1, topProcesses: [{ pid: identity.pid, ppid: identity.parent, rssMb: 10 }] },
  }
}
