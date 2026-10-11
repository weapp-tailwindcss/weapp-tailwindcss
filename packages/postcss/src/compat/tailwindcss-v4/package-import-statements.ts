const tailwindcssCssImportStatementRE = /(@import\s+(?:url\(\s*)?)(["'])((?:tailwindcss|weapp-tailwindcss)(?:\/[^"']*)?\$?)(\2\s*\)?)/gi

export function rewriteTailwindPackageImportStatements(
  code: string,
  resolve: (specifier: string) => string | null | undefined,
) {
  let hasReplacements = false
  const rewritten = code.replace(
    tailwindcssCssImportStatementRE,
    (full, prefix: string, quote: string, specifier: string, suffix: string) => {
      const replacement = resolve(specifier)
      if (!replacement) {
        return full
      }
      hasReplacements = true
      return `${prefix}${quote}${replacement}${suffix}`
    },
  )
  return hasReplacements ? rewritten : undefined
}
