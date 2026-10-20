import type { NativeEvidenceWriter } from './native-evidence'
import type { ThemeOverrideEvidence, ThemeOverridePhase } from './theme-overrides-contract'
import type { NativeRect } from './types'
import { themeOverrideContract as contract, themeOverrideId } from './theme-overrides-contract'

let controller: ((phase: ThemeOverridePhase) => void) | undefined

/** 组件显式提供本轮状态入口；卸载时仅注销自己的控制器。 */
export function bindThemeOverrideController(setPhase: (phase: ThemeOverridePhase) => void) {
  if (controller) {
    throw new Error('主题覆盖控制器重复挂载')
  }
  controller = setPhase
  return () => {
    if (controller === setPhase) {
      controller = undefined
    }
  }
}

async function setPhaseAndWait(phase: ThemeOverridePhase, measure: (id: string) => Promise<NativeRect | undefined>) {
  if (!controller) {
    throw new Error('主题覆盖控制器未挂载')
  }
  controller(phase)
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const markers = await Promise.all(contract.branches.map(branch => measure(`probe-child-${themeOverrideId(branch, phase)}-a`)))
    if (markers.every(rect => rect && Math.abs(rect.width - contract.markerWidths[phase]) <= 0.1 && Math.abs(rect.height - 8) <= 0.1)) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`主题覆盖 ${phase} 未观察到本轮 React 提交的实际宿主标尺`)
}

/** class、节点 ID 与标尺同时提交；截图失败也先恢复状态，再拒绝成功报告。 */
export async function collectThemeOverrides(evidence: NativeEvidenceWriter, measure: (id: string) => Promise<NativeRect | undefined>): Promise<ThemeOverrideEvidence> {
  const frames: ThemeOverrideEvidence['frames'] = []
  const errors: unknown[] = []
  try {
    for (const phase of contract.phases) {
      await setPhaseAndWait(phase, measure)
      for (const branch of contract.branches) {
        const id = themeOverrideId(branch, phase)
        frames.push({ phase, branch, id, geometry: await evidence.geometry(id) })
      }
    }
  }
  catch (error) {
    errors.push(error)
  }
  finally {
    if (errors.length) {
      try {
        await setPhaseAndWait('restored', measure)
      }
      catch (error) {
        errors.push(new Error('主题覆盖恢复失败', { cause: error }))
      }
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, '主题覆盖采集或恢复失败')
  }
  return { contract: contract.id, frames }
}
