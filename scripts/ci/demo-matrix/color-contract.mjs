import assert from 'node:assert/strict'

export function assertRenderedColors(item, evidence, round) {
  for (const [key, reference] of Object.entries(item.renderedColors ?? {})) {
    const label = `${item.id}: ${round} rendered ${key}/${reference.property}`
    const observation = evidence?.[key]
    assert.equal(observation?.reference, reference.value, label)
    for (const samples of [observation?.actual, observation?.expected]) {
      assert.ok(Array.isArray(samples) && samples.length === 4 && Array.from(samples).every(value => Number.isInteger(value) && value >= 0 && value <= 255), label)
    }
    assert.deepEqual(observation.actual, observation.expected, label)
  }
}
