// Playwright 会以 CommonJS 加载调用方，用原生资源定位桥兼容其 require 与 tsx 的 import。
module.exports = require('node:path').join(__dirname, 'launch-gate-preload.cjs')
