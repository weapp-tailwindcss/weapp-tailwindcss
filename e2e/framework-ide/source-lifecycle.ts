import { writeFilePreserveEol } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import { cleanupFailure } from './cleanup'

/** 已提交的文件写入必须完成后才响应取消，避免最终恢复与迟到写入竞争。 */
export async function writeProbeSource(file: string, content: string, original: string, signal?: AbortSignal) {
  signal?.throwIfAborted()
  await writeFilePreserveEol(file, content, original)
  signal?.throwIfAborted()
}

export async function restoreProbeSources(originals: Map<string, string>, stop: () => Promise<void>) {
  const errors: Error[] = []
  for (const [file, original] of originals) {
    try {
      await writeFilePreserveEol(file, original, original, { normalizeEol: false })
    }
    catch (cause) {
      errors.push(cleanupFailure(`Failed to restore IDE HMR source ${file}`, cause))
    }
  }
  try {
    await stop()
  }
  catch (cause) {
    errors.push(cleanupFailure('Failed to stop IDE HMR watcher', cause))
  }
  return errors
}
