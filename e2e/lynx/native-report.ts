function nativeFailureMessage(source: string) {
  try {
    const value = JSON.parse(source) as { message?: unknown }
    if (typeof value.message === 'string' && value.message.trim()) {
      return value.message
    }
  }
  catch {
    // 保留非 JSON host 的原始错误，便于定位旧宿主协议问题。
  }
  return source.trim() || 'unknown native evidence failure'
}

export async function waitForReportOrFailure(read: () => Promise<string | undefined>, readFailure: () => Promise<string | undefined>) {
  const deadline = Date.now() + 300_000
  while (Date.now() < deadline) {
    const failure = await readFailure()
    if (failure?.trim()) {
      throw new Error(`原生兼容性报告执行失败：${nativeFailureMessage(failure)}`)
    }
    const source = await read()
    if (source) {
      return source
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('Timed out waiting for the native compatibility report.')
}
