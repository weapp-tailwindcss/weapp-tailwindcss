import path from 'node:path'
import process from 'node:process'
import { buildAndLaunchIos } from './ios-build'
import { executeIosCommand } from './ios-command'

const [device, metroUrl, artifacts] = process.argv.slice(2)
if (!device || !metroUrl || !artifacts || process.argv.length !== 5) {
  throw new Error('用法：ios-build-cli <预检设备> <Metro origin> <本轮证据目录>')
}
const project = path.resolve(import.meta.dirname, '../../examples/react-native-expo')
// eslint-disable-next-line antfu/no-top-level-await
await buildAndLaunchIos({ project, device, metroUrl, artifacts, bundleId: 'com.weapptailwindcss.rncompat' }, executeIosCommand)
