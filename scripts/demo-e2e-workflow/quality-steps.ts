export interface WorkflowStep {
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  local?: boolean
}

/** 质量验证与设备阶段共用一次本地全面测试门禁，任何失败都会停止后续阶段。 */
export function createQualityWorkflowSteps(): WorkflowStep[] {
  return [
    { name: 'quality root build', command: 'pnpm', args: ['build'] },
    { name: 'quality all unit tests', command: 'pnpm', args: ['test', '--update=none'] },
    { name: 'quality lint', command: 'pnpm', args: ['lint'] },
    { name: 'quality typecheck', command: 'pnpm', args: ['typecheck'] },
    { name: 'quality architecture', command: 'pnpm', args: ['architecture:check'] },
    { name: 'quality website build', command: 'pnpm', args: ['--filter', '@weapp-tailwindcss/website', 'build'] },
    { name: 'quality agents check', command: 'pnpm', args: ['agents:check'] },
    { name: 'quality release status', command: 'pnpm', args: ['release', 'status'] },
    { name: 'quality diff check', command: 'git', args: ['diff', '--check'] },
  ].map(step => ({ ...step, local: true }))
}
