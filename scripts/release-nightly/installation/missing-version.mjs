import { isDeepStrictEqual } from 'node:util'

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)

function dependencyContext(stack) {
  if (!Array.isArray(stack) || !stack.length) {
    return undefined
  }
  const lines = []
  for (const parent of stack) {
    if (!isRecord(parent) || typeof parent.name !== 'string' || !parent.name || typeof parent.version !== 'string' || !parent.version
      || /\p{Cc}/u.test(parent.name) || /\p{Cc}/u.test(parent.version)) {
      return undefined
    }
    lines.push(`\nThis error happened while installing the dependencies of ${parent.name}@${parent.version}`)
  }
  return lines.join('')
}

function missingTarget(message, stack) {
  // 只剥离 pnpm 结构化父依赖能够准确重建的上下文。
  const context = dependencyContext(stack)
  const resolverMessage = context && message.endsWith(context) ? message.slice(0, -context.length) : message
  const reference = /^No matching version found for (\S+) while fetching it from https:\/\/registry\.npmjs\.org\/(?:\n\nFailed to resolve \1)?\s*$/u.exec(resolverMessage)?.[1]
  return reference?.replace(/^(?:@[^/@\s]+\/)?[^/@\s]+@npm:/u, '')
}

/** 仅允许已确认批次的精确 npm 版本进入安装可见性重试。 */
export function missingBatchVersion(result, expected) {
  if (!Number.isInteger(result?.exitCode) || result.exitCode <= 0 || result.timedOut || result.signal || result.isCanceled || result.isTerminated
    || result.isMaxBuffer || result.isForcefullyTerminated || result.cause !== undefined || result.code !== undefined || result.failed === false
    || typeof result.stdout !== 'string' || typeof result.stderr !== 'string') {
    return false
  }
  let missing = false
  for (const line of `${result.stdout}\n${result.stderr}`.split('\n').filter(line => line.trim())) {
    let record
    try {
      record = JSON.parse(line)
    }
    catch {
      return false
    }
    if (!isRecord(record)) {
      return false
    }
    if (record.level !== 'error') {
      continue
    }
    const nested = isRecord(record.err) ? record.err : undefined
    if (record.err !== undefined && !nested) {
      return false
    }
    const code = record.code ?? nested?.code
    const message = record.message ?? nested?.message
    if (code !== 'ERR_PNPM_NO_MATCHING_VERSION' || (nested?.code !== undefined && nested.code !== code) || typeof message !== 'string'
      || record.cause !== undefined || nested?.cause !== undefined || (nested?.message !== undefined && nested.message !== message)
      || (nested?.pkgsStack !== undefined && record.pkgsStack !== undefined && !isDeepStrictEqual(nested.pkgsStack, record.pkgsStack))) {
      return false
    }
    const target = missingTarget(message, record.pkgsStack ?? nested?.pkgsStack)
    if (!target || !expected.has(target)) {
      return false
    }
    missing = true
  }
  return missing
}
