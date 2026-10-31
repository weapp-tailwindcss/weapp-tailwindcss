export const diagnosticSymbol = 'weapp-tailwindcss.benchmark.allocation-observer.v1'
export const allocationProject = 'demo-uni-app-vite-tailwindcss-v4__mp-weixin'
export const mpxProject = 'demo-mpx-tailwindcss-v4__mp-weixin'
export const allocationProjects = Object.freeze([allocationProject, 'demo-taro-vite-react-tailwindcss-v4__mp-weixin', mpxProject])
export const mutationMarkerRule = '固定 twbenchdiagnosticround 加 1..3；两侧相同，不含时钟或进程信息；初始源码碰撞即失败'

/**
 * 仅供独立诊断使用的确定性修改标记。
 * @param {number} round 已登记的修改轮次。
 * @param {string} original 未修改的实际来源文本。
 * @returns {string} 两侧一致且不在初始来源中的标记。
 */
export function diagnosticMutationMarker(round, original) {
  if (!Number.isInteger(round) || round < 1 || round > 3 || typeof original !== 'string') {
    throw new Error('诊断 marker 只接受固定三轮和原始来源文本')
  }
  const marker = `twbenchdiagnosticround${round}`
  if (original.includes(marker)) {
    throw new Error('诊断 marker 与初始来源碰撞，拒绝不可比的修改输入')
  }
  return marker
}

export const limits = Object.freeze({
  samplingInterval: 256 * 1024,
  maxSnapshots: 8,
  maxStores: 32,
  maxOperationEvents: 4096,
  maxOperationIdentities: 4096,
  maxSourceEntries: 4096,
  maxCandidates: 100000,
  maxMappingFiles: 128,
  maxMappingBytes: 32 * 1024 * 1024,
  maxProfileBytes: 16 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
  commandTimeoutMs: 10000,
})

export const allocationSamplingUnavailable = '分配采样已禁用：Node 22.23.4 的 V8 inspector 会隐式请求 kSamplingForceGC，违反诊断不能主动请求 GC 的约束；请单独使用 inputs 模式'

export function validateDiagnosticMode(mode) {
  if (mode === 'allocation') {
    throw new Error(allocationSamplingUnavailable)
  }
  if (mode !== 'inputs') {
    throw new Error('诊断模式必须明确为 inputs；不将未知模式降级或作为分配采样执行')
  }
}

export function validateAllocationRequest({ enabled, mode, guardMode, baselineRef, selectedProjects, buildRuns, hmrRuns }) {
  if (!enabled) {
    return
  }
  validateDiagnosticMode(mode)
  if (guardMode || !/^[a-f\d]{40}$/i.test(baselineRef)) {
    throw new Error('分配诊断必须使用完整 Git 基线 SHA，且不能与正式 --guard 一起运行')
  }
  if (selectedProjects.length !== 1 || !allocationProjects.includes(selectedProjects[0].key) || buildRuns !== 3 || hmrRuns !== 3) {
    throw new Error('分配诊断仅接受登记的 Uni、Taro Vite 或 Mpx 项目和固定 build 3 / HMR 3 工作负载')
  }
}
