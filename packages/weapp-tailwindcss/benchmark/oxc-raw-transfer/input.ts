import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function createInput() {
  const records: string[] = []
  const header = 'import { includes } from "./vendor.js";\nconst tagged = String.raw`plain`;\nexport function render(value, name) { return [\n'
  const footer = ']; }\n'
  let bytes = Buffer.byteLength(header + footer)
  for (let index = 0; bytes < 125_000; index++) {
    const record = `{id:${index},label:"中文😀",className:value === "w-[10px]" ? "h-[20px] flex" : \`mt-[2px] \${name}\`,nested:includes("w-[10px]") && !value["p-[3px]"] ? "gap-[4px]" : "plain"},\n`
    records.push(record)
    bytes += Buffer.byteLength(record)
  }
  // 只拼接完整记录；不同样本的等长注释不改变语义或字面量位置。
  const body = header + records.join('') + footer
  const sourceFor = (id: number) => {
    if (!Number.isSafeInteger(id) || id < 0 || id > 99_999_999) {
      throw new Error(`Invalid input identity: ${id}`)
    }
    return `/* sample:${String(id).padStart(8, '0')} */\n${body}`
  }
  const source = sourceFor(0)
  return {
    sourceFor,
    records: records.length,
    utf8Bytes: Buffer.byteLength(source),
    codeUnits: source.length,
    sha256: sha256(source),
  }
}
