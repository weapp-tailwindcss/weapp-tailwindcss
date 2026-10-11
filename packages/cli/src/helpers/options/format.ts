export function normalizeTokenFormat(format: string) {
  switch (format) {
    case 'json':
    case 'lines':
    case 'grouped-json':
      return format
    default:
      return 'json'
  }
}

export function normalizeExtractFormat(format: string | undefined): 'json' | 'lines' | undefined {
  if (!format) {
    return undefined
  }
  if (format === 'json' || format === 'lines') {
    return format
  }
  return undefined
}
