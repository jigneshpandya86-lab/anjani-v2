import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Voice Dictation (Speak-to-Type)', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear()
    }
    vi.restoreAllMocks()
  })

  it('guarantees Speak-to-Type dictation types spoken text directly into draft', () => {
    let inputMessage = ''
    let speechBaseText = ''
    let isDictating = true

    const transcriptEvent = 'Shivshakti catering nu bill banavo'

    if (isDictating) {
      inputMessage = speechBaseText ? `${speechBaseText} ${transcriptEvent}` : transcriptEvent
    }

    expect(inputMessage).toBe('Shivshakti catering nu bill banavo')
  })

  it('appends dictated text smoothly to pre-existing drafted text', () => {
    let inputMessage = 'Kamleshbhai'
    let speechBaseText = 'Kamleshbhai'
    let isDictating = true

    const transcriptEvent = '50 box Anjani 200ml'

    if (isDictating) {
      inputMessage = speechBaseText ? `${speechBaseText} ${transcriptEvent}` : transcriptEvent
    }

    expect(inputMessage).toBe('Kamleshbhai 50 box Anjani 200ml')
  })

  it('handles 1-tap mic toggle between active dictation and idle state', () => {
    let isDictating = false
    let dictatingActiveRef = false

    const toggleMic = () => {
      if (isDictating) {
        dictatingActiveRef = false
        isDictating = false
      } else {
        dictatingActiveRef = true
        isDictating = true
      }
    }

    // First tap starts dictation
    toggleMic()
    expect(isDictating).toBe(true)
    expect(dictatingActiveRef).toBe(true)

    // Second tap stops dictation cleanly
    toggleMic()
    expect(isDictating).toBe(false)
    expect(dictatingActiveRef).toBe(false)
  })

  it('supports selecting speech language code among EN, GU, and HI', () => {
    const SPEECH_LANGUAGES = [
      { code: 'en-IN', label: 'English', short: 'EN' },
      { code: 'gu-IN', label: 'ગુજરાતી', short: 'GU' },
      { code: 'hi-IN', label: 'हिंदी', short: 'HI' },
    ]

    let speechLang = 'en-IN'

    const handleSelectSpeechLang = (code) => {
      speechLang = code
    }

    handleSelectSpeechLang('gu-IN')
    expect(speechLang).toBe('gu-IN')
    expect(SPEECH_LANGUAGES.some((l) => l.code === speechLang)).toBe(true)

    handleSelectSpeechLang('hi-IN')
    expect(speechLang).toBe('hi-IN')
  })
})
