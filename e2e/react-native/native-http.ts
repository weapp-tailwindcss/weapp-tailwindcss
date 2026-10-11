import { get } from 'node:http'

export function getHttpText(url: string, timeout = 2_000) {
  return new Promise<string>((resolve, reject) => {
    const request = get(url, (response) => {
      response.setEncoding('utf8')
      let body = ''
      response.on('data', (chunk) => {
        body += chunk
      })
      response.on('end', () => resolve(body))
      response.on('error', reject)
    })
    request.setTimeout(timeout, () => request.destroy(new Error(`Timed out requesting ${url}`)))
    request.on('error', reject)
  })
}
