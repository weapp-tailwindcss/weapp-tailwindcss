import type stream from 'node:stream'
import type File from 'vinyl'
import { AsyncLocalStorage } from 'node:async_hooks'
import { materializeErrorStack } from '../shared/materialize-error-stack'

export type RunVinylActivity = (operation: () => Promise<void>, forwarded: boolean) => Promise<void>
export interface VinylActivity {
  file: File
  scope: ReturnType<typeof AsyncLocalStorage.snapshot> | undefined
  started: boolean
  handlerDone: boolean
  outputDone: boolean
  writeDone: boolean
  error: Error | null | undefined
  settle: () => void
}
interface OutputScope { source: stream.Transform | undefined, file: File | undefined }
const outputs = new AsyncLocalStorage<OutputScope>()

/** 在 write 入队时接收任务；只有受管 pipe 的同一文件转发可以继承原租约。 */
export function createVinylActivityBinding(run: RunVinylActivity) {
  const upstreams = new Set<stream.Readable>()
  const downstreams = new Set<NodeJS.WritableStream>()
  const pending = new Set<VinylActivity>()
  const pendingOutputs = new Map<File, VinylActivity[]>()
  let target: stream.Transform
  let pendingRefusal: Promise<void> | undefined

  function releaseOutputs() {
    pendingOutputs.clear()
    for (const activity of pending) {
      activity.outputDone = true
      activity.settle()
    }
  }

  function bind(transform: stream.Transform) {
    target = transform
    const write = transform.write.bind(transform)
    const end = transform.end.bind(transform)
    const emit = transform.emit.bind(transform)
    const pipe = transform.pipe.bind(transform)
    const unpipe = transform.unpipe.bind(transform)
    transform.on('pipe', source => upstreams.add(source))
    transform.on('unpipe', source => upstreams.delete(source))
    transform.once('close', () => {
      upstreams.clear()
      downstreams.clear()
      releaseOutputs()
    })
    transform.pipe = (destination, options) => {
      downstreams.add(destination)
      return pipe(destination, options)
    }
    transform.unpipe = (destination) => {
      if (destination) {
        downstreams.delete(destination)
      }
      else {
        downstreams.clear()
      }
      const result = unpipe(destination)
      if (downstreams.size === 0) {
        releaseOutputs()
      }
      return result
    }
    transform.emit = (event: string | symbol, ...args: unknown[]) => {
      const file = args[0] as File
      const queue = event === 'data' ? pendingOutputs.get(file) : undefined
      const activity = queue?.shift()
      if (!activity) {
        return emit(event, ...args)
      }
      if (queue?.length === 0) {
        pendingOutputs.delete(file)
      }
      const scope: OutputScope = { source: transform, file }
      try {
        return activity.scope!(() => outputs.run(scope, () => emit(event, ...args)))
      }
      finally {
        scope.source = undefined
        scope.file = undefined
        activity.outputDone = true
        activity.settle()
      }
    }
    transform.write = (file: File, encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void) => {
      if (file === null) {
        return write(file)
      }
      const userCallback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback
      const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined
      const output = outputs.getStore()
      const forwarded = output?.file === file && output.source !== undefined && upstreams.has(output.source)
      let accepted = false
      let synchronousFailure: { error: unknown } | undefined
      let writable = false
      const invoke = () => new Promise<void>((resolve, reject) => {
        const activity: VinylActivity = {
          file,
          scope: AsyncLocalStorage.snapshot(),
          started: false,
          handlerDone: false,
          outputDone: false,
          writeDone: false,
          error: undefined,
          settle() {
            if (activity.writeDone && (!activity.started || (activity.handlerDone && activity.outputDone))) {
              pending.delete(activity)
              activity.scope = undefined
              if (activity.error) {
                reject(activity.error)
              }
              else {
                resolve()
              }
            }
          },
        }
        pending.add(activity)
        const complete = (error?: Error | null) => {
          activity.error ??= error
          activity.writeDone = true
          activity.settle()
          userCallback?.(error)
        }
        accepted = true
        try {
          writable = encoding === undefined ? write(activity, complete) : write(activity, encoding, complete)
        }
        catch (error) {
          synchronousFailure = { error }
          pending.delete(activity)
          activity.scope = undefined
          reject(error)
        }
      })
      let completion: Promise<void>
      try {
        completion = run(invoke, forwarded)
      }
      catch (error) {
        completion = Promise.reject(error)
      }
      const reported = completion.catch((error: Error) => {
        // 已接收写入的错误仍由 Node stream 的原 callback/error 通道报告。
        if (!accepted) {
          materializeErrorStack(error)
          userCallback?.(error)
          transform.destroy(error)
        }
      })
      if (!accepted) {
        pendingRefusal = reported
      }
      if (synchronousFailure) {
        throw synchronousFailure.error
      }
      return writable
    }
    transform.end = ((chunkOrCallback?: File | (() => void), encodingOrCallback?: BufferEncoding | (() => void), callback?: () => void) => {
      const completion = typeof chunkOrCallback === 'function' ? chunkOrCallback : typeof encodingOrCallback === 'function' ? encodingOrCallback : callback
      if (chunkOrCallback != null && typeof chunkOrCallback !== 'function') {
        if (typeof encodingOrCallback === 'string') {
          transform.write(chunkOrCallback, encodingOrCallback)
        }
        else {
          transform.write(chunkOrCallback)
        }
      }
      if (pendingRefusal) {
        // 等拒绝经 stream 错误通道送达，防止 end 回调先误报成功。
        void pendingRefusal.then(() => completion ? end(completion) : end())
        return transform
      }
      return completion ? end(completion) : end()
    }) as typeof transform.end
  }

  function publish(activity: VinylActivity, callback: () => void) {
    if (downstreams.size > 0 && !target.destroyed) {
      const queue = pendingOutputs.get(activity.file) ?? []
      queue.push(activity)
      pendingOutputs.set(activity.file, queue)
    }
    else {
      activity.outputDone = true
    }
    callback()
  }

  return { bind, publish }
}
