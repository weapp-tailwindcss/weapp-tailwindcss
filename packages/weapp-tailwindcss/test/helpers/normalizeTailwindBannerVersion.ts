import { postcss } from '@weapp-tailwindcss/postcss'

/** 快照仅固定 Tailwind 注释的版本号，保留原始 banner 合同及其他 CSS。 */
export function normalizeTailwindBannerVersion(css: string): string {
  const root = postcss.parse(css)
  root.walkComments((comment) => {
    comment.text = comment.text.replace(/^(!\s*tailwindcss v)[^\s|]+(?=\s+\|)/i, '$1<version>')
  })
  return root.toString()
}
