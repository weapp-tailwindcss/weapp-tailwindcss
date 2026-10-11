const versions: Record<string, string[]> = {
  tailwindcss: ['2.2.19', '3.4.18', '3.4.19', '4.2.4'],
  postcss: ['7.0.39', '8.5.3', '8.5.6'],
  autoprefixer: ['9.8.8', '10.4.21', '10.4.22'],
  'weapp-tailwindcss': ['3.8.0-alpha.2', '3.8.5', '4.12.0-alpha.2', '4.12.0', '5.4.2'],
}

export async function json(packagePath: string) {
  const packageName = packagePath.replace(/^\//u, '')
  const packageVersions = versions[packageName] ?? []
  return {
    'dist-tags': {
      latest: packageVersions.at(-1),
    },
    versions: Object.fromEntries(packageVersions.map(version => [version, {}])),
  }
}
