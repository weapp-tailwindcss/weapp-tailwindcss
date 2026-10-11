export type DoctorCheckStatus = 'ok' | 'warn' | 'error' | 'info'

export interface DoctorCheck {
  id: string
  title: string
  status: DoctorCheckStatus
  message: string
  suggestion?: string | undefined
  /** 供 CI 或 issue 自动归类的稳定诊断编码。 */
  code?: string | undefined
  /** 支撑该诊断的配置文件或路径证据。 */
  evidence?: string[] | undefined
}

export interface DoctorReport {
  cwd: string
  nodeVersion: string
  detected: {
    packageManager?: string | undefined
    frameworks: string[]
    tailwindcssVersion?: string | undefined
    weappTailwindcssVersion?: string | undefined
  }
  summary: Record<DoctorCheckStatus, number>
  checks: DoctorCheck[]
}

export interface DoctorOptions {
  cwd?: string | undefined
  nodeVersion?: string | undefined
}

export interface PackageJson {
  dependencies?: Record<string, string> | undefined
  devDependencies?: Record<string, string> | undefined
  optionalDependencies?: Record<string, string> | undefined
  peerDependencies?: Record<string, string> | undefined
  packageManager?: string | undefined
}
