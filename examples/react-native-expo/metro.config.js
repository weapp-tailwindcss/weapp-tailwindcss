const path = require('node:path')
const { withWeappTailwindcss } = require('@weapp-tailwindcss/react-native/metro')
const { getDefaultConfig } = require('expo/metro-config')
const tailwindInput = require('./tailwind-input.cjs')

const config = getDefaultConfig(__dirname)
const sharedCatalog = path.resolve(__dirname, '../../tools/tailwindcss-test-catalog')
config.watchFolders = [...new Set([...(config.watchFolders ?? []), sharedCatalog])]

module.exports = withWeappTailwindcss(config, tailwindInput)
