import { readFile, writeFile } from 'node:fs/promises'
import { serialize } from 'node:v8'
import { prepareTarget } from './prepare.mjs'

const { item, published, directory, logs, response } = JSON.parse(await readFile(process.argv[2], 'utf8'))
const prepared = await prepareTarget(item, published, directory, logs)
await writeFile(response, serialize(prepared))
