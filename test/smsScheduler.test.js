import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSmsJobsFromConfig, TASK_TYPES } from '../src/sms/smsScheduler.js'

test('buildSmsJobsFromConfig returns empty when task is inactive', () => {
  const jobs = buildSmsJobsFromConfig({
    taskType: TASK_TYPES.LEADS,
    entityId: 'lead-1',
    recipientMobile: '9999999999',
    occurredAt: new Date('2026-01-01T00:00:00Z'),
    config: { active: false, atEvent: true },
  })

  assert.equal(jobs.length, 0)
})

test('buildSmsJobsFromConfig creates all configured schedule rows including recurring every 30', () => {
  const jobs = buildSmsJobsFromConfig({
    taskType: TASK_TYPES.PAYMENTS,
    entityId: 'client-1',
    recipientMobile: '9999999999',
    occurredAt: new Date('2026-01-01T00:00:00Z'),
    config: {
      active: true,
      atEvent: true,
      weekly: true,
      day15: true,
      day30: true,
      every30After: true,
    },
    horizonDays: 120,
  })

  // atEvent + weekly + day15 + day30 + day60 + day90 + day120
  assert.equal(jobs.length, 7)
  assert.equal(jobs[0].messageIntent, 'ask_for_payment')
  assert.ok(jobs.every((job) => job.dedupeKey.includes('client-1')))
})
