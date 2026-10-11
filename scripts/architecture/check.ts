import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { auditArchitecture } from './audit'

const root = fileURLToPath(new URL('../../', import.meta.url))
const result = auditArchitecture(path.resolve(root))
if (result.errors.length) {
  console.error(result.errors.join('\n'))
  process.exitCode = 1
}
else {
  console.log(`架构检查通过：${result.packages} 个包，${result.files} 个源码文件。`)
}
