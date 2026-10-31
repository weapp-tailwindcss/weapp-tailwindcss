import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

const input = path.dirname(fileURLToPath(import.meta.url))
const demo = path.resolve(input, '..', '..')
const args = process.argv.slice(2)
const targetIndex = args.indexOf('-p')
const target = targetIndex === -1 ? 'h5' : args[targetIndex + 1]
if (!target || !/^[a-z\d-]+$/i.test(target)) {
  throw new Error('请通过 -p 指定有效的 uni-app 目标')
}
await execa('uni', args, {
  cwd: demo,
  preferLocal: true,
  stdio: 'inherit',
  env: {
    WEAPP_TW_SKYLINE_FIXTURE: '1',
    WEAPP_TW_HMR_TIMING: '1',
    UNI_INPUT_DIR: input,
    UNI_OUTPUT_DIR: path.join(demo, 'dist', 'skyline-typography', args.includes('build') ? 'build' : 'dev', target),
  },
})
