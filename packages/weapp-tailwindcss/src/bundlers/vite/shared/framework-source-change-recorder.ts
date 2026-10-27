import type { ViteSourceCandidateChange } from './framework-hmr-candidate-state'

/** 合并同一轮来源事件的候选变化，保持增删互相抵消的语义。 */
export function createHotUpdateChangeRecorder(pendingHotUpdateChangeByFile: Map<string, ViteSourceCandidateChange>) {
  return (change: ViteSourceCandidateChange | undefined) => {
    if (!change) {
      return undefined
    }
    const previous = pendingHotUpdateChangeByFile.get(change.file)
    if (!previous) {
      const remembered = {
        ...change,
        addedCandidates: new Set(change.addedCandidates),
        removedCandidates: new Set(change.removedCandidates),
      }
      pendingHotUpdateChangeByFile.set(change.file, remembered)
      return remembered
    }
    for (const candidate of change.addedCandidates) {
      previous.addedCandidates.add(candidate)
      previous.removedCandidates.delete(candidate)
    }
    for (const candidate of change.removedCandidates) {
      if (!previous.addedCandidates.delete(candidate)) {
        previous.removedCandidates.add(candidate)
      }
    }
    previous.runtimeAffecting ||= change.runtimeAffecting
    return previous
  }
}
