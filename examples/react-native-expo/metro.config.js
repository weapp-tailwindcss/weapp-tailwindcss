const { withWeappTailwindcss } = require('@weapp-tailwindcss/react-native/metro')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

module.exports = withWeappTailwindcss(config, {
  input: './global.css',
  sourceGlobs: ['./src/**/*.{js,jsx,ts,tsx,json}', './App.tsx'],
})
