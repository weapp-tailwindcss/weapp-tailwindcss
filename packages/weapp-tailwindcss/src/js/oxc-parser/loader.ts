import { createRequire } from 'node:module'
import process from 'node:process'

export type OxcParser = Pick<typeof import('oxc-parser'), 'parseSync'>
  & Partial<Pick<typeof import('oxc-parser'), 'rawTransferSupported'>>

const require = createRequire(import.meta.url)
let oxcParser: OxcParser | false | undefined

export function isOxcParserRuntimeSupported(version = process.versions.node) {
  const match = /^(\d+)\.(\d+)(?:\.|$)/.exec(version)
  if (!match) {
    return false
  }
  const major = Number(match[1])
  const minor = Number(match[2])
  if (major === 20) {
    return minor >= 19
  }
  if (major === 21) {
    return false
  }
  if (major === 22) {
    return minor >= 12
  }
  return major > 22
}

export function loadOxcParser(): OxcParser | undefined {
  if (!isOxcParserRuntimeSupported() || oxcParser === false) {
    return undefined
  }
  if (oxcParser) {
    return oxcParser
  }
  try {
    oxcParser = require('oxc-parser') as OxcParser
  }
  catch {
    oxcParser = false
    return undefined
  }
  return oxcParser
}
