export interface CaptureWindow {
  initialized: boolean
  completed: boolean
  frames: number
  events: number
  overflow: boolean
  disturbances: string[]
  geometry: { width: number, height: number }
  fingerprint: string
}

export interface BrowserMonitor {
  settle: () => Promise<void>
  finish: () => CaptureWindow
  dispose: () => void
}

/** 结束时的正常状态不能抹去捕获期间已经发生的扰动或缺失证据。 */
export function validCaptureWindow(window: CaptureWindow | null | undefined) {
  return !!window && window.initialized && window.completed && window.frames >= 2
    && !window.overflow && window.disturbances.length === 0
    && typeof window.fingerprint === 'string' && window.fingerprint.length > 0
    && Number.isSafeInteger(window.geometry.width) && window.geometry.width > 0
    && Number.isSafeInteger(window.geometry.height) && window.geometry.height > 0
}
