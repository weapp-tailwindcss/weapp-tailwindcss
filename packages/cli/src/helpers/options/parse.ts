export function readStringOption(flag: string, value: unknown): string | undefined {
  if (value == null) {
    return undefined
  }
  if (typeof value !== 'string') {
    throw new TypeError(`Option "--${flag}" expects a string value.`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new TypeError(`Option "--${flag}" expects a non-empty value.`)
  }
  return trimmed
}

export function readStringArrayOption(flag: string, value: unknown): string[] | undefined {
  if (value == null) {
    return undefined
  }

  if (Array.isArray(value)) {
    const normalized = value
      .filter(entry => entry != null)
      .map((entry) => {
        if (typeof entry !== 'string') {
          throw new TypeError(`Option "--${flag}" expects string values.`)
        }
        const trimmed = entry.trim()
        if (!trimmed) {
          throw new TypeError(`Option "--${flag}" expects non-empty values.`)
        }
        return trimmed
      })

    return normalized.length > 0 ? normalized : undefined
  }

  const normalized = readStringOption(flag, value)
  return normalized ? [normalized] : undefined
}

export function toBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    if (value === 'true') {
      return true
    }
    if (value === 'false') {
      return false
    }
  }
  if (value == null) {
    return fallback
  }
  return Boolean(value)
}
