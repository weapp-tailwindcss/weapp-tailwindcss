import process from 'node:process'

export function selectTarget(ids: string[], requested?: string) {
  if (requested) {
    if (!ids.includes(requested)) {
      throw new Error(`指定设备不可用：${requested}；实际目标：${ids.join(', ') || '无'}`)
    }
    return requested
  }
  if (ids.length !== 1) {
    throw new Error(`需要唯一明确的目标设备，当前：${ids.join(', ') || '无'}；请启动并显式指定设备 ID。`)
  }
  return ids[0]!
}

export function requestedTarget(keys: string[], generic: string[] = [], env: NodeJS.ProcessEnv = process.env) {
  const values = [...new Set(keys.map(key => env[key]).filter((value): value is string => Boolean(value) && !generic.includes(value!)))]
  if (values.length > 1) {
    throw new Error(`设备配置存在歧义：${keys.join(', ')}；目标=${values.join(', ')}`)
  }
  return values[0]
}

export function parseAdbDevices(output: string) {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^(\S+)\s+(device|offline|unauthorized)(?:\s|$)/)
    return match ? [{ id: match[1]!, state: match[2]! }] : []
  })
}

export function iosDestinationDevice(destination?: string) {
  if (destination === undefined) {
    return undefined
  }
  const fields = new Map<string, string>()
  for (const entry of destination.split(',')) {
    const separator = entry.indexOf('=')
    const key = entry.slice(0, separator).trim()
    const value = entry.slice(separator + 1).trim()
    if (separator < 1 || !value || fields.has(key)) {
      throw new Error('LYNX_IOS_DESTINATION 必须明确指定唯一的 platform=iOS Simulator,id=<设备 ID>。')
    }
    fields.set(key, value)
  }
  if (fields.get('platform') !== 'iOS Simulator' || !fields.get('id') || fields.has('name')) {
    throw new Error('LYNX_IOS_DESTINATION 必须通过 platform=iOS Simulator,id=<设备 ID> 绑定目标，不能按名称猜测。')
  }
  return fields.get('id')!
}

export function requestedIosTarget(keys: string[], env: NodeJS.ProcessEnv = process.env) {
  return requestedTarget([...keys, 'LYNX_IOS_DESTINATION'], ['simulator', 'booted'], {
    ...env,
    LYNX_IOS_DESTINATION: iosDestinationDevice(env['LYNX_IOS_DESTINATION']),
  })
}

export function iosSimulatorDestination(device: string, destination?: string) {
  const requested = iosDestinationDevice(destination)
  if (requested && requested !== device) {
    throw new Error(`LYNX_IOS_DESTINATION 与选定设备存在歧义：${requested} / ${device}`)
  }
  return destination ?? `platform=iOS Simulator,id=${device}`
}
