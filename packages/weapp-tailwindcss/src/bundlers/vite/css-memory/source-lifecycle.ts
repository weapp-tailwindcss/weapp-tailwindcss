import { normalizeOutputPathKey } from '../../shared/module-graph'
import { cleanUrl } from '../utils'

/** 同一个物理来源的全部样式请求共享删除代次，输出资产仍单独归属。 */
export function normalizeViteCssSourceOwner(file: string) {
  return normalizeOutputPathKey(cleanUrl(file))
}

export type ViteCssSourceLease = (() => boolean) & { release: () => void }
export const discardedViteCssSource = Symbol('discarded Vite CSS source')

export function captureViteCssSources(capture: ((file: string) => ViteCssSourceLease) | undefined, files: Iterable<string>): ViteCssSourceLease {
  const leases = [...new Set(files)].map(file => capture?.(file))
  return Object.assign(() => leases.every(lease => lease?.() !== false), {
    release: () => leases.forEach(lease => lease?.release()),
  })
}

export function createViteCssSourceLifecycle() {
  const owners = new Map<string, { current: boolean, pending: number }>()
  const deleted = new Set<string>()
  const maxDeletedSources = 128
  let disposed = false
  return {
    capture(file: string): ViteCssSourceLease {
      if (disposed) {
        return Object.assign(() => false, { release() {} })
      }
      const key = normalizeViteCssSourceOwner(file)
      const owner = owners.get(key) ?? { current: !deleted.has(key), pending: 0 }
      owners.set(key, owner)
      owner.pending++
      let released = false
      return Object.assign(() => !released && !disposed && owner.current, {
        release() {
          if (released) {
            return
          }
          released = true
          owner.pending--
          if (owner.pending === 0 && owners.get(key) === owner) {
            owners.delete(key)
          }
        },
      })
    },
    isActive(file: string) {
      return !disposed && !deleted.has(normalizeViteCssSourceOwner(file))
    },
    remove(file: string) {
      const key = normalizeViteCssSourceOwner(file)
      if (disposed) {
        return key
      }
      const owner = owners.get(key)
      if (owner) {
        owner.current = false
      }
      owners.delete(key)
      deleted.delete(key)
      deleted.add(key)
      // 在途凭据已经撤销；历史删除身份只保留有界窗口，不积累整段 watch 历史。
      if (deleted.size > maxDeletedSources) {
        deleted.delete(deleted.values().next().value!)
      }
      return key
    },
    restore(file: string) {
      if (disposed) {
        return
      }
      const key = normalizeViteCssSourceOwner(file)
      if (deleted.delete(key) || owners.get(key)?.current === false) {
        owners.delete(key)
      }
    },
    getStats: () => ({ pendingCssSourceOwners: owners.size, deletedCssSources: deleted.size }),
    dispose() {
      disposed = true
      owners.clear()
      deleted.clear()
    },
  }
}
