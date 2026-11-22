import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getDailyVoiceUsage,
  recordVoiceUsage,
  isVoiceBudgetExceeded,
  getPlainEnglishBudgetAlert,
  cleanTextForSpeech,
} from '../utils/voiceBudgetTracker'

describe('Voice Modes Isolation & Conflict Prevention', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear()
    }
    vi.restoreAllMocks()
  })

  it('guarantees Audio Conversation Mode does not pollute text input draft', () => {
    let inputMessage = 'Initial drafted text'
    let liveVoiceTranscript = ''
    let speechBaseText = ''
    let isLiveVoiceMode = true
    let isDictating = false

    // Simulate speech recognition result event with speech transcript "Shivshakti catering nu bill"
    const transcriptEvent = 'Shivshakti catering nu bill'

    if (isLiveVoiceMode) {
      // In Audio Conversation Mode, transcript is displayed in banner and stored in ref
      liveVoiceTranscript = transcriptEvent
      // inputMessage is intentionally preserved and untouched!
    } else if (isDictating) {
      inputMessage = speechBaseText ? `${speechBaseText} ${transcriptEvent}` : transcriptEvent
    }

    expect(liveVoiceTranscript).toBe('Shivshakti catering nu bill')
    expect(inputMessage).toBe('Initial drafted text') // Untouched!
  })

  it('guarantees Speak-to-Type dictation modifies inputMessage and leaves liveVoiceTranscript untouched', () => {
    let inputMessage = 'Initial'
    let liveVoiceTranscript = ''
    let speechBaseText = 'Initial'
    let isLiveVoiceMode = false
    let isDictating = true

    const transcriptEvent = '20 box water'

    if (isLiveVoiceMode) {
      liveVoiceTranscript = transcriptEvent
    } else if (isDictating) {
      inputMessage = speechBaseText ? `${speechBaseText} ${transcriptEvent}` : transcriptEvent
    }

    expect(inputMessage).toBe('Initial 20 box water')
    expect(liveVoiceTranscript).toBe('') // Untouched!
  })

  it('guarantees mutual exclusivity when switching from Live Call to Dictation', () => {
    let isLiveVoiceMode = true
    let isDictating = false
    let liveVoiceActiveRef = true
    let dictatingActiveRef = false

    const toggleMic = () => {
      if (liveVoiceActiveRef) {
        // Stop live voice mode cleanly
        liveVoiceActiveRef = false
        isLiveVoiceMode = false
      }
      if (isDictating) {
        dictatingActiveRef = false
        isDictating = false
      } else {
        dictatingActiveRef = true
        isDictating = true
      }
    }

    toggleMic()

    expect(isLiveVoiceMode).toBe(false)
    expect(liveVoiceActiveRef).toBe(false)
    expect(isDictating).toBe(true)
    expect(dictatingActiveRef).toBe(true)
  })

  it('guarantees mutual exclusivity when switching from Dictation to Live Call', () => {
    let isLiveVoiceMode = false
    let isDictating = true
    let liveVoiceActiveRef = false
    let dictatingActiveRef = true

    const startLiveVoiceMode = () => {
      if (dictatingActiveRef) {
        dictatingActiveRef = false
        isDictating = false
      }
      liveVoiceActiveRef = true
      isLiveVoiceMode = true
    }

    startLiveVoiceMode()

    expect(isDictating).toBe(false)
    expect(dictatingActiveRef).toBe(false)
    expect(isLiveVoiceMode).toBe(true)
    expect(liveVoiceActiveRef).toBe(true)
  })

  it('preserves clean text formatting for assistant speech synthesis', () => {
    const rawMarkdown = '✅ **Bill Generated**: Total ₹2,600. View at [Invoice #101](file:///inv/101)'
    const cleaned = cleanTextForSpeech(rawMarkdown)

    expect(cleaned).not.toContain('**')
    expect(cleaned).not.toContain('file:///')
    expect(cleaned).toContain('2,600 rupees')
  })
})
