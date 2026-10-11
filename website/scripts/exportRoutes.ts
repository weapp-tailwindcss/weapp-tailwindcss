import fs from 'fs-extra'
import path from 'pathe'

async function collectHtmlFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return collectHtmlFiles(entryPath)
    }
    return entry.isFile() && entry.name.endsWith('.html') ? [entryPath] : []
  }))
  return files.flat()
}

async function exportRoutes() {
  const buildDirectory = path.resolve(__dirname, '../build')
  const htmlFiles = await collectHtmlFiles(buildDirectory)
  const routes = htmlFiles
    .map(file => path.relative(buildDirectory, file))
    .filter(file => path.basename(file) !== '404.html')
    .map((file) => {
      const withoutExtension = file.slice(0, -'.html'.length)
      const routePath = withoutExtension === 'index'
        ? ''
        : withoutExtension.replace(/\/index$/, '')
      return `/${routePath}`
    })
    .sort((left, right) => left.localeCompare(right, 'en'))

  await fs.outputJSON(
    path.resolve(__dirname, '../routes.json'),
    routes,
    {
      spaces: 2,
    },
  )
}

exportRoutes()
