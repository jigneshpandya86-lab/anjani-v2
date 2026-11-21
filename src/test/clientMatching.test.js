import { describe, it, expect } from 'vitest'
import {
  getPhoneticKey,
  findMatchingClient,
  findBestExistingClientMatch,
  similarityRatio,
  levenshteinDistance,
  extractNameTokens,
  computeCandidateCoverage,
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

    it('matches customer by Zoho Books Display Name', () => {
      const clientsWithDisplay = [
        ...clients,
        { id: 'c5', name: 'Krishna Dairy', displayName: 'Krishna Dairy - Amit', contactPerson: 'Amit', mobile: '9988776655' },
      ]

      // Match by exact display name
      const match1 = findMatchingClient('Krishna Dairy - Amit', clientsWithDisplay)
      expect(match1).not.toBeNull()
      expect(match1.client.id).toBe('c5')
      expect(match1.canonicalName).toBe('Krishna Dairy - Amit')

      // Match by company name
      const match2 = findMatchingClient('Krishna Dairy', clientsWithDisplay)
      expect(match2).not.toBeNull()
      expect(match2.client.id).toBe('c5')

      // Match by contact person / substring in display name
      const match3 = findMatchingClient('Amit', clientsWithDisplay)
      expect(match3).not.toBeNull()
      expect(match3.client.id).toBe('c5')
    })

    it('matches customer by base alias when displayName has parentheses (e.g. Maa Excellence from Maa Excellence (Nirmalbhai))', () => {
      const clientsWithParen = [
        ...clients,
        { id: 'c-maa', name: 'Nirmalbhai', displayName: 'Maa Excellence (Nirmalbhai)', mobile: '9825123456' },
      ]

      // Match by base business name "Maa Excellence"
      const match1 = findMatchingClient('Maa Excellence', clientsWithParen)
      expect(match1).not.toBeNull()
      expect(match1.client.id).toBe('c-maa')
      expect(match1.matchType).toBe('exact')

      // Match by person name "Nirmalbhai"
      const match2 = findMatchingClient('Nirmalbhai', clientsWithParen)
      expect(match2).not.toBeNull()
      expect(match2.client.id).toBe('c-maa')

      // Match by full display name
      const match3 = findMatchingClient('Maa Excellence (Nirmalbhai)', clientsWithParen)
      expect(match3).not.toBeNull()
      expect(match3.client.id).toBe('c-maa')
    })

    it('isolates "Retail" and generic walk-in customers from matching unrelated clients (e.g. Dr. Rahul Vasava)', () => {
      const clientsWithDoctor = [
        ...clients,
        { id: 'c99', name: 'Dr. Rahul Vasava', mobile: '9426011111' },
      ]

      // When no exact "Retail" doc exists, Retail must return null (NEVER match Dr. Rahul Vasava!)
      const match1 = findMatchingClient('Retail', clientsWithDoctor)
      expect(match1).toBeNull()

      const match2 = findMatchingClient('retail', clientsWithDoctor)
      expect(match2).toBeNull()

      const match3 = findMatchingClient('Counter', clientsWithDoctor)
      expect(match3).toBeNull()

      // When an exact "Retail" customer document exists, it matches that exact Retail doc
      const clientsWithRetailDoc = [
        ...clientsWithDoctor,
        { id: 'c_retail', name: 'Retail', mobile: '' },
      ]
      const match4 = findMatchingClient('Retail', clientsWithRetailDoc)
      expect(match4).not.toBeNull()
      expect(match4.client.id).toBe('c_retail')
      expect(match4.client.name).toBe('Retail')
    })
  })

  describe('findBestExistingClientMatch', () => {
    const clients = [
      { id: 'c1', name: 'Sandip Patel', mobile: '9825012345', outstanding: 1200 },
      { id: 'c2', name: 'Jay Ambe Provision Store', mobile: '9925055555', outstanding: 0 },
      { id: 'c3', name: 'Rohitbhai Patel', mobile: '9876543210', outstanding: 4500 },
      { id: 'c4', name: 'Pooja Cold Drinks', mobile: '9123456789', outstanding: 0 },
    ]

    it('matches PARMAR DHRUMIL RAMJIBHAI to Drumil Bhai instead of AlpeshbhaiParmar even when surname candidates appear first', () => {
      const testClients = [
        { id: 'c2', name: 'AlpeshbhaiParmar', displayName: 'AlpeshbhaiParmar', mobile: '9925506269', outstanding: 0 },
        { id: 'c3', name: 'Raj Parmar', displayName: 'Raj Parmar', mobile: '918460247508', outstanding: 0 },
        { id: 'c1', name: 'Drumil Bhai', displayName: 'Drumil Bhai', mobile: '9712636271', outstanding: 0 },
      ]
      const match1 = findMatchingClient('PARMAR DHRUMIL RAMJIBHAI', testClients)
      expect(match1).not.toBeNull()
      expect(match1.client.name).toBe('Drumil Bhai')

      const best = findBestExistingClientMatch('PARMAR DHRUMIL RAMJIBHAI', testClients)
      expect(best.name).toBe('Drumil Bhai')
    })

    it('returns phonetic match (Sandeep -> Sandip Patel)', () => {
      const best = findBestExistingClientMatch('Sandeep Patel', clients)
      expect(best).toBeDefined()
      expect(best.id).toBe('c1')
    })

    it('matches by 10-digit phone extracted from raw string', () => {
      const best = findBestExistingClientMatch('UPI payment from 9876543210 via GPay', clients)
      expect(best).toBeDefined()
      expect(best.id).toBe('c3')
    })

    it('selects best possible match for token variations (e.g. "Rohit K Patel")', () => {
      const best = findBestExistingClientMatch('Rohit K Patel', clients)
      expect(best).toBeDefined()
      expect(best.id).toBe('c3')
    })

    it('never creates new client and returns best candidate even for approximate names', () => {
      const best = findBestExistingClientMatch('Jay Ambe Kirana Mart', clients)
      expect(best).toBeDefined()
      expect(best.id).toBe('c2')
    })

    it('falls back to client with outstanding balance if completely unrecognized text', () => {
      const best = findBestExistingClientMatch('XYZ Unknown 99999', clients)
      expect(best).toBeDefined()
      // Rohitbhai has the highest outstanding (4500)
      expect(best.id).toBe('c3')
    })

    it('returns null if rawName is empty, whitespace, or null without valid mobile', () => {
      expect(findBestExistingClientMatch('', clients)).toBeNull()
      expect(findBestExistingClientMatch('   ', clients)).toBeNull()
      expect(findBestExistingClientMatch(null, clients)).toBeNull()
      expect(findBestExistingClientMatch(undefined, clients)).toBeNull()
    })

    it('returns null if clients array is empty', () => {
      expect(findBestExistingClientMatch('Sandip', [])).toBeNull()
      expect(findBestExistingClientMatch('Sandip', null)).toBeNull()
    })
  })

  describe('extractNameTokens and computeCandidateCoverage (algorithmic, no hardcoding)', () => {
    it('splits camelCase/PascalCase properly without hardcoded word lists', () => {
      const tokens = extractNameTokens('AlpeshbhaiParmar')
      expect(tokens).toContain('alpesh')
      expect(tokens).toContain('parmar')
    })

    it('computes candidate coverage dynamically across unknown names', () => {
      const targetTokens = extractNameTokens('MUKHERJEE ARNAB SHYAMAL')
      const candidateArnab = extractNameTokens('Arnab')
      const candidateSanjay = extractNameTokens('Sanjay Mukherjee')

      const covArnab = computeCandidateCoverage(targetTokens, candidateArnab)
      const covSanjay = computeCandidateCoverage(targetTokens, candidateSanjay)

      // Arnab is 100% covered in target; Sanjay is only 50% covered (Sanjay is missing)
      expect(covArnab).toBeGreaterThan(covSanjay)
      expect(covArnab).toBeCloseTo(1.0, 1)
      expect(covSanjay).toBeCloseTo(0.5, 1)
    })
  })
})
