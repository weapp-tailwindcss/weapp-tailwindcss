const path = require('node:path')
const { resolveUniPlatform } = require('weapp-tailwindcss/framework')

function r(...args) {
  return path.resolve(__dirname, ...args)
}

const uniPlatform = resolveUniPlatform()
const isH5 = uniPlatform.isWeb
const isApp = uniPlatform.isApp

module.exports = {
  r,
  isH5,
  isApp,
}
