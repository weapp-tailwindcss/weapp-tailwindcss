const path = require('node:path')
const process = require('node:process')
const { withWeappTailwindcss } = require('@weapp-tailwindcss/react-native/metro')
const { getDefaultConfig } = require('expo/metro-config')
const tailwindInput = require('./tailwind-input.cjs')

const config = getDefaultConfig(__dirname)
const sharedCatalog = path.resolve(__dirname, '../../tools/tailwindcss-test-catalog')
config.watchFolders = [...new Set([...(config.watchFolders ?? []), sharedCatalog])]

// 仅本仓库原生验收显式启用，普通示例不依赖 E2E 观察器。
const observed = process.env.RN_METRO_HTTP_ARCHIVE
  ? require('../../e2e/react-native/http-archive.cjs').withMetroHttpArchive(config)
  : config

const generated = withWeappTailwindcss(observed, tailwindInput)
module.exports = process.env.RN_METRO_HMR_ARCHIVE
  ? require('../../e2e/react-native/hmr-observation/config.cjs').withMetroHmrObservation(generated)
  : generated
