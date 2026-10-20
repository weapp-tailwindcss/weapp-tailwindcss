import { LynxHarnessBlockedError, nativeFailureError } from './native-failure'

export async function waitForReportOrFailure(read: () => Promise<string | undefined>, readFailure: () => Promise<string | undefined>) {
  const deadline = Date.now() + 300_000
  while (Date.now() < deadline) {
    const failure = await readFailure()
    if (failure?.trim()) {
      throw nativeFailureError(failure)
    }
    const source = await read()
    if (source) {
      return source
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new LynxHarnessBlockedError('report-timeout', 'Timed out waiting for the native compatibility report.')
}
