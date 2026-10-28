import process from 'node:process'
import { getExpectedHashedAssets, verifyDeploymentAssets } from './deployment-verification'
import { parseDeploymentVerificationOptions } from './deployment-verification-options'

const attempts = 12
const retryDelayMs = 5_000

async function main() {
  const options = parseDeploymentVerificationOptions(process.argv.slice(2))
  const { canonicalOrigin, siteUrl, target } = options
  const assets = await getExpectedHashedAssets()
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await verifyDeploymentAssets(options, assets)
      console.log(`[website] Workers 部署验证通过：${siteUrl.origin}（target: ${target}, canonical: ${canonicalOrigin}）`)
      return
    }
    catch (error) {
      lastError = error
      console.warn(`[website] 第 ${attempt}/${attempts} 次验证失败：${error instanceof Error ? error.message : String(error)}`)
      if (attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs))
      }
    }
  }
  throw lastError
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
