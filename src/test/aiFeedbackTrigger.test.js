import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../firebase-config', () => ({
  app: {},
  db: {},
  auth: {},
  storage: {},
}))

import { tryLocalIntentRoute } from '../utils/aiIntentRouter'

describe('Autonomous AI Feedback Processing Intent & Triggers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('correctly handles all variations of feedback review and pending status queries', () => {
    const emptyStore = {
      aiFeedbacks: [],
    }

    const queries = [
      'check feedback',
      'any feedback pending',
      'any feedback pending for processing?',
      'feedback status',
      'review feedback',
      'feedback check',
      'feedback queue',
      'run feedback',
    ]

    for (const q of queries) {
      const res = tryLocalIntentRoute(q, emptyStore)
      expect(res, `Failed for query "${q}"`).not.toBeNull()
      expect(res.handled).toBe(true)
      expect(res.type).toBe('feedback_status')
      expect(res.text).toContain('0 pending feedback requests')
      expect(res.chips.some((c) => c.action === 'open_feedback_modal')).toBe(true)
    }
  })

  it('displays pending feedbacks with immediate action chip to trigger AI processing', () => {
    const pendingStore = {
      aiFeedbacks: [
        {
          id: 'fb-101',
          message: 'Default rate for Maa Excellence is 55',
          status: 'pending_review',
        },
        {
          id: 'fb-102',
          message: 'Maruti caterers 4000 nung at Balaji party plot',
          status: 'pending_weekly_review',
          attachmentUrl: 'https://example.com/screenshot.jpg',
        },
      ],
    }

    const res = tryLocalIntentRoute('any feedback pending?', pendingStore)
    expect(res).not.toBeNull()
    expect(res.handled).toBe(true)
    expect(res.type).toBe('feedback_status')
    expect(res.text).toContain('Found 2 Pending Feedback Request')
    expect(res.text).toContain('Default rate for Maa Excellence is 55')
    expect(res.text).toContain('Maruti caterers 4000 nung at Balaji party plot')
    expect(res.text).toContain('📸 [Screenshot Attached]')
    expect(res.chips.some((c) => c.action === 'manual_feedback_check')).toBe(true)
  })
})
