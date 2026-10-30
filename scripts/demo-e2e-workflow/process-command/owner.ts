import type { ChildProcess } from 'node:child_process'

export interface ProcessCommandReceipt {
  command: string
  args: string[]
  pid?: number
  startedAt: number
  executionDeadlineAt: number
  callbackAt?: number
  exitAt?: number
  exitCode?: number | null
  exitSignal?: NodeJS.Signals | null
  closedAt?: number
  closeCode?: number | null
  closeSignal?: NodeJS.Signals | null
  terminationRequestedAt?: number
  terminationResult?: boolean
  terminationError?: string
  reapDeadlineAt?: number
  reapTimedOutAt?: number
  settledAt?: number
  initialFailure?: string
  failure?: string
}

interface OwnedProcessCommand {
  child: ChildProcess | undefined
  receipt: ProcessCommandReceipt
  settled: Promise<void>
}

type ProcessCommandSnapshot = ProcessCommandReceipt & { handleRetained: boolean }

export interface ProcessCommandOwner {
  assertHealthy: () => void
  diagnostics: () => {
    closed: boolean
    cleanupVerified: boolean
    failure?: string
    probes: ProcessCommandSnapshot[]
  }
  close: () => Promise<void>
}

interface OwnerState {
  resources: OwnedProcessCommand[]
  terminal?: unknown
  closed: boolean
}

const owners = new WeakMap<ProcessCommandOwner, OwnerState>()

export function assertProcessCommandOwner(owner: ProcessCommandOwner) {
  if (!owners.has(owner)) {
    throw new Error('进程探针必须使用本模块创建的归属域。')
  }
  owner.assertHealthy()
}

function snapshotProcessCommand(resource: OwnedProcessCommand): ProcessCommandSnapshot {
  return { ...resource.receipt, args: [...resource.receipt.args], handleRetained: resource.child !== undefined }
}

export class ProcessCommandCleanupError extends Error {
  constructor(message: string, private readonly resource: OwnedProcessCommand, cause?: unknown) {
    super(message, { cause })
    this.name = 'ProcessCommandCleanupError'
  }

  get receipt() {
    return snapshotProcessCommand(this.resource)
  }

  toJSON() {
    return { name: this.name, message: this.message, cause: String(this.cause), receipt: this.receipt }
  }
}

/** 一个任务独占探针句柄；关闭域只排空已有预算，不重启探针或续借回收时间。 */
export function createProcessCommandOwner(): ProcessCommandOwner {
  const state: OwnerState = { resources: [], closed: false }
  let closing: Promise<void> | undefined
  const owner: ProcessCommandOwner = {
    assertHealthy() {
      if (state.terminal !== undefined) {
        throw state.terminal
      }
      if (state.closed) {
        throw new Error('进程探针归属域已关闭，禁止继续调度。')
      }
    },
    diagnostics() {
      return {
        closed: state.closed,
        cleanupVerified: state.resources.every(resource => resource.receipt.closedAt !== undefined),
        ...(state.terminal === undefined ? {} : { failure: String(state.terminal) }),
        probes: state.resources.map(snapshotProcessCommand),
      }
    },
    close() {
      if (!closing) {
        state.closed = true
        closing = Promise.all(state.resources.map(resource => resource.settled)).then(() => {
          if (state.terminal !== undefined) {
            throw state.terminal
          }
        })
      }
      return closing
    },
  }
  owners.set(owner, state)
  return owner
}

/** 回收确认前由原域持有句柄；确认后释放引用，但不清除该轮首错或重新放行。 */
export function retainProcessCommand(owner: ProcessCommandOwner, resource: OwnedProcessCommand) {
  const state = owners.get(owner)
  if (!state) {
    throw new Error('进程探针必须使用本模块创建的归属域。')
  }
  state.resources.push(resource)
  return {
    markTerminal(error: unknown) {
      state.terminal ??= error
    },
    releaseHandle() {
      if (resource.receipt.closedAt === undefined || resource.receipt.callbackAt === undefined) {
        throw new Error('进程探针尚未确认 close 与 callback，不能释放句柄归属。')
      }
      resource.child = undefined
    },
  }
}
