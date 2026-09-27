import { describe, it, expect, beforeEach } from 'vitest'

const VALID_TABS = [
  'orders',
  'clients',
  'payments',
  'stock',
  'expenses',
  'tasks',
  'accounts',
  'intelligence',
  'celebrations',
  'leads',
  'settings',
  'bailey-order',
]

const TAB_STORAGE_KEY = 'anjani_active_tab'

const getInitialTab = () => {
  if (typeof window === 'undefined') return 'orders'
  const hash = window.location.hash.replace(/^#\/?/, '').trim()
  if (VALID_TABS.includes(hash)) {
    return hash
  }
  try {
    const saved = localStorage.getItem(TAB_STORAGE_KEY)
    if (saved && VALID_TABS.includes(saved)) {
      return saved
    }
  } catch {
    // localStorage unavailable or restricted
  }
  return 'orders'
}

describe('Tab routing and persistence', () => {
  beforeEach(() => {
    window.location.hash = ''
    localStorage.clear()
  })

  it('defaults to orders tab when no hash and no localStorage exists', () => {
    expect(getInitialTab()).toBe('orders')
  })

  it('restores leads tab when page is reloaded with #leads hash', () => {
    window.location.hash = '#leads'
    expect(getInitialTab()).toBe('leads')
  })

  it('restores leads tab from localStorage even if URL hash is missing', () => {
    window.location.hash = ''
    localStorage.setItem(TAB_STORAGE_KEY, 'leads')
    expect(getInitialTab()).toBe('leads')
  })

  it('prioritizes valid URL hash over localStorage if they diverge', () => {
    window.location.hash = '#payments'
    localStorage.setItem(TAB_STORAGE_KEY, 'leads')
    expect(getInitialTab()).toBe('payments')
  })

  it('ignores invalid hash or localStorage keys and falls back to orders', () => {
    window.location.hash = '#invalid-random-tab'
    localStorage.setItem(TAB_STORAGE_KEY, 'nonexistent')
    expect(getInitialTab()).toBe('orders')
  })
})
