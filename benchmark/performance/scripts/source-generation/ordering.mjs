export function comparisonBatches(confirmation = false, confirmationOf = 'first') {
  return confirmation
    ? [{ batch: 'confirmation', order: confirmationOf === 'second' ? ['before', 'after'] : ['after', 'before'], reverse: confirmationOf !== 'second' }]
    : [{ batch: 'first', order: ['before', 'after'], reverse: false }, { batch: 'second', order: ['after', 'before'], reverse: true }]
}
