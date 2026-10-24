/** 服务代际按实际 entry 身份关联，key 相同不能合并不同 entry。 */
export function verifyServiceEvidence(events) {
  const starts = new Map()
  const creations = new Map()
  const services = new Map()
  const leases = new Map()
  function matching(actual, expected, keys) {
    if (!expected || keys.some(key => actual[key] !== expected[key])) {
      throw new Error('服务操作身份与 acquire 不一致')
    }
  }
  for (const { name, sequence, details } of events) {
    if (name.endsWith('.start')) {
      starts.set(sequence, details)
    }
    if (name === 'service.create.success') {
      const start = starts.get(details.operationId)
      if (!start || !Number.isInteger(details.resultId)) {
        throw new Error('服务创建缺少身份关联')
      }
      creations.set(details.resultId, { ...start, serviceGeneratorId: details.resultId })
    }
    else if (name === 'service.lookup.success' && details.resultId !== undefined) {
      matching(starts.get(details.operationId), services.get(details.resultId), ['ownerId', 'key'])
    }
    else if (name === 'service.acquire') {
      if (['ownerId', 'serviceId', 'serviceGeneratorId', 'leaseId', 'generatorId'].some(key => !Number.isInteger(details[key]) || details[key] < 1)
        || typeof details.key !== 'string' || !Number.isInteger(details.references) || details.references < 1) {
        throw new Error('服务 acquire 身份或引用计数缺失')
      }
      if (leases.has(details.leaseId)) {
        throw new Error('服务租约重复 acquire')
      }
      matching(details, creations.get(details.serviceGeneratorId), ['ownerId', 'key', 'serviceGeneratorId'])
      const service = services.get(details.serviceId)
      if (service) {
        matching(details, service, ['ownerId', 'key', 'serviceGeneratorId'])
        if (service.retired) {
          throw new Error('已退役服务再次 acquire')
        }
      }
      else {
        services.set(details.serviceId, { ...details, retired: false })
      }
      leases.set(details.leaseId, { ...details, released: false })
    }
    else if (name === 'service.matches.success') {
      const start = starts.get(details.operationId)
      if (!start || typeof details.result !== 'boolean') {
        throw new Error('服务 matches 缺少实际布尔结果')
      }
      if (start.leaseId !== undefined) {
        const lease = leases.get(start.leaseId)
        matching(start, lease, ['ownerId', 'serviceId', 'serviceGeneratorId', 'leaseId', 'generatorId', 'key'])
        if (details.result && (lease.released || services.get(lease.serviceId).retired)) {
          throw new Error('已释放或退役租约不能 matches 成功')
        }
      }
      else if (details.result) {
        throw new Error('未知租约不能 matches 成功')
      }
    }
    else if (name === 'service.release.start') {
      const lease = leases.get(details.leaseId)
      matching(details, lease, ['ownerId', 'serviceId', 'serviceGeneratorId', 'leaseId', 'key'])
      if (lease.released) {
        throw new Error('服务租约重复实际释放')
      }
      lease.released = true
    }
    else if (name === 'service.retire.start' || name === 'service.dispose.start') {
      const service = services.get(details.serviceId)
      matching(details, service, ['ownerId', 'key'])
      if (name === 'service.retire.start') {
        service.retired = true
      }
    }
  }
  return { services: services.size, leases: leases.size, releasedLeases: [...leases.values()].filter(lease => lease.released).length }
}
