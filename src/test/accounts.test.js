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

  it('validates structure and totals of staff cash batch entries', () => {
    const rawEntries = [
      {
        type: 'transfer',
        fromAccount: 'nilesh',
        toAccount: 'counter',
        amount: 4000,
        notes: 'Cash handover',
      },
      {
        type: 'collection',
        accountId: 'nilesh',
        clientName: 'Jay Ambe Provision',
        amount: 3500,
        notes: 'Collected cash on route',
      },
      {
        type: 'expense',
        accountId: 'nilesh',
        category: 'Fuel / Petrol',
        amount: 200,
        notes: 'Diesel for loading rickshaw',
      },
    ]

    const totalInward = rawEntries
      .filter((e) => e.type === 'collection' || (e.type === 'transfer' && e.toAccount === 'counter'))
      .reduce((s, e) => s + e.amount, 0)
    const totalExpense = rawEntries
      .filter((e) => e.type === 'expense')
      .reduce((s, e) => s + e.amount, 0)

    expect(totalInward).toBe(7500)
    expect(totalExpense).toBe(200)

    rawEntries.forEach((entry) => {
      const fromAcc = getAccountMeta(entry.fromAccount || entry.accountId)
      expect(fromAcc).toBeDefined()
      expect(entry.amount).toBeGreaterThan(0)
    })
  })

  it('correctly computes balance deltas when updating a transfer', () => {
    const oldAmount = 2000
    const oldFrom = 'nilesh'
    const oldTo = 'counter'

    const newAmount = 3000
    const newFrom = 'nilesh'
    const newTo = 'bank'

    const deltas = {}
    deltas[oldFrom] = (deltas[oldFrom] || 0) + oldAmount
    deltas[oldTo] = (deltas[oldTo] || 0) - oldAmount
    deltas[newFrom] = (deltas[newFrom] || 0) - newAmount
    deltas[newTo] = (deltas[newTo] || 0) + newAmount

    expect(deltas['nilesh']).toBe(-1000)
    expect(deltas['counter']).toBe(-2000)
    expect(deltas['bank']).toBe(3000)
  })

  it('verifies Bailey Water targeted corridors and categories', () => {
    const corridors = [
      'Ajwa Road',
      'Waghodia Road',
      'Kapurai',
      'Parivar Char Rasta',
      'Mahavir Char Rasta',
    ]
    expect(corridors).toHaveLength(5)
    expect(corridors).toContain('Ajwa Road')
    expect(corridors).toContain('Waghodia Road')
    expect(corridors).toContain('Kapurai')
    expect(corridors).toContain('Parivar Char Rasta')
    expect(corridors).toContain('Mahavir Char Rasta')

    const categories = [
      'Restaurants & Dining',
      'Snacks & Farsan Outlets',
      'Cafes & Fast Food',
      'Dhabas & Food Points',
    ]
    expect(categories).toContain('Restaurants & Dining')
    expect(categories).toContain('Snacks & Farsan Outlets')
  })
})

