import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { buildAndLaunchIos } from './ios-build'

const [device, url, artifacts] = process.argv.slice(2)
if (!device || !url || !artifacts || process.argv.length !== 5) {
  throw new Error('用法：ios-build-cli <预检设备> <应用深链> <本轮证据目录>')
}
const project = path.resolve(import.meta.dirname, '../../examples/react-native-expo')
// eslint-disable-next-line antfu/no-top-level-await
await buildAndLaunchIos({ project, device, url, artifacts, bundleId: 'com.weapptailwindcss.rncompat' }, async (file, args, cwd, stream) => {
  const result = await execa(file, args, { cwd, stdout: stream ? 'inherit' : 'pipe', stderr: 'inherit', stdin: 'ignore', timeout: 1_800_000 })
  return result.stdout ?? ''
})
