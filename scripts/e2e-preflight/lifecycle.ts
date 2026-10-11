import process from 'node:process'

export function consumerAlive(consumer?: string, exists = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}) {
  const pid = Number(consumer?.match(/^(\d+):/)?.[1])
  return Number.isSafeInteger(pid) && pid > 0 && exists(pid)
}
