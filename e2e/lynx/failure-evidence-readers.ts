import type { NativeEvidenceContext } from '../../examples/react-lynx/src/compatibility/types'
import type { NativeFailureReaders } from './failure-evidence'
import type { AndroidDevice } from './native-device'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execa } from 'execa'
import { mediaGateArtifactNames } from '../../examples/react-lynx/src/compatibility/media-gate-contract'
import { validateEvidenceContext } from './evidence'
import { adbArgs } from './native-device'

const applicationId = 'com.weapptailwindcss.lynxcompat'
const artifactNames = new Set(mediaGateArtifactNames())

function requireArtifactName(name: string) {
  if (!artifactNames.has(name)) {
    throw new Error('原生失败诊断只接受固定媒体文件白名单')
  }
}

/** 容器内只读取本轮独占目录，缺文件与权限/设备故障分别记录。 */
export function iosFailureReaders(container: string, context: NativeEvidenceContext): NativeFailureReaders {
  validateEvidenceContext(context)
  const directory = path.join(container, 'Library', 'Application Support', 'lynx-compat', context.runId)
  const read = (file: string) => fs.readFile(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return undefined
    }
    throw error
  })
  return { failure: () => read(path.join(directory, 'failure.json')), artifact: (name) => {
    requireArtifactName(name)
    return read(path.join(directory, 'artifacts', name))
  } }
}

export type AndroidDiagnosticCommand = (args: string[]) => Promise<{ exitCode?: number, stdout: Uint8Array, stderr: Uint8Array }>

/** Android shell -T 禁用终端转换，保留 PNG 字节并接收远端退出码。 */
export function androidFailureReaders(device: AndroidDevice, context: NativeEvidenceContext, execute: AndroidDiagnosticCommand = args => execa('adb', args, { encoding: 'buffer', reject: false, timeout: 10_000 })): NativeFailureReaders {
  validateEvidenceContext(context)
  const read = async (name: string, artifact = false) => {
    // 这是 Android 设备内的 POSIX 路径，不使用宿主机路径分隔符。
    const source = path.posix.join('files', 'lynx-compat', context.runId, ...(artifact ? ['artifacts'] : []), name)
    const result = await execute(adbArgs(device, ['shell', '-T', 'run-as', applicationId, 'cat', source]))
    if (result.exitCode === 0) {
      return result.stdout
    }
    const stderr = new TextDecoder().decode(result.stderr).trim()
    if (result.exitCode === 1 && stderr === `cat: ${source}: No such file or directory`) {
      return undefined
    }
    throw new Error(`Android 原生失败诊断读取失败 ${name} (exit=${result.exitCode ?? 'unknown'}): ${stderr}`)
  }
  return { failure: () => read('failure.json'), artifact: (name) => {
    requireArtifactName(name)
    return read(name, true)
  } }
}
