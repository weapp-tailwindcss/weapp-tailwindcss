const DIGIT_MIN_CODE = 48
const DIGIT_MAX_CODE = 57

export function isAsciiNumber(code: number) {
  return code >= DIGIT_MIN_CODE && code <= DIGIT_MAX_CODE
}

export function isAllowedClassName(className: string) {
  return /^[\w-]+$/.test(className)
}
