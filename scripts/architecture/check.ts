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
console.log(`框架边界登记：${result.frameworkExceptions.filter(edge => edge.kind === 'assembly').length} 条组装边，${result.frameworkExceptions.filter(edge => edge.kind === 'compatibility').length} 条兼容边。`)
for (const edge of result.frameworkExceptions.filter(edge => edge.kind === 'compatibility')) {
  console.log(`兼容边：${edge.from} -> ${edge.to}；原因：${edge.reason}；内部替代：${edge.replacement}`)
}
