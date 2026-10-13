import path from 'node:path'
import process from 'node:process'
import { prepareIosBuildTarget } from './ios-build-target'
import { formatNativeFailure, withNativeArtifacts } from './native-artifacts'

async function main() {
  const file = process.env['LYNX_IOS_BUILD_TARGET_FILE']
  if (!file) {
    throw new Error('LYNX_IOS_BUILD_TARGET_FILE 必须指向本轮 CI 准备文件。')
  }
  await withNativeArtifacts('ios', path.dirname(file), async () => {
    const target = await prepareIosBuildTarget(process.cwd(), file)
    process.stdout.write(`${JSON.stringify({ target, file }, null, 2)}\n`)
  })
}

main().catch((error) => {
  process.stderr.write(`${formatNativeFailure(error)}\n`)
  process.exitCode = 1
})
