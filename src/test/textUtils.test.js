import { describe, it, expect } from 'vitest'
import {
  normalizeDigits,
  hasIndicScript,
  transliterateIndicToEnglish,
  ensureEnglishText,
  sanitizeClientForEnglish,
} from '../utils/textUtils'

describe('textUtils - English Enforcement & Indic Transliteration', () => {
  it('normalizes Gujarati and Hindi digits to standard 0-9', () => {
    expect(normalizeDigits('૯૮૨૫૯૯૭૭૫૦')).toBe('9825997750')
    expect(normalizeDigits('९८२५००११२२')).toBe('9825001122')
    expect(normalizeDigits('Shop ૦૫, Block ૨')).toBe('Shop 05, Block 2')
  })

  it('detects Indic script accurately', () => {
    expect(hasIndicScript('શ્રી ગણેશ')).toBe(true)
    expect(hasIndicScript('श्री गणेश')).toBe(true)
    expect(hasIndicScript('Royal Hotel & Restaurant')).toBe(false)
    expect(hasIndicScript('9825997750')).toBe(false)
  })

  it('transliterates Gujarati business names and addresses to English', () => {
    const res1 = transliterateIndicToEnglish('શ્રી ગણેશ પ્રોવિઝન સ્ટોર')
    expect(res1).toBe('Shree Ganesh Provision Store')

    const res2 = transliterateIndicToEnglish('જય અંબે ડેરી અને આઈસ્ક્રીમ પાર્લર, માંજલપુર')
    expect(res2).toContain('Jay Ambe Dairy & Ice Cream Parlour, Manjalpur')

    const res3 = transliterateIndicToEnglish('દુકાન નં. ૧૨, શિવ શક્તિ કોમ્પ્લેક્સ, વાઘોડિયા રોડ')
    expect(res3).toContain('Shop No. 12')
    expect(res3).toContain('Shiv Shakti Complex')
    expect(res3).toContain('Waghodia Road')
  })

  it('transliterates Devanagari (Hindi) business names to English', () => {
    const res = transliterateIndicToEnglish('श्री महालक्ष्मी सुपर मार्केट, अजवा रोड')
    expect(res).toContain('Shree Mahalakshmi Super Market, Ajwa Road')
  })

  it('ensures text is returned in English script only', () => {
    expect(ensureEnglishText('Royal Hotel')).toBe('Royal Hotel')
    expect(ensureEnglishText('શ્રી રામ પ્રોવિઝન')).toContain('Shree')
    expect(ensureEnglishText('શ્રી રામ પ્રોવિઝન')).toContain('Provision')
    expect(hasIndicScript(ensureEnglishText('શ્રી રામ પ્રોવિઝન'))).toBe(false)
  })

  it('sanitizes full client objects ensuring English fields', () => {
    const rawClient = {
      name: 'શ્રી ગણેશ પ્રોવિઝન સ્ટોર',
      mobile: '૯૮૨૫૯૯૭૭૫૦',
      address: 'માંજલપુર ચાર રસ્તા સામે, વડોદરા',
      location: 'માંજલપુર',
      rate: 65,
      notes: 'રોકડ પેમેન્ટ',
    }

    const sanitized = sanitizeClientForEnglish(rawClient)

    expect(sanitized.name).toBe('Shree Ganesh Provision Store')
    expect(sanitized.mobile).toBe('9825997750')
    expect(sanitized.address).toContain('Manjalpur Char Rasta Opp., Vadodara')
    expect(sanitized.location).toBe('Manjalpur')
    expect(hasIndicScript(sanitized.name)).toBe(false)
    expect(hasIndicScript(sanitized.address)).toBe(false)
    expect(hasIndicScript(sanitized.notes)).toBe(false)
  })
})
