function findLeadingImportInsertionIndex(css: string) {
  const importPattern = /(?:^|\n)\s*@import\b[^;]*;/g
  let insertionIndex = 0
  let match = importPattern.exec(css)
  while (match !== null) {
    insertionIndex = match.index + match[0].length
    match = importPattern.exec(css)
  }
  return insertionIndex
}

export function insertTailwindThemeCss(css: string, themeCss: string) {
  const insertionIndex = findLeadingImportInsertionIndex(css)
  if (insertionIndex === 0) {
    return `${themeCss}\n${css}`
  }
  return `${css.slice(0, insertionIndex)}\n${themeCss}\n${css.slice(insertionIndex)}`
}
