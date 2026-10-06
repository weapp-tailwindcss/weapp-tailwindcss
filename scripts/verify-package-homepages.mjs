import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const canonicalOrigin = 'https://tw.weapp.dev'
const packageGroups = ['packages', 'packages-runtime']

const expectedHomepages = {
  '@weapp-tailwindcss/cli': '/docs/tools/weapp-tw-cli',
  '@weapp-tailwindcss/cva': '/docs/community/merge/cva-and-variants',
  '@weapp-tailwindcss/cn': '/docs/community/merge',
  '@weapp-tailwindcss/debug-uni-app-x': '/docs/config/uni-app-x',
  '@weapp-tailwindcss/engine': '/',
  '@weapp-tailwindcss/escape': '/',
  '@weapp-tailwindcss/experimental': '/',
  '@weapp-tailwindcss/hbuilderx-runner': '/docs/quick-start/frameworks/hbuilderx',
  '@weapp-tailwindcss/init': '/docs/quick-start/install',
  '@weapp-tailwindcss/logger': '/',
  '@weapp-tailwindcss/lynx': '/docs/quick-start/frameworks/lynx',
  '@weapp-tailwindcss/merge': '/docs/community/merge',
  '@weapp-tailwindcss/postcss': '/',
  '@weapp-tailwindcss/postcss-calc': '/',
  '@weapp-tailwindcss/react-native': '/docs/quick-start/react-native-expo',
  '@weapp-tailwindcss/reset': '/',
  '@weapp-tailwindcss/runtime': '/docs/community/merge/runtime-api',
  '@weapp-tailwindcss/shared': '/',
  '@weapp-tailwindcss/source-scan': '/',
  '@weapp-tailwindcss/typography': '/docs/community/plugins',
  '@weapp-tailwindcss/ui': '/docs/community/packages-runtime',
  '@weapp-tailwindcss/variants': '/docs/community/merge/cva-and-variants',
  'tailwindcss-config': '/',
  'tailwindcss-core-plugins-extractor': '/',
  'tailwindcss-injector': '/',
  'theme-transition': '/',
  'weapp-style-injector': '/docs/quick-start/independent-pkg',
  'weapp-tailwindcss': '/',
  'weapp-tw': '/docs/tools/weapp-tw-cli',
  'wetw': '/',
}

async function readPublicPackages() {
  const packages = []
  for (const group of packageGroups) {
    const groupRoot = path.join(repositoryRoot, group)
    const entries = await readdir(groupRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }
      const packageRoot = path.join(groupRoot, entry.name)
      const packageJsonPath = path.join(packageRoot, 'package.json')
      let manifest
      try {
        manifest = JSON.parse(await readFile(packageJsonPath, 'utf8'))
      }
      catch (error) {
        if (error?.code === 'ENOENT') {
          continue
        }
        throw error
      }
      if (manifest.private === true) {
        continue
      }
      packages.push({ manifest, packageRoot })
    }
  }
  return packages.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
}

function expectedUrl(packageName) {
  return new URL(expectedHomepages[packageName], canonicalOrigin).toString()
}

async function verifyRemote(url) {
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
    headers: { 'user-agent': 'weapp-tailwindcss-package-homepage-check' },
  })
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status}`)
  }
  await response.arrayBuffer()
}

async function main() {
  const skipNetwork = process.argv.includes('--skip-network') || process.env.PACKAGE_HOMEPAGE_CHECK_SKIP_NETWORK === '1'
  const packages = await readPublicPackages()
  const errors = []
  const discoveredNames = new Set(packages.map(({ manifest }) => manifest.name))

  for (const { manifest, packageRoot } of packages) {
    const name = manifest.name
    const relativeManifest = path.relative(repositoryRoot, path.join(packageRoot, 'package.json'))
    const expectedPath = expectedHomepages[name]
    if (!expectedPath) {
      errors.push(`${relativeManifest} is public but missing an expected homepage entry`)
      continue
    }

    const homepage = manifest.homepage
    if (typeof homepage !== 'string') {
      errors.push(`${relativeManifest} is missing homepage`)
      continue
    }

    let parsed
    try {
      parsed = new URL(homepage)
    }
    catch {
      errors.push(`${relativeManifest} has an invalid homepage URL: ${homepage}`)
      continue
    }

    const expected = expectedUrl(name)
    if (parsed.origin !== canonicalOrigin || parsed.pathname !== expectedPath || parsed.search || parsed.hash) {
      errors.push(`${relativeManifest} homepage must be ${expected}, received ${homepage}`)
      continue
    }

    if (!skipNetwork) {
      try {
        await verifyRemote(homepage)
      }
      catch (error) {
        errors.push(`${name} homepage ${homepage} is not directly reachable with HTTP 200: ${error.message}`)
      }
    }
  }

  for (const name of Object.keys(expectedHomepages)) {
    if (!discoveredNames.has(name)) {
      errors.push(`expected public package ${name} was not discovered`)
    }
  }

  if (errors.length > 0) {
    process.stderr.write(`Package homepage validation failed:\n- ${errors.join('\n- ')}\n`)
    process.exitCode = 1
    return
  }

  const networkMessage = skipNetwork ? ' (network checks skipped)' : ''
  process.stdout.write(`Validated homepages for ${packages.length} public packages${networkMessage}.\n`)
}

await main()
