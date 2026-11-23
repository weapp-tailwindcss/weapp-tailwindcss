import type { NativeRunOptions } from './native-options'

/** 仅 Android 宣传录制启用 host 安全区域，不改变兼容性基线的布局。 */
export function stageCaptureHostContext<T extends object>(context: T, options: Pick<NativeRunOptions, 'platform' | 'captureOnly'>) {
  return options.platform === 'android' && options.captureOnly
    ? { ...context, captureOnly: true }
    : context
}
