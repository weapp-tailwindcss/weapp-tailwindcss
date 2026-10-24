import type File from 'vinyl'
import type { RunVinylActivity, VinylActivity } from './vinyl-activity'
import path from 'node:path'
import stream from 'node:stream'
import { emitHmrTiming } from '../shared/hmr-timing'
import { materializeErrorStack } from '../shared/materialize-error-stack'
import { createVinylActivityBinding } from './vinyl-activity'

export function createVinylTransform(
  phase: string,
  handler: (file: File) => Promise<void>,
  getTimingDetails?: ((file: File) => Record<string, unknown> | undefined) | undefined,
  runActivity?: RunVinylActivity,
) {
  const activityBinding = runActivity ? createVinylActivityBinding(runActivity) : undefined
  const transform = new stream.Transform({
    objectMode: true,
    transform(input: File | VinylActivity, _encoding, callback) {
      const activity = runActivity ? input as VinylActivity : undefined
      const file = activity ? activity.file : input as File
      const invoke = async () => {
        if (activity) {
          activity.started = true
        }
        const startedAt = performance.now()
        let failure: Error | undefined
        try {
          await handler(file)
          emitHmrTiming('gulp', phase, performance.now() - startedAt, {
            file: file.relative || path.basename(file.path),
            ...getTimingDetails?.(file),
          })
        }
        catch (error) {
          materializeErrorStack(error)
          failure = error as Error
        }
        try {
          if (activity && !failure) {
            activityBinding!.publish(activity, () => callback(undefined, file))
          }
          else {
            if (activity) {
              activity.outputDone = true
            }
            callback(failure, file)
          }
        }
        finally {
          if (activity) {
            activity.handlerDone = true
            activity.settle()
          }
        }
      }
      void (activity ? activity.scope!(invoke) : invoke()).catch(error => transform.destroy(error))
    },
  })
  activityBinding?.bind(transform)
  return transform
}
