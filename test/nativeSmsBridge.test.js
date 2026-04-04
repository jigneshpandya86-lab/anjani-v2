import test from 'node:test'
import assert from 'node:assert/strict'
import { isNativeSmsAvailable, sendSmsNative } from '../src/sms/nativeSmsBridge.js'

test('isNativeSmsAvailable detects plugin send function', () => {
  globalThis.window = {
    Capacitor: {
      Plugins: {
        SmsBackground: {
          send: async () => ({ success: true, message: 'ok' }),
        },
      },
    },
  }

  assert.equal(isNativeSmsAvailable(), true)
})

test('sendSmsNative normalizes object response', async () => {
  globalThis.window = {
    Capacitor: {
      Plugins: {
        SmsBackground: {
          send: async () => ({ success: false, message: 'denied' }),
        },
      },
    },
  }

  const result = await sendSmsNative({ to: '9999999999', body: 'Hello' })
  assert.deepEqual(result, { success: false, message: 'denied' })
})
