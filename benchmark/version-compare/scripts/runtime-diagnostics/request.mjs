export const runtimeProject = 'demo-weapp-vite-tailwindcss-v4__mp-weixin'

/** 输出观察只确认文件可见，不代表生产者已提交、来源相等或 finalizer 成功。 */
export function expectedRuntimePhases() {
  return [['watch-ready', undefined], ...[1, 2, 3].flatMap(round => [['mutation-observed', round], ['rollback-observed', round]]), ['watch-stop', undefined]]
}

/** 专项模式与正式预算、其他插桩互斥；普通入口不增加前置条件。 */
export function validateRuntimeRequest({
  enabled,
  guardMode,
  baselineRef,
  selectedProjects,
  buildRuns,
  hmrRuns,
  otherDiagnostics,
}) {
  if (!enabled) {
    return
  }
  if (guardMode || otherDiagnostics || !/^[a-f\d]{40}$/i.test(baselineRef)) {
    throw new Error('weapp runtime 诊断必须独立运行，使用完整 Git 基线 SHA，不能合用正式预算或其他诊断')
  }
  if (selectedProjects.length !== 1 || selectedProjects[0].key !== runtimeProject || buildRuns !== 3 || hmrRuns !== 3) {
    throw new Error('weapp runtime 诊断只接受真正的 weapp-vite v4 项目与固定 build 3 / HMR 3 工作负载')
  }
}
