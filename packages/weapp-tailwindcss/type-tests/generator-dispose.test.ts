import type { TailwindV4Engine, WeappTailwindcssGenerator } from '../src/generator'

type Disposer = NonNullable<TailwindV4Engine['dispose']>

const synchronous: Disposer = () => {}
const asynchronous: Disposer = async () => {}
// 原有同步消费方式仍接受可等待的关闭函数。
const legacyConsumer: () => void = asynchronous

function waitForGenerator(generator: WeappTailwindcssGenerator) {
  const result: void | Promise<void> = generator.dispose?.()
  return Promise.resolve(result)
}

void [synchronous, asynchronous, legacyConsumer, waitForGenerator]
