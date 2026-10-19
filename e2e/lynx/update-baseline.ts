import path from 'node:path'
import process from 'node:process'
import { updateNativeBaseline } from './baseline-update'
import { compatibilityDir, repoRoot } from './catalog'
import { defaultReportPath } from './reports'

async function main() {
  const result = await updateNativeBaseline({
    iosPath: process.env['LYNX_IOS_REPORT'] ?? defaultReportPath('ios'),
    androidPath: process.env['LYNX_ANDROID_REPORT'] ?? defaultReportPath('android'),
    reportDirectory: path.dirname(defaultReportPath('ios')),
    baselinePath: path.join(compatibilityDir, 'baseline.json'),
    archiveRoot: path.join(repoRoot, 'e2e', '.artifacts', 'lynx-baselines'),
  })
  process.stdout.write(`原始双端证据已归档并重放：${path.relative(process.cwd(), result.archive.indexPath)}。\n`)
  process.stdout.write(`已使用同版本双端报告更新 ${[...Object.values(result.reports), result.baseline].map(file => path.relative(process.cwd(), file)).join('、')}。\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
