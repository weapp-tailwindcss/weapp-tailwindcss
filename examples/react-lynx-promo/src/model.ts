export const buildStates = [
  { label: 'Scanning source', progress: '42%', detail: '184 static candidates' },
  { label: 'Encoding CSS', progress: '76%', detail: 'Rspeedy module graph' },
  { label: 'Bundle ready', progress: '100%', detail: 'main.lynx.bundle' },
] as const

export const recentBuilds = [
  { branch: 'feat/lynx-dashboard', duration: '1.24s', utilities: '184', status: 'Ready' },
  { branch: 'main', duration: '1.31s', utilities: '176', status: 'Ready' },
  { branch: 'docs/native-guide', duration: '1.18s', utilities: '168', status: 'Ready' },
] as const

export function nextBuildState(current: number) {
  return (current + 1) % buildStates.length
}
