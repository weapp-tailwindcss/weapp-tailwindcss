/** 拒绝未配置 reviewer 的环境，避免空保护环境直接启动完整 CI。 */
export function assertVersionPrApprovalEnvironment(environment) {
  const rules = environment?.protection_rules
  const reviewers = Array.isArray(rules) && rules.filter(rule => rule?.type === 'required_reviewers')
  if (environment?.name !== 'version-pr-ci' || !reviewers || reviewers.length !== 1
    || !Array.isArray(reviewers[0].reviewers) || reviewers[0].reviewers.length === 0
    || reviewers[0].reviewers.some(entry => !['User', 'Team'].includes(entry?.type)
      || !Number.isSafeInteger(entry?.reviewer?.id) || entry.reviewer.id <= 0)) {
    throw new Error('version-pr-ci 必须配置有效的 required reviewers；审批配置缺失时禁止启动正式 CI')
  }
}
