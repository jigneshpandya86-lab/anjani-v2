import test from 'node:test'
import assert from 'node:assert/strict'
import { __testables } from '../src/sms/smsSender.js'

test('buildSmsText returns leads template', () => {
  const text = __testables.buildSmsText({ messageIntent: 'ask_to_buy' })
  assert.match(text, /reminder from Anjani Water/i)
})

test('buildSmsText returns generic fallback for unknown intent', () => {
  const text = __testables.buildSmsText({ messageIntent: 'unknown' })
  assert.equal(text, 'Anjani Water notification.')
})
