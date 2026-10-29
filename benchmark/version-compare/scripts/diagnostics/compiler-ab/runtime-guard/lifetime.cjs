function observeReferences(object, launch, resource, write) {
  if (!object) return
  for (const name of ['ref', 'unref']) {
    const original = object[name]
    if (typeof original !== 'function') continue
    object[name] = function (...args) {
      const result = original.apply(this, args)
      if (this === object) write('launch-reference', { launch, resource, referenced: name === 'ref' })
      return result
    }
  }
}

module.exports = { observeReferences }
