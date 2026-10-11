import { describe, expect, it } from 'vitest'
import { assertVersionPrApprovalEnvironment } from '../../../../scripts/ci/version-pr-approval.mjs'

const rule = { type: 'required_reviewers', reviewers: [{ type: 'User', reviewer: { id: 15621541 } }] }
const environment = { name: 'version-pr-ci', protection_rules: [rule] }

describe('版本 PR 的环境审批配置', () => {
  it('接受有效的 User 或 Team reviewer', () => {
    expect(() => assertVersionPrApprovalEnvironment(environment)).not.toThrow()
    expect(() => assertVersionPrApprovalEnvironment({ ...environment, protection_rules: [{ ...rule, reviewers: [{ type: 'Team', reviewer: { id: 1 } }] }] })).not.toThrow()
  })

  it.each([null, {}, { name: 'version-pr-ci' }, { ...environment, name: 'production' }, { ...environment, protection_rules: [] }])('环境未配置或身份错误时拒绝 %j', (data) => {
    expect(() => assertVersionPrApprovalEnvironment(data)).toThrow('required reviewers')
  })

  it.each([[], [{ type: 'User', reviewer: { id: 0 } }], [{ type: 'User', reviewer: { id: '1' } }], [{ type: 'Unknown', reviewer: { id: 1 } }], [null]])('缺少有效 reviewer 时拒绝 %j', (reviewers) => {
    expect(() => assertVersionPrApprovalEnvironment({ ...environment, protection_rules: [{ ...rule, reviewers }] })).toThrow()
  })

  it('允许其他保护规则共存但拒绝重复 reviewer 规则', () => {
    expect(() => assertVersionPrApprovalEnvironment({ ...environment, protection_rules: [{ type: 'branch_policy' }, rule] })).not.toThrow()
    expect(() => assertVersionPrApprovalEnvironment({ ...environment, protection_rules: [rule, rule] })).toThrow()
  })
})
