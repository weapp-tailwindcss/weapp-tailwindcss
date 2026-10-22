/* eslint-disable node/prefer-global/process */
const OriginalHmrClient = require('weapp-tailwind-e2e-original-hmr-client')
const { createObservedHmrClient } = require('./hmr-observation.cjs')

module.exports = createObservedHmrClient(OriginalHmrClient, {
  runId: process.env.EXPO_PUBLIC_RN_HMR_RUN_ID,
  invocationId: process.env.EXPO_PUBLIC_RN_HMR_INVOCATION_ID,
})
