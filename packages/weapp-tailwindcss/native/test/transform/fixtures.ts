import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

export const classes = ['w-[10px]', 'h-[20px]', 'p-[3px]', 'mt-[2px]', 'gap-[4px]', 'flex', '中😀', 'w-1/2', 'text-red/50', 'pages/home']

export const sources = [
  '',
  'const x = "w-[10px] h-[20px]"',
  '"w-[10px]"; function f() { "h-[20px]"; return "p-[3px]"; }',
  'const x = c === "w-[10px]" ? "h-[20px]" : "p-[3px]"',
  'const x = fn("w-[10px]") && !v["p-[3px]"] ? "h-[20px]" : "mt-[2px]"',
  'const x = ((c === "w-[10px]")) ? "h-[20px]" : "plain"',
  'const x = "中😀 w-1/2 text-red/50 pages/home"',
  'const x = "w-\\u005b10px\\u005d"',
  'const x = `w-\\u005b10px\\u005d`',
  // eslint-disable-next-line no-template-curly-in-string -- 被测源码保留模板插值。
  'const x = `w-[10px] ${flag ? "h-[20px]" : `p-[3px]`} mt-[2px]`',
  'const x = `w-[10px]\\nh-[20px]\\tp-[3px]`',
  'const x = `w-[10px]\r\nh-[20px]`',
  'const x = String.raw`w-[10px]`',
  'import x from "w-[10px]"; export const y = "h-[20px]"',
  'export default "w-[10px]"',
  'const x = import("w-[10px]")',
  'const x = <view className="w-[10px]">中😀</view>',
  'const x = <view className="w-&#91;10px&#93;"/>',
  'type T = "w-[10px]"; const x:T="h-[20px]"',
  'const x = eval("w-[10px]")',
  '/* weapp-tw ignore */ const x = "w-[10px]"',
]

/** 与 raw-transfer 基准保持同一 125,082 字节输入和输入哈希。 */
export function createInput() {
  const header = 'import { includes } from "./vendor.js";\nconst tagged = String.raw`plain`;\nexport function render(value, name) { return [\n'
  const footer = ']; }\n'
  const records: string[] = []
  let bytes = Buffer.byteLength(header + footer)
  for (let index = 0; bytes < 125_000; index++) {
    const record = `{id:${index},label:"中文😀",className:value === "w-[10px]" ? "h-[20px] flex" : \`mt-[2px] \${name}\`,nested:includes("w-[10px]") && !value["p-[3px]"] ? "gap-[4px]" : "plain"},\n`
    records.push(record)
    bytes += Buffer.byteLength(record)
  }
  const sourceFor = (id: number) => `/* sample:${String(id).padStart(8, '0')} */\n${header}${records.join('')}${footer}`
  const source = sourceFor(0)
  return { sourceFor, bytes: Buffer.byteLength(source), units: source.length, sha256: createHash('sha256').update(source).digest('hex') }
}
