import { Buffer } from 'node:buffer'
import { sha256 } from './evidence.mjs'

function field(value, maximum = 256) {
  if (value === undefined) return undefined
  const raw = Buffer.from(String(value))
  return { prefix: raw.subarray(0, maximum).toString('utf8'), bytes: raw.length, sha256: sha256(raw), abbreviated: raw.length > maximum }
}
const numberOrField = value => value === undefined || Number.isSafeInteger(value) ? value : field(value, 64)

/** 首次录制失败的小型现场回执；完整业务错误另由worker原日志和错误图归档。 */
export function operationTerminalReceipt({ sequence, name, phase, details, error }) {
  const original = details?.failure ?? details?.error
  return {
    schemaVersion: 1,
    complete: false,
    attempt: { sequence, name: field(name), phase: { type: field(phase?.type), round: numberOrField(phase?.round), sequence: numberOrField(phase?.sequence) }, file: field(details?.file), bundleId: numberOrField(details?.bundleId), operationId: numberOrField(details?.operationId), sourceModule: field(details?.sourceModule) },
    recordingFailure: { name: field(error?.name), message: field(error instanceof Error ? error.message : error, 512) },
    ...(original !== undefined ? { originalFailure: { type: original?.thrownType ?? typeof original, name: field(original?.name), message: field(original?.message ?? original?.value ?? original, 512) } } : {}),
    interpretation: '字段前缀带完整字节数与SHA；这是失败现场定位回执，不是完整原始输入或成功证据。',
  }
}
