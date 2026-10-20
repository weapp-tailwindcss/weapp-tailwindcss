import { fileURLToPath } from 'node:url'

export const decoderDataDirectory = fileURLToPath(new URL('../../../packages/lynx/src/decoder-data/', import.meta.url))
