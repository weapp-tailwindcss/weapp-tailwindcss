export interface EscapeOptions {
  map?: Record<string, string>
  ignoreHead?: boolean
}

export interface UnescapeOptions {
  map?: Record<string, string>
  ignoreHead?: boolean
}

export function toEscapeOptions(options?: EscapeOptions): EscapeOptions {
  return options ?? {}
}

export function toUnescapeOptions(options?: UnescapeOptions): UnescapeOptions {
  return options ?? {}
}
