import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const packageCount = Number(process.argv[2] ?? 4)
const filesPerPackage = Number(process.argv[3] ?? 30)
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-tw-issue-1127-'))
const kinds = { page: 0, component: 0, subpackage: 0 }

for (let packageIndex = 0; packageIndex < packageCount; packageIndex++) {
  const packageRoot = path.join(root, `package-${packageIndex + 1}`, 'src')
  await fs.mkdir(packageRoot, { recursive: true })
  for (let fileIndex = 0; fileIndex < filesPerPackage; fileIndex++) {
    const kind = fileIndex % 10 === 0 ? 'subpackage' : fileIndex % 3 === 0 ? 'page' : 'component'
    const relativeDir = kind === 'subpackage'
      ? path.join('subpackage', `pkg-${fileIndex + 1}`, 'pages')
      : kind === 'page' ? path.join('pages') : path.join('components')
    const file = path.join(packageRoot, relativeDir, `${kind}-${fileIndex + 1}.vue`)
    const color = (fileIndex + packageIndex) % 2 === 0 ? 'text-sky-500' : 'text-emerald-500'
    kinds[kind]++
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, `<template><view class="${color} w-[${fileIndex + 1}px]">issue-1127-${kind}</view></template>\n`)
  }
}

process.stdout.write(`${JSON.stringify({
  files: packageCount * filesPerPackage,
  kinds,
  packageCount,
  root,
  sourceRoots: Array.from({ length: packageCount }, (_, index) => path.join(root, `package-${index + 1}`, 'src')),
})}\n`)
