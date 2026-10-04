import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const repoRoot = path.resolve(appRoot, '..', '..')
export const publicDir = path.join(appRoot, 'public')
export const audioDir = path.join(publicDir, 'audio')
export const outputDir = path.join(appRoot, 'out')
