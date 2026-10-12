const fields = new Set(['claim', 'kind', 'status', 'sha', 'environment', 'command', 'url', 'reason'])
const isText = value => typeof value === 'string' && value.trim().length > 0

function isHttpsUrl(value) {
  if (!isText(value) || !/^https:\/\//i.test(value) || /\s/.test(value)) {
    return false
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname)
  }
  catch {
    return false
  }
}

/** 只检查证据记录结构，不执行命令、不查询远端，也不推断结论成立。 */
export function validateVerification(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return ['verification 必须是非空记录数组']
  }
  const errors = []
  records.forEach((record, index) => {
    // 面向文档作者使用从 1 开始的位置，仓库入口再补上文件名。
    const at = `verification[${index + 1}]`
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push(`${at} 必须是对象`)
      return
    }
    for (const key of Object.keys(record)) {
      if (!fields.has(key)) {
        errors.push(`${at}.${key} 是未知字段`)
      }
    }
    for (const key of ['claim', 'environment']) {
      if (!isText(record[key])) {
        errors.push(`${at}.${key} 必须是非空字符串`)
      }
    }
    if (!['unit', 'integration', 'ci', 'native'].includes(record.kind)) {
      errors.push(`${at}.kind 必须是 unit、integration、ci 或 native`)
    }
    if (!['passed', 'failed', 'pending'].includes(record.status)) {
      errors.push(`${at}.status 必须是 passed、failed 或 pending`)
    }
    if (typeof record.sha !== 'string' || record.sha.length !== 40 || !/^[a-f\d]{40}$/i.test(record.sha)) {
      errors.push(`${at}.sha 必须是完整 SHA`)
    }
    for (const key of ['command', 'reason']) {
      if (Object.hasOwn(record, key) && !isText(record[key])) {
        errors.push(`${at}.${key} 必须是非空字符串`)
      }
    }
    if (Object.hasOwn(record, 'url') && !isHttpsUrl(record.url)) {
      errors.push(`${at}.url 必须是完整 HTTPS URL`)
    }
    if (['passed', 'failed'].includes(record.status) && !isText(record.command) && !isHttpsUrl(record.url)) {
      errors.push(`${at} 已执行记录必须提供 command 或 url`)
    }
    if (record.status === 'pending' && !isText(record.reason)) {
      errors.push(`${at}.reason 待验收记录必须说明原因`)
    }
  })
  return errors
}
