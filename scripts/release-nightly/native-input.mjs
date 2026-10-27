import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { writeNativeInput } from './native-inputs.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const target = process.argv.find(argument => argument.startsWith('--target='))?.slice('--target='.length)
writeNativeInput(root, target)
