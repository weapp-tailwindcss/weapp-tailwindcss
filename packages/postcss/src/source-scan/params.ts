export function parseConfigParam(params: string) {
  const value = params.trim()
  const match = /^(['"])(.+)\1$/.exec(value)
  return match?.[2]
}

export function parseSourceFileParam(params: string) {
  const value = params.trim()
  if (!value || value === 'none' || value.startsWith('inline(')) {
    return undefined
  }

  const negated = value.startsWith('not ')
  const sourceValue = negated ? value.slice(4).trim() : value
  if (sourceValue.startsWith('inline(')) {
    return undefined
  }

  const match = /^(['"])(.+)\1$/.exec(sourceValue)
  return match?.[2]
    ? {
        negated,
        sourcePath: match[2],
      }
    : undefined
}
