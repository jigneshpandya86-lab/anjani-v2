import { describe, it, expect } from 'vitest'
import {
  getPhoneticKey,
  findMatchingClient,
  similarityRatio,
  levenshteinDistance,
} from '../utils/clientMatchingUtils'

describe('clientMatchingUtils', () => {
  describe('getPhoneticKey', () => {
    it('normalizes Sandeep and Sandip to identical phonetic key', () => {
      expect(getPhoneticKey('Sandeep')).toBe(getPhoneticKey('Sandip'))
      expect(getPhoneticKey('Sandeep')).toBe('SANDIP')
    })

    it('handles honorific suffixes like bhai, ben, kumar', () => {
      expect(getPhoneticKey('Sandipbhai')).toBe(getPhoneticKey('Sandeep'))
      expect(getPhoneticKey('Rohitkumar')).toBe(getPhoneticKey('Rohit'))
      expect(getPhoneticKey('Nilesh Bhai')).toBe(getPhoneticKey('Neelesh'))
    })

    it('normalizes common Indian phonetic variations', () => {
      // ee vs i
      expect(getPhoneticKey('Pradeep')).toBe(getPhoneticKey('Pradip'))
      expect(getPhoneticKey('Kuldeep')).toBe(getPhoneticKey('Kuldip'))
      expect(getPhoneticKey('Heetesh')).toBe(getPhoneticKey('Hitesh'))

      // oo vs u
      expect(getPhoneticKey('Pooja')).toBe(getPhoneticKey('Puja'))
      expect(getPhoneticKey('Anoop')).toBe(getPhoneticKey('Anup'))

      // w vs v
      expect(getPhoneticKey('Waghodia')).toBe(getPhoneticKey('Vaghodia'))
      expect(getPhoneticKey('Vijay')).toBe(getPhoneticKey('Wijay'))

      // double consonants
      expect(getPhoneticKey('Pattel')).toBe(getPhoneticKey('Patel'))
    })

    it('strips common business descriptor words', () => {
      expect(getPhoneticKey('Jay Ambe Provision Store')).toBe(getPhoneticKey('Jay Ambe Kirana'))
      expect(getPhoneticKey('Royal Hotel & Restaurant')).toBe(getPhoneticKey('Royal Cafe'))
    })
  })

  describe('similarityRatio', () => {
    it('computes expected similarity', () => {
      expect(similarityRatio('test', 'test')).toBe(1)
      expect(similarityRatio('sandip', 'sandeep')).toBeGreaterThanOrEqual(0.7)
    })
  })

  describe('findMatchingClient', () => {
    const clients = [
      { id: 'c1', name: 'Sandip', mobile: '9825012345' },
      { id: 'c2', name: 'Jay Ambe Provision Store', mobile: '9925055555' },
      { id: 'c3', name: 'Rohitbhai Patel', mobile: '9876543210' },
      { id: 'c4', name: 'Pooja Cold Drinks', mobile: '9123456789' },
    ]

    it('matches "Sandeep" to existing "Sandip" phonetically', () => {
      const match = findMatchingClient('Sandeep', clients)
      expect(match).not.toBeNull()
      expect(match.matched).toBe(true)
      expect(match.client.id).toBe('c1')
      expect(match.client.name).toBe('Sandip')
      expect(match.matchType).toBe('phonetic')
    })

    it('matches "Sandipbhai" to "Sandip"', () => {
      const match = findMatchingClient('Sandipbhai', clients)
      expect(match).not.toBeNull()
      expect(match.client.id).toBe('c1')
    })

    it('matches mobile number with 100% confidence even if name differs', () => {
      const match = findMatchingClient('Random Name', clients, { mobile: '9825012345' })
      expect(match).not.toBeNull()
      expect(match.client.id).toBe('c1')
      expect(match.matchType).toBe('mobile')
      expect(match.confidence).toBe(1.0)
    })

    it('matches core business name "Jay Ambe" to "Jay Ambe Provision Store"', () => {
      const match = findMatchingClient('Jay Ambe', clients)
      expect(match).not.toBeNull()
      expect(match.client.id).toBe('c2')
      expect(match.client.name).toBe('Jay Ambe Provision Store')
    })

    it('matches "Puja" to "Pooja Cold Drinks"', () => {
      const match = findMatchingClient('Puja', clients)
      expect(match).not.toBeNull()
      expect(match.client.id).toBe('c4')
    })

    it('returns null for an entirely unknown client', () => {
      const match = findMatchingClient('Kailash Parbat Dhaba', clients)
      expect(match).toBeNull()
    })
  })
})
