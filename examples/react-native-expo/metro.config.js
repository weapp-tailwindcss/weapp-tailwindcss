const path = require('node:path')
const { withWeappTailwindcss } = require('@weapp-tailwindcss/react-native/metro')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
const sharedCatalog = path.resolve(__dirname, '../../tools/tailwindcss-test-catalog')
config.watchFolders = [...new Set([...(config.watchFolders ?? []), sharedCatalog])]

module.exports = withWeappTailwindcss(config, {
  input: './global.css',
  sourceGlobs: ['./src/**/*.{js,jsx,ts,tsx}', './App.tsx', '../../tools/tailwindcss-test-catalog/src/**/*.{ts,json}'],
  watchFiles: ['./styles', './tailwind.config.mjs', './tailwind-plugin.mjs', sharedCatalog],
})
