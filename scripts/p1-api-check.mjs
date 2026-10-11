import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const packageJson = JSON.parse(fs.readFileSync(path.resolve('packages/weapp-tailwindcss/package.json'), 'utf8'))
const requiredExports = ['./core', './vite', './webpack', './rspack', './gulp', './types']
const missing = requiredExports.filter(name => packageJson.exports?.[name] === undefined)
if (missing.length) {
  console.error(`公共 API exports 缺少入口: ${missing.join(', ')}`)
  process.exitCode = 1
}
else {
  console.log(`公共 API exports 校验通过 (${requiredExports.length} 个入口)`)
}
