interface SfcTransaction {
  settled: Promise<void>
  replaced: Promise<void>
  replace: () => void
  status: 'pending' | 'fulfilled' | 'rejected'
  error?: unknown
}

/** 保留当前事务的结算结果，读取方只追随最新完整 SFC。 */
export function createSfcStyleTransactions<T>() {
  const transactions = new Map<string, SfcTransaction>()
  return {
    run(id: string, transform: (isCurrent: () => boolean) => Promise<T>, publish: (value: T) => void) {
      let replace!: () => void
      const replaced = new Promise<void>((resolve) => {
        replace = resolve
      })
      const transaction: SfcTransaction = { settled: Promise.resolve(), replaced, replace, status: 'pending' }
      const isCurrent = () => transactions.get(id) === transaction
      // 先登记身份再开始工作，避免同步部分在事务登记前发布状态。
      const result = Promise.resolve().then(() => transform(isCurrent)).then((value) => {
        if (isCurrent()) {
          publish(value)
        }
        return value
      })
      // 主模块仍收到原始拒绝；结算记录只保留状态，不持有完整 SFC 结果。
      transaction.settled = result.then(() => {
        transaction.status = 'fulfilled'
      }, (error: unknown) => {
        transaction.status = 'rejected'
        transaction.error = error
      })
      const previous = transactions.get(id)
      transactions.set(id, transaction)
      previous?.replace()
      return result
    },
    async read<R>(id: string, read: () => R): Promise<R> {
      let transaction = transactions.get(id)
      while (transaction) {
        if (transaction.status === 'pending') {
          // 新事务开始后立即改等新事务，不被已过期的慢任务阻塞。
          await Promise.race([transaction.settled, transaction.replaced])
        }
        if (transactions.get(id) === transaction) {
          if (transaction.status === 'rejected') {
            throw transaction.error
          }
          // 身份核对与快照读取处于同一同步阶段，避免调用方 await 后读到旧版本。
          return read()
        }
        transaction = transactions.get(id)
      }
      return read()
    },
    invalidate(id: string) {
      const previous = transactions.get(id)
      transactions.delete(id)
      previous?.replace()
    },
  }
}
