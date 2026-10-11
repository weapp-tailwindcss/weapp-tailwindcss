export const classNames = new Set(['w-[10px]', 'h-[20px]', 'p-[3px]', 'mt-[2px]', 'gap-[4px]', 'flex'])

export const javascriptCases = [
  '',
  'let number = 1;',
  'const cls = "w-[10px] h-[20px]"',
  'const label = "中文😀"; const cls = "w-[10px]"',
  'const cls = "w-\\u005b10px\\u005d"',
  '"w-[10px]"; const cls = "h-[20px]"',
  'function render() { "w-[10px]"; return "h-[20px]"; }',
  '("w-[10px]"); const cls = "h-[20px]"',
  'const n = 1; "w-[10px]"; const cls = "h-[20px]"',
  'const cls = value === "w-[10px]" ? "h-[20px]" : "plain"',
  'const cls = (("w-[10px]")) ? "h-[20px]" : "plain"',
  'const cls = matches("w-[10px]") && !values["p-[3px]"] ? "h-[20px]" : "plain"',
  'const cls = helper?.matches("w-[10px]") ? "h-[20px]" : "plain"',
  'const cls = value === "w-[10px]" ? (value === "p-[3px]" ? "h-[20px]" : "plain") : "flex"',
  // eslint-disable-next-line no-template-curly-in-string -- 保留被测模板的插值源码。
  'const cls = `w-[10px] ${active ? `h-[20px]` : "p-[3px]"} mt-[2px]`',
  'const cls = String.raw`w-[10px]`; const plain = "h-[20px]"',
  'const cls = "w-[10px]"; // p-[3px]\n/* h-[20px] */',
  '#!/usr/bin/env node\nconst cls = "w-[10px]"; const re = /h-\\[20px\\]/g;',
  'import value from "./w-[10px]"; export { value }; export * from "./p-[3px]"',
  'export { value as alias } from "./w-[10px]"',
  'export default "w-[10px]"',
  'const mod = import("./w-[10px]")',
  'const cls = "\\ud800 w-[10px] \\udc00"',
  'const cls = "\uD800 w-[10px] \uDC00"',
  'const cls = `line\r\nw-[10px]`',
  'const broken = "w-[10px]',
]

export const typescriptCases = [
  'type Size = "w-[10px]"; const cls: Size = "w-[10px]"',
  'function render(value: "p-[3px]" = "w-[10px]"): "h-[20px]" { return "h-[20px]"; }',
  'const render = (value: "p-[3px]" = "w-[10px]"): "h-[20px]" => "h-[20px]"',
  'type Render<T = "w-[10px]"> = { [K in T & string]: "h-[20px]" }',
  'interface Styles { "w-[10px]": "h-[20px]" }; const cls = "w-[10px]" as const',
  'class View { ["p-[3px]"]: "w-[10px]" = "h-[20px]"; render<T = "gap-[4px]">(value: T) { return "mt-[2px]"; } }',
  'const cls = value === ("w-[10px]" as string) ? "h-[20px]" : "p-[3px]"',
  'const cls = value === ("w-[10px]" satisfies string) ? "h-[20px]" : "p-[3px]"',
  'enum Style { Name = "w-[10px]", Alt = "h-[20px]" }',
  // eslint-disable-next-line no-template-curly-in-string -- 验证模板类型的真实跨度。
  'type Classes = `w-[10px] ${"h-[20px]"} p-[3px]`',
]

export const jsxCases = [
  'const view = <view className="w-[10px]"> 中文😀 h-[20px] </view>',
  'const view = <view className={value === "w-[10px]" ? "h-[20px]" : "p-[3px]"}/>',
  'const view = <view className="w-&#91;10px&#93; h-[20px]"/>',
  'const view = <view className="w-[10px] &amp; h-[20px]">&nbsp;</view>',
  'const view = <view className={"w-[10px] &"}> &lt;h-[20px]&gt; </view>',
  'const view = <><view className="w-[10px]"/><view className="h-[20px]"/></>',
]

export function* sourceCases() {
  for (const lang of ['js', 'jsx', 'ts', 'tsx'] as const) {
    const sources = [...javascriptCases]
    if (lang === 'ts' || lang === 'tsx') {
      sources.push(...typescriptCases)
    }
    if (lang === 'jsx' || lang === 'tsx') {
      sources.push(...jsxCases)
    }
    for (const sourceType of ['script', 'module'] as const) {
      for (const preserveParens of [false, true]) {
        for (const source of sources) {
          yield { lang, sourceType, preserveParens, source }
        }
      }
    }
  }
}
