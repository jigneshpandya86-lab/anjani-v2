import { describe, it, expect } from 'vitest'
import { DEFAULT_ACCOUNTS, getAccountMeta } from '../constants/accounts'

describe('Accounts Constants & Helpers', () => {
  it('defines the 4 canonical accounts', () => {
    expect(DEFAULT_ACCOUNTS.length).toBe(4)
    const ids = DEFAULT_ACCOUNTS.map((a) => a.id)
    expect(ids).toContain('nilesh')
    expect(ids).toContain('hiteshbhai')
    expect(ids).toContain('counter')
    expect(ids).toContain('bank')
  })

  it('correctly marks Nilesh and Hiteshbhai as custody accounts', () => {
    const nilesh = DEFAULT_ACCOUNTS.find((a) => a.id === 'nilesh')
    const hiteshbhai = DEFAULT_ACCOUNTS.find((a) => a.id === 'hiteshbhai')
    expect(nilesh.type).toBe('custody')
    expect(hiteshbhai.type).toBe('custody')
  })

  it('getAccountMeta returns metadata for known and fallback accounts', () => {
    const nileshMeta = getAccountMeta('nilesh')
    expect(nileshMeta.name).toBe('Nilesh')
    expect(nileshMeta.color).toBe('#2563eb')

    const fallbackMeta = getAccountMeta('unknown_acc')
    expect(fallbackMeta.id).toBe('unknown_acc')
    expect(fallbackMeta.name).toBe('UNKNOWN_ACC')
  })
})
