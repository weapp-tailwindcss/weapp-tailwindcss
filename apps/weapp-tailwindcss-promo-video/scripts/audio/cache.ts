import fs from 'node:fs/promises'
import { validateWords } from './subtitles'

export async function voiceCacheValid(file: string, stamp: string, wordsFile: string, signature: string, text: string) {
  try {
    if (await fs.readFile(stamp, 'utf8') !== signature || (await fs.stat(file)).size === 0) {
      return false
    }
    validateWords(JSON.parse(await fs.readFile(wordsFile, 'utf8')), text)
    return true
  }
  catch {
    return false
  }
}
