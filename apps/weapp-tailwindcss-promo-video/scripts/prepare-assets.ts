import fs from 'node:fs/promises'
import path from 'node:path'
import QRCode from 'qrcode'
import { DOCS_URL } from '../src/config'
import { publicDir, repoRoot } from './paths'

const brandDir = path.join(publicDir, 'brand')
await fs.mkdir(brandDir, { recursive: true })
await fs.copyFile(path.join(repoRoot, 'assets', 'logo.svg'), path.join(brandDir, 'logo.svg'))
await QRCode.toFile(path.join(brandDir, 'docs-qr.png'), DOCS_URL, { width: 640, margin: 3, errorCorrectionLevel: 'H', color: { dark: '#040D1AFF', light: '#FFFFFFFF' } })
for (const asset of ['uni-app.svg', 'taro.png', 'mpx.png', 'weapp-vite.svg', 'expo.svg', 'lynx.svg', 'vite.svg', 'webpack.svg']) {
  await fs.copyFile(path.join(repoRoot, 'website', 'src', 'assets', 'framework-logos', asset), path.join(brandDir, asset))
}
console.log('品牌素材与官网二维码已准备。')
