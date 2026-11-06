import { copyFile } from 'node:fs/promises'

await Promise.all(['index.d.ts', 'index.d.cts'].map(filename => copyFile(
  new URL(`../src/${filename}`, import.meta.url),
  new URL(`../dist/${filename}`, import.meta.url),
)))
