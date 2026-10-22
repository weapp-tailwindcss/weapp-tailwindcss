import type { NativeSemanticDiagnostic } from '../../examples/react-native-expo/src/compatibility/protocol'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** 宿主序号决定诊断路径；客户端字段只能作为原件内容，不能成为成功证据。 */
export function createNativeDiagnosticWriter(directory: string) {
  let sequence = 0
  return async (diagnostic: NativeSemanticDiagnostic, signal: AbortSignal) => {
    const file = path.join(directory, 'diagnostics', `${++sequence}.json`)
    const contents = `${JSON.stringify({ ...diagnostic, evidence: 'diagnostic-only' }, null, 2)}\n`
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, contents, { encoding: 'utf8', flag: 'wx', signal })
  }
}
