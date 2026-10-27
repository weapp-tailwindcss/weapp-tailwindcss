export interface SourceBuildReceipt {
  readonly source: string
  readonly css: string
}

/** 来源标识属于编译快照，不能用路径相同的旧回调完成当前请求。 */
export function createSourceBuildReceipt(sourceMarker: string) {
  let resolve!: (receipt: SourceBuildReceipt) => void
  let reject!: (error: Error) => void
  const promise = new Promise<SourceBuildReceipt>((resolveBuild, rejectBuild) => {
    resolve = resolveBuild
    reject = rejectBuild
  })
  let settled = false
  return {
    promise,
    accept(receipt: SourceBuildReceipt) {
      if (settled || !receipt.source.includes(sourceMarker)) {
        return false
      }
      settled = true
      resolve(receipt)
      return true
    },
    reject(error: Error) {
      if (!settled) {
        settled = true
        reject(error)
      }
    },
  }
}
